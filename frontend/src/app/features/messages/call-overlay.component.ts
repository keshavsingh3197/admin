import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SrcObjectDirective } from '../../core/directives/src-object.directive';
import { CallService, formatDuration } from '../../core/services/call.service';

/**
 * The call card: ring / answer, audio + video tiles, and the controls that matter when something is
 * wrong — volume, output device, microphone, and a live "sending / receiving" readout so a one-way
 * audio problem is visible rather than guesswork.
 *
 * Mounted by the app shell (not the Messages page) so a call can ring, connect and be hung up from
 * anywhere in admin. Audio playback itself lives in CallService; this is only UI.
 */
@Component({
  selector: 'app-call-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SrcObjectDirective],
  template: `
    @if (call.busy()) {
      <div class="call-card" [class.wide]="showVideo()" role="dialog" aria-label="Call">
        <div class="who">
          <span class="avatar" aria-hidden="true">{{ initials() }}</span>
          <span class="meta">
            <strong class="name">{{ call.partnerName() || 'Unknown' }}</strong>
            <span class="status" aria-live="polite">{{ status() }}</span>
          </span>
          @if (call.onCall()) {
            <span class="net" [title]="netTitle()">{{ call.stats()?.transport === 'relayed' ? '🛰️' : '🔗' }}</span>
          }
        </div>

        @if (showVideo()) {
          <div class="tiles" [class.gallery]="call.layout() === 'gallery'">
            <div class="tile remote">
              @if (call.remoteVideo() && call.remoteVideoLive()) {
                <video [appSrcObject]="call.remoteVideo()" autoplay playsinline muted></video>
              } @else {
                <div class="camoff"><span class="avatar big" aria-hidden="true">{{ initials() }}</span>
                  <small>{{ call.onCall() ? 'Camera off' : 'Waiting for video…' }}</small></div>
              }
            </div>
            <div class="tile local">
              @if (call.localPreview() && call.cameraOn()) {
                <video [appSrcObject]="call.localPreview()" autoplay playsinline muted></video>
              } @else {
                <div class="camoff"><small>Your camera is off</small></div>
              }
            </div>
          </div>
        }

        @if (call.onCall()) {
          <!-- Level meters make the usual culprits obvious: no mic bar = we're sending silence,
               no "them" bar = nothing is arriving, bar but no sound = wrong output device. -->
          <div class="meters">
            <span class="meter" title="Your microphone level">🎙️
              <i class="bar"><b [style.width.%]="micPercent()"></b></i>
            </span>
            <span class="meter" title="Level of the audio arriving from them">🔊
              <i class="bar"><b [style.width.%]="remotePercent()"></b></i>
            </span>
            @if (call.stats(); as s) {
              <span class="flags">
                <span [class.bad]="!s.sending" title="Are your packets going out?">out {{ s.sending ? '✓' : '✕' }}</span>
                <span [class.bad]="!s.receiving" title="Are their packets coming in?">in {{ s.receiving ? '✓' : '✕' }}</span>
              </span>
            }
          </div>

          @if (call.needsSoundUnlock()) {
            <button class="unlock" type="button" (click)="call.unlockSound()">🔈 Tap to enable sound</button>
          }

          <div class="vol">
            <button class="cbtn icon" type="button" (click)="call.volumeDown()" aria-label="Volume down">−</button>
            <input class="slider" type="range" min="0" max="100" step="5" [value]="volumePercent()"
                   (input)="onVolume($event)" aria-label="Call volume" />
            <button class="cbtn icon" type="button" (click)="call.volumeUp()" aria-label="Volume up">+</button>
            <span class="vol-val">{{ volumePercent() }}%</span>
          </div>

          @if (call.canSelectSpeaker() || call.microphones().length > 1) {
            <div class="devices">
              @if (call.canSelectSpeaker()) {
                <label>🔊
                  <select [value]="call.speakerId()" (change)="onSpeaker($event)">
                    <option value="">Default output</option>
                    @for (d of call.speakers(); track d.deviceId) {
                      <option [value]="d.deviceId">{{ d.label || 'Output device' }}</option>
                    }
                  </select>
                </label>
              }
              @if (call.microphones().length > 1) {
                <label>🎙️
                  <select [value]="call.micId()" (change)="onMic($event)">
                    <option value="">Default microphone</option>
                    @for (d of call.microphones(); track d.deviceId) {
                      <option [value]="d.deviceId">{{ d.label || 'Microphone' }}</option>
                    }
                  </select>
                </label>
              }
            </div>
          }
        }

        <div class="actions">
          @switch (call.phase()) {
            @case ('incoming') {
              <button class="cbtn accept" type="button" (click)="call.accept()" title="Answer">
                {{ call.isVideo() ? '📹' : '📞' }} Answer</button>
              <button class="cbtn end" type="button" (click)="call.decline()" title="Decline">Decline</button>
            }
            @case ('ended') {
              <button class="cbtn plain" type="button" (click)="call.dismiss()">Dismiss</button>
            }
            @default {
              @if (call.onCall()) {
                <button class="cbtn plain" type="button" [class.on]="call.muted()" (click)="call.toggleMute()"
                        [title]="call.muted() ? 'Unmute' : 'Mute'">{{ call.muted() ? '🔇' : '🎙️' }}</button>
                <button class="cbtn plain" type="button" [class.on]="call.cameraOn()" (click)="call.toggleCamera()"
                        [title]="call.cameraOn() ? 'Turn camera off' : 'Turn camera on'">📹</button>
                @if (showVideo()) {
                  <button class="cbtn plain" type="button" (click)="call.toggleLayout()"
                          [title]="call.layout() === 'pip' ? 'Gallery view' : 'Picture-in-picture'">
                    {{ call.layout() === 'pip' ? '▦' : '◲' }}</button>
                }
              }
              <button class="cbtn end" type="button" (click)="call.hangUp()" title="Hang up">✕ Hang up</button>
            }
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .call-card {
      position: fixed; right: 1rem; bottom: 1rem; z-index: 60; width: min(340px, calc(100vw - 2rem));
      display: flex; flex-direction: column; gap: .7rem; padding: .9rem 1rem;
      background: var(--surface); color: var(--text); border: 1px solid var(--border);
      border-radius: 14px; box-shadow: 0 10px 30px color-mix(in srgb, #0a1020 25%, transparent);
    }
    .call-card.wide { width: min(560px, calc(100vw - 2rem)); }
    .who { display: flex; align-items: center; gap: .7rem; min-width: 0; }
    .avatar {
      width: 40px; height: 40px; flex: none; border-radius: 50%; display: grid; place-items: center;
      background: var(--brand); color: var(--brand-text); font-weight: 600; font-size: .9rem;
    }
    .avatar.big { width: 56px; height: 56px; font-size: 1.1rem; }
    .meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .name { font-size: .95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status { color: var(--muted); font-size: .8rem; }
    .net { font-size: .9rem; }

    .tiles { display: grid; gap: .4rem; grid-template-columns: 1fr; position: relative; }
    .tiles.gallery { grid-template-columns: 1fr 1fr; }
    .tile { position: relative; background: #0b1020; border-radius: 10px; overflow: hidden; aspect-ratio: 4 / 3; }
    .tile video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .tile.local video { transform: scaleX(-1); } /* mirror our own preview, like every other call app */
    .tiles:not(.gallery) .tile.local {
      position: absolute; right: .5rem; bottom: .5rem; width: 32%; aspect-ratio: 4 / 3;
      border: 1px solid color-mix(in srgb, #fff 25%, transparent); border-radius: 8px;
    }
    .camoff { position: absolute; inset: 0; display: grid; place-items: center; gap: .4rem; color: #cbd5e1; }
    .camoff small { font-size: .74rem; }

    .meters { display: flex; align-items: center; gap: .6rem; font-size: .78rem; color: var(--muted); }
    .meter { display: inline-flex; align-items: center; gap: .3rem; }
    .bar { display: inline-block; width: 54px; height: 6px; border-radius: 99px; background: var(--border); overflow: hidden; }
    .bar b { display: block; height: 100%; background: #2ecc71; transition: width .2s linear; }
    .flags { display: inline-flex; gap: .4rem; margin-left: auto; }
    .flags .bad { color: #d93025; font-weight: 600; }

    .unlock { background: #fef7e0; color: #8a5b00; border: 1px solid #f5d98a; border-radius: 8px;
              padding: .35rem .6rem; font-size: .8rem; cursor: pointer; }

    .vol { display: flex; align-items: center; gap: .4rem; }
    .slider { flex: 1; accent-color: var(--brand); }
    .vol-val { font-size: .74rem; color: var(--muted); width: 2.6rem; text-align: right; }

    .devices { display: flex; flex-direction: column; gap: .3rem; }
    .devices label { display: flex; align-items: center; gap: .35rem; font-size: .78rem; color: var(--muted); }
    .devices select { flex: 1; min-width: 0; background: var(--bg); color: var(--text);
                      border: 1px solid var(--border); border-radius: 6px; padding: .2rem .3rem; font-size: .78rem; }

    .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
    .cbtn { border: 1px solid var(--border); background: var(--bg); color: var(--text);
            border-radius: 8px; padding: .4rem .7rem; font-size: .82rem; cursor: pointer; }
    .cbtn.icon { width: 28px; padding: .2rem 0; }
    .cbtn.accept { background: #137333; border-color: transparent; color: #fff; }
    .cbtn.end { background: transparent; color: #d93025; border-color: color-mix(in srgb, #d93025 40%, transparent); }
    .cbtn.plain.on { background: var(--brand); color: var(--brand-text); border-color: transparent; }
    @media (prefers-reduced-motion: no-preference) {
      .call-card { animation: rise .18s ease-out; }
      @keyframes rise { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
    }
  `],
})
export class CallOverlayComponent {
  readonly call = inject(CallService);

