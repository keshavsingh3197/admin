import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { ChatService } from './chat.service';
import {
  AdminCall, Call, CallHubEvent, CallPhase, CallSignalKind, CallStateChanged, IceServer,
} from '../models/call.models';

/**
 * 1:1 audio calls over WebRTC.
 *
 * The audio itself is peer-to-peer and encrypted by WebRTC (DTLS-SRTP) — the server only relays the
 * offer/answer/ICE candidates (over `api/calls`, pushed back down the chat hub) and never sees media.
 * Root-provided and mounted by the app shell, so a call rings on any admin page, not just Messages.
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
  readonly muted = signal(false);
  /** Talk time in seconds, from the moment media connects. */
  readonly elapsed = signal(0);
  /** Why the overlay is showing what it is: an error, or "Call ended · 1:04". */
  readonly message = signal<string | null>(null);

  readonly busy = computed(() => this.phase() !== 'idle');
  readonly onCall = computed(() => this.phase() === 'active');

  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private sink: HTMLAudioElement | null = null;
  private iceServers: RTCIceServer[] = [];
  private isCaller = false;
  /** An offer that arrived before this side finished accepting. */
  private pendingOffer: string | null = null;
  /** Candidates that arrived before the remote description was set. */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteReady = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ringer = new Ringer();

  constructor() {
    this.chat.calls$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => void this.onHubEvent(event));

    // Signing out must release the microphone and drop any call, not leave it running headless.
    effect(() => {
      if (!this.auth.isAuthenticated() && this.busy()) {
        this.teardown();
        this.clearResetTimer();
        this.message.set(null);
        this.phase.set('idle');
      }
    });
  }

  // ---- Outgoing ----

  /** Rings the other participant of a conversation. No-op while another call is up. */
  async start(conversationId: string, partnerName: string): Promise<void> {
    if (this.busy()) return;
    this.message.set(null);
    this.isCaller = true;
    this.partnerName.set(partnerName);
    this.conversationId.set(conversationId);

    // Ask for the mic first: a denial should not ring the other person's phone.
    if (!await this.acquireMic()) return;

    this.phase.set('outgoing');
    this.ringer.startOutgoing();
    try {
      const call = await firstValueFrom(this.http.post<Call>(`${this.base}/calls`, { conversationId }));
      this.callId.set(call.callId);
      this.iceServers = call.iceServers.map(toRtcIceServer);
    } catch (e) {
      this.abort(this.errorText(e, 'Could not place the call.'));
    }
  }

  // ---- Incoming ----

  async accept(): Promise<void> {
    const id = this.callId();
    if (!id || this.phase() !== 'incoming') return;
    this.ringer.stop();
    if (!await this.acquireMic()) {
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
    // Don't wait for the server's CallStateChanged to close the UI.
    const seconds = this.elapsed();
    this.teardown();
    this.showEnded(seconds > 0 ? `Call ended · ${formatDuration(seconds)}` : 'Call cancelled');
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    this.localStream?.getAudioTracks().forEach(track => { track.enabled = !next; });
  }

  /** Dismisses the "ended"/error banner without waiting for it to time out. */
  dismiss(): void {
    if (this.phase() !== 'ended') return;
    this.clearResetTimer();
    this.message.set(null);
    this.phase.set('idle');
  }

  history(conversationId: string) {
    return this.http.get<unknown[]>(`${this.base}/calls/history?conversationId=${encodeURIComponent(conversationId)}`);
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
      this.callId.set(event.call.callId);
      this.conversationId.set(event.call.conversationId);
      this.partnerName.set(event.call.fromName);
      this.message.set(null);
      this.phase.set('incoming');
      this.ringer.startIncoming();
      this.notify(event.call.fromName);
      return;
    }

    if (event.type === 'state') {
      if (event.state.callId !== this.callId()) return;
      if (event.state.state === 'active') await this.onAnsweredElsewhereOrHere();
      else if (event.state.state === 'ended') this.onRemoteEnded(event.state);
      return;
    }

    if (event.callId !== this.callId()) return;
    await this.onSignal(event.kind, event.payload);
  }

  private async onAnsweredElsewhereOrHere(): Promise<void> {
    if (this.isCaller) {
      // Answered — start negotiating.
      this.ringer.stop();
      if (this.phase() === 'outgoing') this.phase.set('connecting');
      await this.openPeer();
      if (!this.pc) return;
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this.postSignal('offer', JSON.stringify(offer));
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
        if (!this.pc) return;
        await this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(payload)));
        this.remoteReady = true;
        await this.flushCandidates();
        return;
      }
      const candidate = JSON.parse(payload) as RTCIceCandidateInit;
      if (!this.pc || !this.remoteReady) { this.pendingCandidates.push(candidate); return; }
      await this.pc.addIceCandidate(candidate);
    } catch {
      // A malformed or out-of-order signal must not take the call down; ICE retries or the
      // connection-state watchdog on both ends will settle it.
    }
  }

  // ---- WebRTC plumbing ----

  private async openPeer(): Promise<void> {
    if (this.pc || !this.localStream) return;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;

    for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);

    pc.onicecandidate = e => {
      if (e.candidate) void this.postSignal('candidate', JSON.stringify(e.candidate.toJSON()));
    };
    pc.ontrack = e => this.attachRemote(e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'connected') this.onConnected();
      // 'disconnected' is often transient (a network blip); only a hard failure ends the call.
      else if (pc.connectionState === 'failed') this.onMediaFailure();
    };
  }

  private async handleOffer(payload: string): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(payload)));
    this.remoteReady = true;
    await this.flushCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.postSignal('answer', JSON.stringify(answer));
  }

  private async flushCandidates(): Promise<void> {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try { await this.pc?.addIceCandidate(candidate); } catch { /* stale candidate */ }
    }
  }

  private onConnected(): void {
    if (this.phase() === 'ended' || this.phase() === 'idle') return;
    this.ringer.stop();
    this.phase.set('active');
    this.message.set(null);
    if (!this.ticker) this.ticker = setInterval(() => this.elapsed.update(v => v + 1), 1000);
  }

  private onMediaFailure(): void {
    const id = this.callId();
    if (id) this.http.post(`${this.base}/calls/${id}/failed`, {}).subscribe({ error: () => {} });
    this.teardown();
    this.showEnded("Couldn't connect the call — a TURN relay may be needed on this network.");
  }

  private attachRemote(stream: MediaStream): void {
    // The sink lives on <body>, not in the overlay template, so audio survives any re-render.
    if (!this.sink) {
      this.sink = document.createElement('audio');
      this.sink.autoplay = true;
      this.sink.hidden = true;
      document.body.appendChild(this.sink);
    }
    this.sink.srcObject = stream;
    void this.sink.play().catch(() => { /* autoplay policy; the call is still connected */ });
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

  private async acquireMic(): Promise<boolean> {
    if (this.localStream) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.abort('Calling needs a secure (https) connection.');
      return false;
    }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      return true;
    } catch {
      this.abort('Microphone access was denied or no microphone was found.');
      return false;
    }
  }

  /** Best-effort desktop notification — only if the user already granted permission (never prompts). */
  private notify(fromName: string): void {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (!document.hidden) return;
      new Notification('Incoming call', { body: `${fromName} is calling`, tag: 'ks-call' });
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

    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      try { this.pc.close(); } catch { /* already closed */ }
      this.pc = null;
    }
    this.localStream?.getTracks().forEach(track => track.stop());
    this.localStream = null;
    if (this.sink) {
      this.sink.srcObject = null;
      this.sink.remove();
      this.sink = null;
    }

    this.pendingOffer = null;
    this.pendingCandidates = [];
    this.remoteReady = false;
    this.isCaller = false;
    this.iceServers = [];
    this.callId.set(null);
    this.conversationId.set(null);
    this.muted.set(false);
    this.elapsed.set(0);
  }

  private clearResetTimer(): void {
    if (this.resetTimer) { clearTimeout(this.resetTimer); this.resetTimer = null; }
  }

  private errorText(e: unknown, fallback: string): string {
    return e instanceof HttpErrorResponse ? (e.error?.error ?? fallback) : fallback;
  }
}

function toRtcIceServer(server: IceServer): RTCIceServer {
  return {
    urls: server.urls,
    ...(server.username ? { username: server.username } : {}),
    ...(server.credential ? { credential: server.credential } : {}),
  };
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
