import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { ChatService } from './chat.service';
import {
  AdminCall, Call, CallHubEvent, CallLayout, CallMedia, CallPhase, CallSignalKind, CallStateChanged,
  CallStats, IceServer,
} from '../models/call.models';

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

const VOLUME_KEY = 'admin.call.volume';
const SPEAKER_KEY = 'admin.call.speaker';
const MIC_KEY = 'admin.call.mic';

/**
 * 1:1 audio and video calls over WebRTC.
 *
 * Media is peer-to-peer and encrypted by WebRTC (DTLS-SRTP) — the server only relays offer/answer/ICE
 * (over `api/calls`, pushed back down the chat hub) and never sees audio or video. Root-provided and
 * mounted by the app shell, so a call rings on any admin page.
 *
 * Playback deliberately runs through one hidden &lt;audio&gt; sink rather than the video element: that is
 * the single place volume, the output device and autoplay unlocking are controlled, and it keeps audio
 * alive regardless of what the UI is rendering.
 */
@Injectable({ providedIn: 'root' })
export class CallService {
  private http = inject(HttpClient);
  private chat = inject(ChatService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);
  private readonly base = environment.apiUrl;

  readonly phase = signal<CallPhase>('idle');
  readonly partnerName = signal('');
  readonly callId = signal<string | null>(null);
  readonly conversationId = signal<string | null>(null);
  readonly media = signal<CallMedia>('audio');
  readonly muted = signal(false);
  readonly cameraOn = signal(false);
  readonly layout = signal<CallLayout>('pip');
  /** Talk time in seconds, from the moment media connects. */
  readonly elapsed = signal(0);
  /** Why the overlay is showing what it is: an error, or "Call ended · 1:04". */
  readonly message = signal<string | null>(null);

  /** Video streams for the template (audio never goes through a video element). */
  readonly localPreview = signal<MediaStream | null>(null);
  readonly remoteVideo = signal<MediaStream | null>(null);
  /** False while the far end's camera is off, so we show an avatar instead of a black rectangle. */
  readonly remoteVideoLive = signal(false);

  readonly volume = signal(loadVolume());
  readonly speakers = signal<MediaDeviceInfo[]>([]);
  readonly microphones = signal<MediaDeviceInfo[]>([]);
  readonly speakerId = signal(localStorage.getItem(SPEAKER_KEY) ?? '');
  readonly micId = signal(localStorage.getItem(MIC_KEY) ?? '');
  /** The browser refused to play audio without a gesture — the UI offers an "enable sound" button. */
  readonly needsSoundUnlock = signal(false);
  readonly stats = signal<CallStats | null>(null);

  readonly busy = computed(() => this.phase() !== 'idle');
  readonly onCall = computed(() => this.phase() === 'active');
  readonly isVideo = computed(() => this.media() === 'video');
  readonly canSelectSpeaker = computed(() => this.speakers().length > 1);

  private pc: RTCPeerConnection | null = null;
  /** What we send: audio plus, once the camera is on, video. */
  private localMedia: MediaStream | null = null;
  private sink: SinkCapable | null = null;
  private iceServers: RTCIceServer[] = [];
  private isCaller = false;
  /** Perfect-negotiation politeness: the callee yields on an offer collision. */
  private polite = false;
  private makingOffer = false;
  private ignoreOffer = false;
  /** Renegotiation (e.g. switching a camera on mid-call) only after the first connection settles. */
  private renegotiationReady = false;
  /** An offer that arrived before this side finished accepting. */
  private pendingOffer: string | null = null;
  /** Candidates that arrived before the remote description was set. */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteReady = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private unlockListener: (() => void) | null = null;
  private lastBytes = { in: 0, out: 0 };
  private readonly ringer = new Ringer();

  constructor() {
    this.chat.calls$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => void this.onHubEvent(event));

    // Signing out must release the microphone and camera, not leave them running headless.
    effect(() => {
      if (!this.auth.isAuthenticated() && this.busy()) {
        this.teardown();
        this.clearResetTimer();
        this.message.set(null);
        this.phase.set('idle');
      }
    });