  readonly showVideo = computed(() =>
    this.call.isVideo() && this.call.phase() !== 'incoming' && this.call.phase() !== 'ended');

  readonly initials = computed(() => {
    const name = this.call.partnerName().trim();
    if (!name) return '?';
    return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
  });

  readonly status = computed(() => {
    const kind = this.call.isVideo() ? 'video' : 'audio';
    switch (this.call.phase()) {
      case 'incoming': return `Incoming ${kind} call…`;
      case 'outgoing': return 'Calling…';
      case 'connecting': return 'Connecting…';
      case 'active': return formatDuration(this.call.elapsed());
      case 'ended': return this.call.message() ?? 'Call ended';
      default: return '';
    }
  });

  readonly netTitle = computed(() => {
    const stats = this.call.stats();
    if (!stats) return 'Connecting…';
    const path = stats.transport === 'relayed' ? 'Relayed through TURN'
      : stats.transport === 'direct' ? 'Direct peer-to-peer' : 'Path unknown';
    return `${path} · lost packets: ${stats.packetsLost}`;
  });

  readonly volumePercent = computed(() => Math.round(this.call.volume() * 100));
  readonly micPercent = computed(() => levelToPercent(this.call.stats()?.micLevel));
  readonly remotePercent = computed(() => levelToPercent(this.call.stats()?.remoteLevel));

  onVolume(event: Event): void {
    this.call.setVolume(Number((event.target as HTMLInputElement).value) / 100);
  }

  onSpeaker(event: Event): void {
    void this.call.selectSpeaker((event.target as HTMLSelectElement).value);
  }

  onMic(event: Event): void {
    void this.call.selectMic((event.target as HTMLSelectElement).value);
  }
}

/** Audio levels are 0..1 but conversational speech sits low — scale so the bar is actually readable. */
function levelToPercent(level: number | undefined): number {
  if (!level || level <= 0) return 0;
  return Math.min(100, Math.round(Math.sqrt(level) * 140));
}
