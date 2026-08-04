import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { ChatService } from './chat.service';
import {
  AdminCall, CallHubEvent, CallJoin, CallLayout, CallMedia, CallPhase, CallRoom, CallSignalKind,
  CallHistoryEntry, IceServer, PeerStats, PeerView,
} from '../models/call.models';
import { MeetingJoin } from '../models/meeting.models';

/** `setSinkId` (choose the output device) still isn't in TypeScript's DOM lib. */
type SinkCapable = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };

/** The stats fields we read; `RTCStats` is an open bag, so this is the narrow view we need. */
interface StatLike {
  type: string;
  kind?: string;
  state?: string;
  nominated?: boolean;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
  bytesReceived?: number;
  bytesSent?: number;
  packetsLost?: number;
  audioLevel?: number;
}

/**
 * Everything we hold for one remote participant. Calls are a **mesh**: one RTCPeerConnection and one
 * audio sink per peer, so N-1 of these while a call is up.
 */
interface Peer {
  userId: string;
  pc: RTCPeerConnection;
  sink: SinkCapable | null;
  /** Perfect-negotiation politeness, decided per pair so both ends can't be impolite. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  remoteReady: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  lastBytes: { in: number; out: number };
}

const VOLUME_KEY = 'admin.call.volume';
const SPEAKER_KEY = 'admin.call.speaker';
const MIC_KEY = 'admin.call.mic';
const CAMERA_KEY = 'admin.call.camera';

/**
 * Group audio/video calls over WebRTC.
 *
 * Transport is a **full mesh**: every participant connects directly to every other, so media never
 * touches the server and stays end-to-end encrypted (DTLS-SRTP). That is also why the roster is capped
 * server-side — each extra person costs everyone another upstream. The server only relays
 * offer/answer/ICE (over `api/calls`, pushed back down the chat hub) and keeps the roster.
 *
 * Who offers to whom is decided by one rule, so there is no glare: **whoever is already in the call
 * offers to the person who just joined.** Mid-call changes (camera on) use perfect negotiation, with the
 * newer participant as the polite peer.
 *
 * Root-provided and mounted by the app shell, so a call rings on any admin page.
 */
@Injectable({ providedIn: 'root' })
export class CallService {
  private http = inject(HttpClient);
  private chat = inject(ChatService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);
  private readonly base = environment.apiUrl;

  readonly phase = signal<CallPhase>('idle');
  readonly room = signal<CallRoom | null>(null);
  readonly roomId = signal<string | null>(null);
  readonly title = signal('');
  readonly media = signal<CallMedia>('audio');
  readonly muted = signal(false);
  readonly cameraOn = signal(false);
  readonly layout = signal<CallLayout>('gallery');
  /** Talk time in seconds, from the moment the first peer connects. */
  readonly elapsed = signal(0);
  /** Why the overlay is showing what it is: an error, or "Call ended · 1:04". */
  readonly message = signal<string | null>(null);

  /** One entry per remote participant currently connected or connecting. */
  readonly peers = signal<PeerView[]>([]);
  readonly localPreview = signal<MediaStream | null>(null);

  readonly volume = signal(loadVolume());
  readonly speakers = signal<MediaDeviceInfo[]>([]);
  readonly microphones = signal<MediaDeviceInfo[]>([]);
  readonly cameras = signal<MediaDeviceInfo[]>([]);
  readonly speakerId = signal(localStorage.getItem(SPEAKER_KEY) ?? '');
  readonly micId = signal(localStorage.getItem(MIC_KEY) ?? '');
  readonly cameraId = signal(localStorage.getItem(CAMERA_KEY) ?? '');
  /** The browser refused to play audio without a gesture — the UI offers an "enable sound" button. */
  readonly needsSoundUnlock = signal(false);
  /** Our own mic level (0..1) so you can see that you're being picked up. */
  readonly micLevel = signal(0);