    // Keep the sink in step with the volume slider (and remember the choice).
    effect(() => {
      const level = this.volume();
      localStorage.setItem(VOLUME_KEY, String(level));
      if (this.sink) this.sink.volume = level;
    });
  }

  // ---- Outgoing ----

  /** Rings the other participant. `media: 'video'` starts with the camera on. */
  async start(conversationId: string, partnerName: string, media: CallMedia = 'audio'): Promise<void> {
    if (this.busy()) return;
    this.message.set(null);
    this.isCaller = true;
    this.polite = false;
    this.media.set(media);
    this.partnerName.set(partnerName);
    this.conversationId.set(conversationId);

    // Ask for devices first: a denial should not ring the other person.
    if (!await this.acquireMedia(media === 'video')) return;

    this.phase.set('outgoing');
    this.ringer.startOutgoing();
    try {
      const call = await firstValueFrom(this.http.post<Call>(`${this.base}/calls`, { conversationId, media }));
      this.callId.set(call.callId);
      this.iceServers = call.iceServers.map(toRtcIceServer);
      // The server may have granted less than we asked for (video disabled).
      if (call.media !== media) this.applyGrantedMedia(call.media);
    } catch (e) {
      this.abort(this.errorText(e, 'Could not place the call.'));
    }
  }

  // ---- Incoming ----

  async accept(): Promise<void> {
    const id = this.callId();
    if (!id || this.phase() !== 'incoming') return;
    this.ringer.stop();
    if (!await this.acquireMedia(this.isVideo())) {
      this.http.post(`${this.base}/calls/${id}/decline`, {}).subscribe({ error: () => {} });
      return;
    }

    this.phase.set('connecting');
    try {
      const call = await firstValueFrom(this.http.post<Call>(`${this.base}/calls/${id}/accept`, {}));
      this.iceServers = call.iceServers.map(toRtcIceServer);
      this.partnerName.set(call.partnerName);
      await this.openPeer();
      // The caller may have offered while we were still accepting.
      const offer = this.pendingOffer;
      this.pendingOffer = null;
      if (offer) await this.handleOffer(offer);
    } catch (e) {
      this.abort(this.errorText(e, 'Could not join the call.'));
    }
  }

  decline(): void {
    const id = this.callId();
    if (!id) return;
    this.http.post(`${this.base}/calls/${id}/decline`, {}).subscribe({ error: () => {} });
    this.teardown();
    this.phase.set('idle');
  }

  // ---- Either side ----

  hangUp(): void {
    const id = this.callId();
    if (!id) { this.teardown(); this.phase.set('idle'); return; }
    this.http.post(`${this.base}/calls/${id}/hangup`, {}).subscribe({ error: () => {} });
    const seconds = this.elapsed();
    this.teardown();
    this.showEnded(seconds > 0 ? `Call ended · ${formatDuration(seconds)}` : 'Call cancelled');
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    this.localMedia?.getAudioTracks().forEach(track => { track.enabled = !next; });
  }

  /** Turns the camera on (upgrading an audio call to video) or off. */
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
    await this.applySinkDevice();
  }

  /** Switches microphone mid-call — the usual fix when the far end can't hear you. */
  async selectMic(deviceId: string): Promise<void> {
    this.micId.set(deviceId);
    localStorage.setItem(MIC_KEY, deviceId);
    if (!this.localMedia) return;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
      const track = fresh.getAudioTracks()[0];
      if (!track) return;
      track.enabled = !this.muted();
      const sender = this.pc?.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(track);
      this.localMedia.getAudioTracks().forEach(old => { old.stop(); this.localMedia?.removeTrack(old); });
      this.localMedia.addTrack(track);
    } catch {
      this.message.set('Could not switch microphone.');
    }
  }

  /** Retries playback after the browser blocked it (called from a button, i.e. a user gesture). */
  async unlockSound(): Promise<void> {
    if (!this.sink) return;
    try {
      await this.sink.play();
      this.needsSoundUnlock.set(false);
    } catch {
      this.needsSoundUnlock.set(true);
    }
  }

  /** Dismisses the "ended"/error banner without waiting for it to time out. */
  dismiss(): void {
    if (this.phase() !== 'ended') return;
    this.clearResetTimer();
    this.message.set(null);
    this.phase.set('idle');
  }

  adminCalls(limit = 100) {
    return this.http.get<AdminCall[]>(`${this.base}/calls/admin?limit=${limit}`);
  }

  // ---- Hub events ----

  private async onHubEvent(event: CallHubEvent): Promise<void> {
    if (event.type === 'incoming') {
      // A leftover "call ended" banner must not swallow the next call.
      if (this.phase() === 'ended') this.dismiss();
      // The server allows one call per user, so a ring while we're busy means another device of ours.
      if (this.busy()) return;
      this.isCaller = false;
      this.polite = true;
      this.callId.set(event.call.callId);
      this.conversationId.set(event.call.conversationId);
      this.partnerName.set(event.call.fromName);
      this.media.set(event.call.media ?? 'audio');
      this.message.set(null);
      this.phase.set('incoming');
      this.ringer.startIncoming();
      this.notify(event.call.fromName, this.isVideo());
      return;
    }

    if (event.type === 'state') {
      if (event.state.callId !== this.callId()) return;
      if (event.state.state === 'active') await this.onAnswered();
      else if (event.state.state === 'ended') this.onRemoteEnded(event.state);
      return;
    }

    if (event.type === 'media') {
      if (event.callId === this.callId()) this.media.set(event.media);
      return;
    }

    if (event.callId !== this.callId()) return;
    await this.onSignal(event.kind, event.payload);
  }

  private async onAnswered(): Promise<void> {
    if (this.isCaller) {
      this.ringer.stop();
      if (this.phase() === 'outgoing') this.phase.set('connecting');
      await this.openPeer();
      const pc = this.pc;
      if (!pc) return;
      try {
        this.makingOffer = true;
        await pc.setLocalDescription(); // implicit offer
        await this.postSignal('offer', JSON.stringify(pc.localDescription));
      } catch {
        this.abort('Could not start the call.');
      } finally {
        this.makingOffer = false;
      }
      return;
    }

    // We're the callee and still ringing: one of our other devices picked this call up.
    if (this.phase() === 'incoming') {
      this.teardown();
      this.showEnded('Answered on another device');
    }
  }

  private onRemoteEnded(state: CallStateChanged): void {
    const partner = this.partnerName() || 'They';
    const text = state.durationSeconds > 0
      ? `Call ended · ${formatDuration(state.durationSeconds)}`
      : state.endReason === 'declined' ? `${partner} declined the call`
      : state.endReason === 'missed' ? 'No answer'
      : state.endReason === 'failed' ? "Couldn't connect the call"
      : 'Call ended';
    this.teardown();
    this.showEnded(text);
  }

  private async onSignal(kind: CallSignalKind, payload: string): Promise<void> {
    try {
      if (kind === 'offer') {
        // Buffer until this side has accepted and built its peer connection.
        if (!this.pc) { this.pendingOffer = payload; return; }
        await this.handleOffer(payload);
        return;
      }
      if (kind === 'answer') {
        const pc = this.pc;
        // Ignore an answer to an offer we rolled back (see perfect negotiation, below).
        if (!pc || pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(payload)));
        this.remoteReady = true;
        await this.flushCandidates();
        return;
      }
      const candidate = JSON.parse(payload) as RTCIceCandidateInit;
      if (this.ignoreOffer) return;
      if (!this.pc || !this.remoteReady) { this.pendingCandidates.push(candidate); return; }
      await this.pc.addIceCandidate(candidate);
    } catch {
      // A malformed or out-of-order signal must not take the call down: ICE retries, and the
      // connection-state handler on both ends settles anything that really failed.
    }
  }

  // ---- WebRTC plumbing ----

  private async openPeer(): Promise<void> {
    if (this.pc || !this.localMedia) return;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;

    for (const track of this.localMedia.getTracks()) pc.addTrack(track, this.localMedia);

    pc.onicecandidate = e => {
      if (e.candidate) void this.postSignal('candidate', JSON.stringify(e.candidate.toJSON()));
    };
    pc.ontrack = e => this.onRemoteTrack(e.track);
    pc.onnegotiationneeded = async () => {
      // The first offer is driven explicitly (above); this covers later changes like camera-on.
      if (pc !== this.pc || !this.renegotiationReady) return;
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        await this.postSignal('offer', JSON.stringify(pc.localDescription));
      } catch {
        /* the other side will renegotiate or the call ends */
      } finally {
        this.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'connected') this.onConnected();
      // 'disconnected' is often transient (a network blip); only a hard failure ends the call.
      else if (pc.connectionState === 'failed') this.onMediaFailure();
    };
  }

  private async handleOffer(payload: string): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    const description = new RTCSessionDescription(JSON.parse(payload));

    // Perfect negotiation: if both sides offer at once, the impolite side ignores the incoming offer
    // and the polite side rolls its own back. Without this, a mid-call camera-on can deadlock.
    const collision = this.makingOffer || pc.signalingState !== 'stable';
    this.ignoreOffer = !this.polite && collision;
    if (this.ignoreOffer) return;

    await pc.setRemoteDescription(description);
    this.remoteReady = true;
    await this.flushCandidates();
    await pc.setLocalDescription(); // implicit answer
    await this.postSignal('answer', JSON.stringify(pc.localDescription));
  }

  private async flushCandidates(): Promise<void> {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try { await this.pc?.addIceCandidate(candidate); } catch { /* stale candidate */ }
    }
  }

  /**
   * Wraps each remote track in its own MediaStream instead of trusting `event.streams[0]`: that array
   * is empty whenever the remote SDP carries no msid, which is a classic cause of "connected but I
   * can't hear anything".
   */
  private onRemoteTrack(track: MediaStreamTrack): void {
    if (track.kind === 'audio') {
      this.attachRemoteAudio(new MediaStream([track]));
      return;
    }

    this.remoteVideo.set(new MediaStream([track]));
    this.remoteVideoLive.set(!track.muted);
    track.onmute = () => this.remoteVideoLive.set(false);
    track.onunmute = () => this.remoteVideoLive.set(true);
    track.onended = () => { this.remoteVideo.set(null); this.remoteVideoLive.set(false); };
    if (this.media() !== 'video') this.media.set('video');
  }

  private attachRemoteAudio(stream: MediaStream): void {
    // The sink lives on <body>, not in the overlay template, so audio survives any re-render.
    if (!this.sink) {
      const element = document.createElement('audio') as SinkCapable;
      element.autoplay = true;
      element.hidden = true;
      document.body.appendChild(element);
      this.sink = element;
    }
    this.sink.srcObject = stream;
    this.sink.muted = false;
    this.sink.volume = this.volume();
    void this.applySinkDevice();
    this.playSink();
  }

  private playSink(): void {
    const sink = this.sink;
    if (!sink) return;
    sink.play().then(() => this.needsSoundUnlock.set(false)).catch(() => {
      // Autoplay was blocked. Offer a button, and retry on the next interaction anywhere.
      this.needsSoundUnlock.set(true);
      if (this.unlockListener) return;
      this.unlockListener = () => { void this.unlockSound(); this.removeUnlockListener(); };
      document.addEventListener('click', this.unlockListener, { once: true });
    });
  }

  private async applySinkDevice(): Promise<void> {
    const sink = this.sink;
    const deviceId = this.speakerId();
    if (!sink?.setSinkId || !deviceId) return;
    try { await sink.setSinkId(deviceId); } catch { /* device gone or not permitted */ }
  }

  private onConnected(): void {
    if (this.phase() === 'ended' || this.phase() === 'idle') return;
    this.ringer.stop();
    this.phase.set('active');
    this.message.set(null);
    this.renegotiationReady = true;
    if (!this.ticker) this.ticker = setInterval(() => this.elapsed.update(v => v + 1), 1000);
    if (!this.statsTimer) this.statsTimer = setInterval(() => void this.pollStats(), 2000);
    void this.loadDevices();
  }

  private onMediaFailure(): void {
    const id = this.callId();
    if (id) this.http.post(`${this.base}/calls/${id}/failed`, {}).subscribe({ error: () => {} });
    this.teardown();
    this.showEnded("Couldn't connect the call — a TURN relay may be needed on this network.");
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
      const cam = await navigator.mediaDevices.getUserMedia({ video: videoConstraints() });
      const track = cam.getVideoTracks()[0];
      if (!track) return;
      this.localMedia.addTrack(track);
      const sender = this.pc?.getSenders().find(s => s.track?.kind === 'video');
      // replaceTrack reuses the negotiated m-line; addTrack triggers onnegotiationneeded instead.
      if (sender) await sender.replaceTrack(track);
      else this.pc?.addTrack(track, this.localMedia);
      this.cameraOn.set(true);
      this.media.set('video');
      this.localPreview.set(new MediaStream([track]));
      const id = this.callId();
      if (id) this.http.post(`${this.base}/calls/${id}/media`, { media: 'video' }).subscribe({ error: () => {} });
    } catch {
      this.message.set('Camera access was denied or no camera was found.');
    }
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
        this.localMedia = await navigator.mediaDevices.getUserMedia({ audio, video: videoConstraints() });
        const track = this.localMedia.getVideoTracks()[0];
        this.cameraOn.set(!!track);
        if (track) this.localPreview.set(new MediaStream([track]));
        void this.loadDevices();
        return true;
      } catch {
        // No camera shouldn't kill the call — carry on as audio.
        this.message.set('No camera available — continuing with audio only.');
        this.applyGrantedMedia('audio');
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

  private applyGrantedMedia(granted: CallMedia): void {
    this.media.set(granted);
    if (granted === 'audio') {
      this.cameraOn.set(false);
      this.localPreview.set(null);
    }
  }

  /** Device labels are only populated once permission is granted, so this runs after getUserMedia. */
  private async loadDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.speakers.set(devices.filter(d => d.kind === 'audiooutput'));
      this.microphones.set(devices.filter(d => d.kind === 'audioinput'));
    } catch { /* enumeration unavailable */ }
  }

  /**
   * Turns getStats() into the two facts that matter when someone can't hear: are our bytes going out,
   * and are theirs coming in — plus whether the path is direct or relayed.
   */
  private async pollStats(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    try {
      const report = await pc.getStats();
      let inbound = 0, outbound = 0, lost = 0, micLevel = 0, remoteLevel = 0;
      let localType = '', remoteType = '';

      report.forEach(raw => {
        const stat = raw as unknown as StatLike;
        if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
          inbound = stat.bytesReceived ?? 0;
          lost = stat.packetsLost ?? 0;
          remoteLevel = stat.audioLevel ?? remoteLevel;
        } else if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
          outbound = stat.bytesSent ?? 0;
        } else if (stat.type === 'media-source' && stat.kind === 'audio') {
          micLevel = stat.audioLevel ?? 0;
        } else if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated) {
          localType = (report.get(stat.localCandidateId ?? '') as StatLike | undefined)?.candidateType ?? '';
          remoteType = (report.get(stat.remoteCandidateId ?? '') as StatLike | undefined)?.candidateType ?? '';
        }
      });

      const previous = this.lastBytes;
      this.lastBytes = { in: inbound, out: outbound };
      this.stats.set({
        transport: localType === 'relay' || remoteType === 'relay' ? 'relayed'
          : localType ? 'direct' : 'unknown',
        receiving: inbound > previous.in,
        sending: outbound > previous.out,
        micLevel,
        remoteLevel,
        packetsLost: lost,
      });
    } catch { /* stats are best-effort */ }
  }

  private async postSignal(kind: CallSignalKind, payload: string): Promise<void> {
    const id = this.callId();
    if (!id) return;
    try {
      await firstValueFrom(this.http.post(`${this.base}/calls/${id}/signal`, { kind, payload }));
    } catch {
      // The call may have ended under us — the state push handles the UI.
    }
  }

  /** Best-effort desktop notification — only if the user already granted permission (never prompts). */
  private notify(fromName: string, video: boolean): void {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (!document.hidden) return;
      new Notification(video ? 'Incoming video call' : 'Incoming call',
        { body: `${fromName} is calling`, tag: 'ks-call' });
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

    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onnegotiationneeded = null;
      this.pc.onconnectionstatechange = null;
      try { this.pc.close(); } catch { /* already closed */ }
      this.pc = null;
    }
    this.localMedia?.getTracks().forEach(track => track.stop());
    this.localMedia = null;
    if (this.sink) {
      this.sink.srcObject = null;
      this.sink.remove();
      this.sink = null;
    }

    this.pendingOffer = null;
    this.pendingCandidates = [];
    this.remoteReady = false;
    this.isCaller = false;
    this.polite = false;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.renegotiationReady = false;
    this.iceServers = [];
    this.lastBytes = { in: 0, out: 0 };
    this.callId.set(null);
    this.conversationId.set(null);
    this.media.set('audio');
    this.muted.set(false);
    this.cameraOn.set(false);
    this.localPreview.set(null);
    this.remoteVideo.set(null);
    this.remoteVideoLive.set(false);
    this.needsSoundUnlock.set(false);
    this.stats.set(null);
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

function videoConstraints(): MediaTrackConstraints {
  return { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
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