  readonly busy = computed(() => this.phase() !== 'idle');
  readonly onCall = computed(() => this.phase() === 'active');
  readonly isVideo = computed(() => this.media() === 'video');
  readonly canSelectSpeaker = computed(() => this.speakers().length > 1);
  /** How many people are on the call, including you. */
  readonly joinedCount = computed(() => this.room()?.joinedCount ?? 0);
  readonly ringingCount = computed(() =>
    this.room()?.participants.filter(p => p.state === 'invited').length ?? 0);
  readonly roster = computed(() => this.room()?.participants ?? []);

  private myId = '';
  private peerMap = new Map<string, Peer>();
  /** What we send: audio plus, once the camera is on, video. */
  private localMedia: MediaStream | null = null;
  private iceServers: RTCIceServer[] = [];
  private ticker: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private unlockListener: (() => void) | null = null;
  private readonly ringer = new Ringer();

  constructor() {
    this.chat.calls$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => void this.onHubEvent(event));

    effect(() => { this.myId = this.auth.user()?.id ?? ''; });

    // Signing out must release the microphone and camera, not leave them running headless.
    effect(() => {
      if (!this.auth.isAuthenticated() && this.busy()) {
        this.teardown();
        this.clearResetTimer();
        this.message.set(null);
        this.phase.set('idle');
      }
    });

    // Keep every peer's sink in step with the volume slider (and remember the choice).
    effect(() => {
      const level = this.volume();
      localStorage.setItem(VOLUME_KEY, String(level));
      for (const peer of this.peerMap.values()) if (peer.sink) peer.sink.volume = level;
    });
  }

  // ---- Starting, joining, leaving ----

  /**
   * Starts a call in a conversation — ringing the other person in a 1:1 thread, or everyone in a group.
   * `postSummary` opts into the per-person breakdown being posted to the thread afterwards.
   */
  async start(conversationId: string, title: string, media: CallMedia = 'audio', postSummary = false): Promise<void> {
    if (this.busy()) return;
    this.message.set(null);
    this.media.set(media);
    this.title.set(title);

    // Ask for devices first: a denial should not ring everyone.
    if (!await this.acquireMedia(media === 'video')) return;

    this.phase.set('outgoing');
    this.ringer.startOutgoing();
    try {
      const join = await firstValueFrom(this.http.post<CallJoin>(`${this.base}/calls`,
        { conversationId, media, postSummary }));
      this.applyJoin(join);
    } catch (e) {
      this.abort(this.errorText(e, 'Could not place the call.'));
    }
  }

  /** Answers a ringing call. */
  async accept(): Promise<void> {
    const id = this.roomId();
    if (!id || this.phase() !== 'incoming') return;
    this.ringer.stop();
    if (!await this.acquireMedia(this.isVideo())) {
      this.http.post(`${this.base}/calls/${id}/decline`, {}).subscribe({ error: () => {} });
      return;
    }

    this.phase.set('connecting');
    try {
      this.applyJoin(await firstValueFrom(this.http.post<CallJoin>(`${this.base}/calls/${id}/join`, {})));
    } catch (e) {
      this.abort(this.errorText(e, 'Could not join the call.'));
    }
  }

  /** Joins a scheduled meeting's room (the Meetings page calls this). */
  async joinMeeting(meetingId: string, media: CallMedia): Promise<void> {
    if (this.busy()) return;
    this.message.set(null);
    this.media.set(media);
    if (!await this.acquireMedia(media === 'video')) return;

    this.phase.set('connecting');
    try {
      const result = await firstValueFrom(this.http.post<MeetingJoin>(`${this.base}/meetings/${meetingId}/join`, {}));
      this.title.set(result.meeting.title);
      this.applyJoin(result.call);
    } catch (e) {
      this.abort(this.errorText(e, 'Could not join the meeting.'));
    }
  }

  decline(): void {
    const id = this.roomId();
    if (!id) return;
    this.http.post(`${this.base}/calls/${id}/decline`, {}).subscribe({ error: () => {} });
    this.teardown();
    this.phase.set('idle');
  }

  /** Leaves the call. Everyone else carries on unless you were the last pair. */
  hangUp(): void {
    const id = this.roomId();
    if (!id) { this.teardown(); this.phase.set('idle'); return; }
    this.http.post(`${this.base}/calls/${id}/leave`, {}).subscribe({ error: () => {} });
    const seconds = this.elapsed();
    this.teardown();
    this.showEnded(seconds > 0 ? `Call ended · ${formatDuration(seconds)}` : 'Call cancelled');
  }

  /** Pulls someone else into the live call (the "add by searching" path). */
  addParticipant(userId: string): void {
    const id = this.roomId();
    if (!id) return;
    this.http.post(`${this.base}/calls/${id}/invite`, { userId }).subscribe({
      error: (e: HttpErrorResponse) => this.message.set(e.error?.error ?? 'Could not add them to the call.'),
    });
  }

  // ---- Devices & controls ----

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    this.localMedia?.getAudioTracks().forEach(track => { track.enabled = !next; });
  }

  /** Turns the camera on (upgrading an audio call to video for everyone) or off. */
  async toggleCamera(): Promise<void> {
    if (!this.onCall() && this.phase() !== 'connecting') return;
    if (this.cameraOn()) {
      // Keep the track (and the negotiated m-line) but stop sending pictures.
      this.localMedia?.getVideoTracks().forEach(track => { track.enabled = false; });
      this.cameraOn.set(false);
      return;
    }
    await this.enableCamera();
  }

  toggleLayout(): void {
    this.layout.update(l => (l === 'pip' ? 'gallery' : 'pip'));
  }

  setVolume(level: number): void {
    this.volume.set(Math.min(1, Math.max(0, level)));
  }

  volumeUp(): void { this.setVolume(Math.round((this.volume() + 0.1) * 10) / 10); }
  volumeDown(): void { this.setVolume(Math.round((this.volume() - 0.1) * 10) / 10); }

  /** Sends audio to a different speaker/headset (Chromium only; hidden elsewhere). */
  async selectSpeaker(deviceId: string): Promise<void> {
    this.speakerId.set(deviceId);
    localStorage.setItem(SPEAKER_KEY, deviceId);
    for (const peer of this.peerMap.values()) await this.applySinkDevice(peer);
  }

  /**
   * Switches camera mid-call (a second webcam, or front/back on a phone). Uses `replaceTrack`, so the
   * m-line stays as negotiated — the other side just sees the picture change, with no renegotiation.
   */
  async selectCamera(deviceId: string): Promise<void> {
    this.cameraId.set(deviceId);
    localStorage.setItem(CAMERA_KEY, deviceId);
    // Camera off? Remember the choice; it applies the next time it's switched on.
    if (!this.localMedia || !this.cameraOn()) return;

    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(deviceId) });
      const track = fresh.getVideoTracks()[0];
      if (!track) return;
      for (const peer of this.peerMap.values()) {
        const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
      }
      this.localMedia.getVideoTracks().forEach(old => { old.stop(); this.localMedia?.removeTrack(old); });
      this.localMedia.addTrack(track);
      this.localPreview.set(new MediaStream([track]));
    } catch {
      this.message.set('Could not switch camera.');
    }
  }

  /** Flips to the next camera in the list — the one-tap version for phones. */
  async flipCamera(): Promise<void> {
    const list = this.cameras();
    if (list.length < 2) return;
    const current = list.findIndex(d => d.deviceId === this.cameraId());
    await this.selectCamera(list[(current + 1) % list.length].deviceId);
  }

  /** Switches microphone mid-call — the usual fix when the others can't hear you. */
  async selectMic(deviceId: string): Promise<void> {
    this.micId.set(deviceId);
    localStorage.setItem(MIC_KEY, deviceId);
    if (!this.localMedia) return;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
      const track = fresh.getAudioTracks()[0];
      if (!track) return;
      track.enabled = !this.muted();
      for (const peer of this.peerMap.values()) {
        const sender = peer.pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) await sender.replaceTrack(track);
      }
      this.localMedia.getAudioTracks().forEach(old => { old.stop(); this.localMedia?.removeTrack(old); });
      this.localMedia.addTrack(track);
    } catch {
      this.message.set('Could not switch microphone.');
    }
  }

  /** Retries playback after the browser blocked it (called from a button, i.e. a user gesture). */
  async unlockSound(): Promise<void> {
    let blocked = false;
    for (const peer of this.peerMap.values()) {
      if (!peer.sink) continue;
      try { await peer.sink.play(); } catch { blocked = true; }
    }
    this.needsSoundUnlock.set(blocked);
  }

  /** Dismisses the "ended"/error banner without waiting for it to time out. */
  dismiss(): void {
    if (this.phase() !== 'ended') return;
    this.clearResetTimer();
    this.message.set(null);
    this.phase.set('idle');
  }

  history(conversationId?: string) {
    const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
    return this.http.get<CallHistoryEntry[]>(`${this.base}/calls/history${q}`);
  }

  adminCalls(limit = 100) {
    return this.http.get<AdminCall[]>(`${this.base}/calls/admin?limit=${limit}`);
  }

  // ---- Hub events ----

  private async onHubEvent(event: CallHubEvent): Promise<void> {
    switch (event.type) {
      case 'incoming': {
        // A leftover "call ended" banner must not swallow the next call.
        if (this.phase() === 'ended') this.dismiss();
        // The server allows one call per user, so a ring while we're busy means another device of ours.
        if (this.busy()) return;
        this.roomId.set(event.call.roomId);
        this.title.set(event.call.title);
        this.media.set(event.call.media ?? 'audio');
        this.message.set(null);
        this.phase.set('incoming');
        this.ringer.startIncoming();
        this.notify(event.call);
        return;
      }

      case 'roster': {
        if (event.room.roomId !== this.roomId()) return;
        this.room.set(event.room);
        this.media.set(event.room.media);
        this.title.set(event.room.title);
        this.syncPeerNames(event.room);
        return;
      }

      case 'joined': {
        // Deterministic rule: we were already in, so we offer to the newcomer.
        if (event.roomId !== this.roomId() || event.userId === this.myId) return;
        await this.openPeer(event.userId, { polite: false, offer: true });
        return;
      }

      case 'left': {
        if (event.roomId !== this.roomId()) return;
        this.closePeer(event.userId);
        return;
      }

      case 'ended': {
        if (event.ended.roomId !== this.roomId()) return;
        this.onRoomEnded(event.ended.reason, event.ended.durationSeconds);
        return;
      }

      case 'media': {
        if (event.roomId === this.roomId()) this.media.set(event.media);
        return;
      }

      case 'signal': {
        if (event.roomId !== this.roomId()) return;
        await this.onSignal(event.fromUserId, event.kind, event.payload);
        return;
      }
    }
  }

  private onRoomEnded(reason: string, durationSeconds: number): void {
    const text = durationSeconds > 0
      ? `Call ended · ${formatDuration(durationSeconds)}`
      : reason === 'declined' ? 'Call declined'
      : reason === 'missed' ? 'No answer'
      : reason === 'failed' ? "Couldn't connect the call"
      : 'Call ended';
    this.teardown();
    this.showEnded(text);
  }

  private async onSignal(fromUserId: string, kind: CallSignalKind, payload: string): Promise<void> {
    try {
      // An offer from someone we have no connection with yet: they joined before us, so we're polite.
      let peer = this.peerMap.get(fromUserId);
      if (!peer) {
        if (kind !== 'offer') return;
        peer = await this.openPeer(fromUserId, { polite: true, offer: false }) ?? undefined;
        if (!peer) return;
      }

      if (kind === 'offer') {
        const description = new RTCSessionDescription(JSON.parse(payload));
        // Perfect negotiation: if both ends offer at once, the impolite peer ignores the incoming
        // offer and the polite one rolls its own back. Without this, a mid-call camera-on can deadlock.
        const collision = peer.makingOffer || peer.pc.signalingState !== 'stable';
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;

        await peer.pc.setRemoteDescription(description);
        peer.remoteReady = true;
        await this.flushCandidates(peer);
        await peer.pc.setLocalDescription(); // implicit answer
        await this.postSignal(fromUserId, 'answer', JSON.stringify(peer.pc.localDescription));
        return;
      }

      if (kind === 'answer') {
        // Ignore an answer to an offer we rolled back.
        if (peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(payload)));
        peer.remoteReady = true;
        await this.flushCandidates(peer);
        return;
      }

      const candidate = JSON.parse(payload) as RTCIceCandidateInit;
      if (peer.ignoreOffer) return;
      if (!peer.remoteReady) { peer.pendingCandidates.push(candidate); return; }
      await peer.pc.addIceCandidate(candidate);
    } catch {
      // A malformed or out-of-order signal must not take the call down: ICE retries, and the
      // connection-state handler settles anything that really failed.
    }
  }

  // ---- Mesh plumbing ----

  private applyJoin(join: CallJoin): void {
    this.roomId.set(join.room.roomId);
    this.room.set(join.room);
    this.title.set(join.room.title);
    this.media.set(join.room.media);
    this.iceServers = join.iceServers.map(toRtcIceServer);
    void this.loadDevices();
    if (this.phase() === 'active') return;
    // Alone so far → we're still ringing them. Otherwise peers already in the call will offer to us
    // (they get ParticipantJoined), so there's nothing to do but wait for the offer.
    if (join.room.joinedCount <= 1) {
      this.phase.set('outgoing');
      this.ringer.startOutgoing();
    } else {
      this.ringer.stop();
      this.phase.set('connecting');
    }
  }

  private async openPeer(userId: string, opts: { polite: boolean; offer: boolean }): Promise<Peer | null> {
    if (!this.localMedia) return null;
    const existing = this.peerMap.get(userId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: Peer = {
      userId, pc, sink: null, polite: opts.polite, makingOffer: false, ignoreOffer: false,
      remoteReady: false, pendingCandidates: [], lastBytes: { in: 0, out: 0 },
    };
    this.peerMap.set(userId, peer);
    this.publishPeers();

    for (const track of this.localMedia.getTracks()) pc.addTrack(track, this.localMedia);

    pc.onicecandidate = e => {
      if (e.candidate) void this.postSignal(userId, 'candidate', JSON.stringify(e.candidate.toJSON()));
    };
    pc.ontrack = e => this.onRemoteTrack(peer, e.track);
    pc.onconnectionstatechange = () => {
      if (this.peerMap.get(userId) !== peer) return;
      if (pc.connectionState === 'connected') this.onPeerConnected();
      // 'disconnected' is often transient (a network blip); only a hard failure drops the peer.
      else if (pc.connectionState === 'failed') this.onPeerFailed(userId);
      this.publishPeers();
    };

    // Only the side that was already in the call offers; addTrack above queued the negotiation, and the
    // handler picks it up on the next task. The joining side stays quiet until the offer arrives.
    if (opts.offer) this.ensureNegotiation(peer);
    return peer;
  }

  /**
   * Wraps each remote track in its own MediaStream instead of trusting `event.streams[0]`: that array
   * is empty whenever the remote SDP carries no msid, which is a classic cause of "connected but I
   * can't hear anything".
   */
  private onRemoteTrack(peer: Peer, track: MediaStreamTrack): void {
    if (track.kind === 'audio') {
      this.attachRemoteAudio(peer, new MediaStream([track]));
      return;
    }

    const stream = new MediaStream([track]);
    this.updatePeerView(peer.userId, { video: stream, videoLive: !track.muted });
    track.onmute = () => this.updatePeerView(peer.userId, { videoLive: false });
    track.onunmute = () => this.updatePeerView(peer.userId, { videoLive: true });
    track.onended = () => this.updatePeerView(peer.userId, { video: null, videoLive: false });
    if (this.media() !== 'video') this.media.set('video');
  }

  /**
   * Each peer's audio plays through its own hidden &lt;audio&gt; sink rather than a video element: that
   * is the single place volume, the output device and autoplay unlocking are controlled, and it keeps
   * audio alive regardless of what the UI is rendering.
   */
  private attachRemoteAudio(peer: Peer, stream: MediaStream): void {
    if (!peer.sink) {
      const element = document.createElement('audio') as SinkCapable;
      element.autoplay = true;
      element.hidden = true;
      document.body.appendChild(element);
      peer.sink = element;
    }
    peer.sink.srcObject = stream;
    peer.sink.muted = false;
    peer.sink.volume = this.volume();
    void this.applySinkDevice(peer);
    this.playSink(peer);
  }

  private playSink(peer: Peer): void {
    const sink = peer.sink;
    if (!sink) return;
    sink.play().catch(() => {
      // Autoplay was blocked. Offer a button, and retry on the next interaction anywhere.
      this.needsSoundUnlock.set(true);
      if (this.unlockListener) return;
      this.unlockListener = () => { void this.unlockSound(); this.removeUnlockListener(); };
      document.addEventListener('click', this.unlockListener, { once: true });
    });
  }

  private async applySinkDevice(peer: Peer): Promise<void> {
    const deviceId = this.speakerId();
    if (!peer.sink?.setSinkId || !deviceId) return;
    try { await peer.sink.setSinkId(deviceId); } catch { /* device gone or not permitted */ }
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const queued = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const candidate of queued) {
      try { await peer.pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
    }
  }

  private onPeerConnected(): void {
    if (this.phase() === 'ended' || this.phase() === 'idle') return;
    this.ringer.stop();
    this.phase.set('active');
    this.message.set(null);
    if (!this.ticker) this.ticker = setInterval(() => this.elapsed.update(v => v + 1), 1000);
    if (!this.statsTimer) this.statsTimer = setInterval(() => void this.pollStats(), 2000);
    void this.loadDevices();
  }

  private onPeerFailed(userId: string): void {
    this.closePeer(userId);
    // Only a total loss of peers is a failed call; in a group the others carry on.
    if (this.peerMap.size > 0) {
      this.message.set('Lost one participant — a TURN relay may be needed on this network.');
      return;
    }
    const id = this.roomId();
    if (id) this.http.post(`${this.base}/calls/${id}/failed`, {}).subscribe({ error: () => {} });
    this.teardown();
    this.showEnded("Couldn't connect the call — a TURN relay may be needed on this network.");
  }

  private closePeer(userId: string): void {
    const peer = this.peerMap.get(userId);
    if (!peer) return;
    this.peerMap.delete(userId);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.onconnectionstatechange = null;
    try { peer.pc.close(); } catch { /* already closed */ }
    if (peer.sink) {
      peer.sink.srcObject = null;
      peer.sink.remove();
    }
    this.publishPeers();
  }

  private async enableCamera(): Promise<void> {
    if (!this.localMedia) return;
    const existing = this.localMedia.getVideoTracks()[0];
    if (existing) {
      existing.enabled = true;
      this.cameraOn.set(true);
      this.localPreview.set(new MediaStream([existing]));
      return;
    }

    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(this.cameraId()) });
      const track = cam.getVideoTracks()[0];
      if (!track) return;
      this.localMedia.addTrack(track);
      for (const peer of this.peerMap.values()) {
        const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
        // replaceTrack reuses the negotiated m-line; addTrack triggers onnegotiationneeded instead.
        if (sender) await sender.replaceTrack(track);
        else {
          // Make sure this peer can renegotiate even if it joined as the quiet side.
          this.ensureNegotiation(peer);
          peer.pc.addTrack(track, this.localMedia);
        }
      }
      this.cameraOn.set(true);
      this.media.set('video');
      this.localPreview.set(new MediaStream([track]));
      const id = this.roomId();
      if (id) this.http.post(`${this.base}/calls/${id}/media`, { media: 'video' }).subscribe({ error: () => {} });
    } catch {
      this.message.set('Camera access was denied or no camera was found.');
    }
  }

  /** Re-arms onnegotiationneeded for a peer that joined as the answering side. */
  private ensureNegotiation(peer: Peer): void {
    if (peer.pc.onnegotiationneeded) return;
    peer.pc.onnegotiationneeded = async () => {
      if (this.peerMap.get(peer.userId) !== peer) return;
      try {
        peer.makingOffer = true;
        await peer.pc.setLocalDescription();
        await this.postSignal(peer.userId, 'offer', JSON.stringify(peer.pc.localDescription));
      } catch { /* ignored */ } finally { peer.makingOffer = false; }
    };
  }

  /** Acquires mic (and camera for a video call), falling back to audio-only if the camera fails. */
  private async acquireMedia(wantVideo: boolean): Promise<boolean> {
    if (this.localMedia) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.abort('Calling needs a secure (https) connection.');
      return false;
    }

    const audio = audioConstraints(this.micId());
    if (wantVideo) {
      try {
        this.localMedia = await navigator.mediaDevices.getUserMedia({ audio, video: videoConstraints(this.cameraId()) });
        const track = this.localMedia.getVideoTracks()[0];
        this.cameraOn.set(!!track);
        if (track) this.localPreview.set(new MediaStream([track]));
        void this.loadDevices();
        return true;
      } catch {
        // No camera shouldn't kill the call — carry on as audio.
        this.message.set('No camera available — continuing with audio only.');
        this.media.set('audio');
        this.cameraOn.set(false);
        this.localPreview.set(null);
      }
    }

    try {
      this.localMedia = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      void this.loadDevices();
      return true;
    } catch {
      this.abort('Microphone access was denied or no microphone was found.');
      return false;
    }
  }

  /** Device labels are only populated once permission is granted, so this runs after getUserMedia. */
  private async loadDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.speakers.set(devices.filter(d => d.kind === 'audiooutput'));
      this.microphones.set(devices.filter(d => d.kind === 'audioinput'));
      this.cameras.set(devices.filter(d => d.kind === 'videoinput'));
    } catch { /* enumeration unavailable */ }
  }

  /**
   * Turns getStats() into the facts that matter when someone can't hear: per peer, are our bytes going
   * out and theirs coming in, and is the path direct or relayed.
   */
  private async pollStats(): Promise<void> {
    let mic = 0;
    for (const peer of this.peerMap.values()) {
      try {
        const report = await peer.pc.getStats();
        let inbound = 0, outbound = 0, lost = 0, level = 0, localType = '', remoteType = '';
        report.forEach(raw => {
          const stat = raw as unknown as StatLike;
          if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
            inbound = stat.bytesReceived ?? 0;
            lost = stat.packetsLost ?? 0;
            level = stat.audioLevel ?? level;
          } else if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
            outbound = stat.bytesSent ?? 0;
          } else if (stat.type === 'media-source' && stat.kind === 'audio') {
            mic = Math.max(mic, stat.audioLevel ?? 0);
          } else if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated) {
            localType = (report.get(stat.localCandidateId ?? '') as StatLike | undefined)?.candidateType ?? '';
            remoteType = (report.get(stat.remoteCandidateId ?? '') as StatLike | undefined)?.candidateType ?? '';
          }
        });

        const previous = peer.lastBytes;
        peer.lastBytes = { in: inbound, out: outbound };
        const stats: PeerStats = {
          transport: localType === 'relay' || remoteType === 'relay' ? 'relayed'
            : localType ? 'direct' : 'unknown',
          receiving: inbound > previous.in,
          sending: outbound > previous.out,
          level,
          packetsLost: lost,
        };
        this.updatePeerView(peer.userId, { stats });
      } catch { /* stats are best-effort */ }
    }
    this.micLevel.set(mic);
  }

  private async postSignal(toUserId: string, kind: CallSignalKind, payload: string): Promise<void> {
    const id = this.roomId();
    if (!id) return;
    try {
      await firstValueFrom(this.http.post(`${this.base}/calls/${id}/signal`, { toUserId, kind, payload }));
    } catch {
      // The call may have ended under us — the room state push handles the UI.
    }
  }

  // ---- Peer view plumbing (what the template renders) ----

  private publishPeers(): void {
    const roster = this.room()?.participants ?? [];
    const previous = new Map(this.peers().map(p => [p.userId, p]));
    this.peers.set([...this.peerMap.keys()].map(userId => {
      const before = previous.get(userId);
      return {
        userId,
        displayName: roster.find(p => p.userId === userId)?.displayName ?? before?.displayName ?? 'Participant',
        video: before?.video ?? null,
        videoLive: before?.videoLive ?? false,
        connected: this.peerMap.get(userId)?.pc.connectionState === 'connected',
        stats: before?.stats ?? null,
      };
    }));
  }

  private updatePeerView(userId: string, patch: Partial<PeerView>): void {
    if (!this.peerMap.has(userId)) return;
    this.peers.update(list => {
      const index = list.findIndex(p => p.userId === userId);
      if (index < 0) return list;
      const next = [...list];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  /** Roster names can arrive after a peer connection does; refresh the tiles when they do. */
  private syncPeerNames(room: CallRoom): void {
    this.peers.update(list => list.map(peer => ({
      ...peer,
      displayName: room.participants.find(p => p.userId === peer.userId)?.displayName ?? peer.displayName,
    })));
  }

  /** Best-effort desktop notification — only if the user already granted permission (never prompts). */
  private notify(call: { fromName: string; media: CallMedia; title: string }): void {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (!document.hidden) return;
      new Notification(call.media === 'video' ? 'Incoming video call' : 'Incoming call',
        { body: `${call.fromName} · ${call.title}`, tag: 'ks-call' });
    } catch { /* notifications unavailable */ }
  }

  // ---- Teardown ----

  private abort(text: string): void {
    this.teardown();
    this.showEnded(text);
  }

  private showEnded(text: string): void {
    this.message.set(text);
    this.phase.set('ended');
    this.clearResetTimer();
    this.resetTimer = setTimeout(() => {
      if (this.phase() === 'ended') { this.phase.set('idle'); this.message.set(null); }
    }, 4000);
  }

  private teardown(): void {
    this.ringer.stop();
    if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    this.removeUnlockListener();

    for (const userId of [...this.peerMap.keys()]) this.closePeer(userId);
    this.peerMap.clear();
    this.peers.set([]);

    this.localMedia?.getTracks().forEach(track => track.stop());
    this.localMedia = null;

    this.iceServers = [];
    this.roomId.set(null);
    this.room.set(null);
    this.title.set('');
    this.media.set('audio');
    this.muted.set(false);
    this.cameraOn.set(false);
    this.localPreview.set(null);
    this.needsSoundUnlock.set(false);
    this.micLevel.set(0);
    this.elapsed.set(0);
  }

  private removeUnlockListener(): void {
    if (!this.unlockListener) return;
    document.removeEventListener('click', this.unlockListener);
    this.unlockListener = null;
  }

  private clearResetTimer(): void {
    if (this.resetTimer) { clearTimeout(this.resetTimer); this.resetTimer = null; }
  }

  private errorText(e: unknown, fallback: string): string {
    return e instanceof HttpErrorResponse ? (e.error?.error ?? fallback) : fallback;
  }
}

function audioConstraints(deviceId: string): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

function videoConstraints(deviceId = ''): MediaTrackConstraints {
  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    // A specific camera wins; otherwise ask for the front-facing one (what phones default to).
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
  };
}

function toRtcIceServer(server: IceServer): RTCIceServer {
  return {
    urls: server.urls,
    ...(server.username ? { username: server.username } : {}),
    ...(server.credential ? { credential: server.credential } : {}),
  };
}

function loadVolume(): number {
  const stored = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(stored) && stored > 0 && stored <= 1 ? stored : 1;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60), ss = s % 60;
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(mm % 60).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${mm}:${String(ss).padStart(2, '0')}`;
}

/**
 * Ring tones, synthesised with WebAudio so no audio asset has to ship. Every call is wrapped: a
 * browser that blocks audio without a gesture must not break the call, only its sound.
 */
class Ringer {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  startIncoming(): void { this.loop(880, 0.18, 1600); }
  startOutgoing(): void { this.loop(440, 0.10, 2600); }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private loop(frequency: number, gain: number, everyMs: number): void {
    this.stop();
    this.beep(frequency, gain);
    this.timer = setInterval(() => this.beep(frequency, gain), everyMs);
  }

  private beep(frequency: number, gain: number): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const t = this.ctx.currentTime;
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(gain, t + 0.05);
      amp.gain.linearRampToValueAtTime(0, t + 0.5);
      osc.connect(amp);
      amp.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    } catch {
      // Autoplay policy or no audio device — the on-screen ring still shows.
    }
  }
}
