import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SrcObjectDirective } from '../../core/directives/src-object.directive';
import { CallService, formatDuration } from '../../core/services/call.service';
import { ChatService } from '../../core/services/chat.service';
import { DirectoryUser } from '../../core/models/chat.models';
import { PeerView } from '../../core/models/call.models';

/**
 * The call card: ring / answer, the roster (who's on, who's still ringing), video tiles for everyone,
 * add-someone-by-search, and the controls that matter when something is wrong — volume, output device,
 * microphone, and a per-person "sending / receiving" readout so one-way audio is visible, not guesswork.
 *
 * Mounted by the app shell (not the Messages page) so a call rings and can be run from anywhere in
 * admin. Audio playback itself lives in CallService; this is only UI.
 */
@Component({
  selector: 'app-call-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SrcObjectDirective],
  template: `
    @if (call.busy()) {
      <div class="call-card" [class.wide]="showVideo()" role="dialog" aria-label="Call">
        <div class="who">
          <span class="avatar" aria-hidden="true">{{ initials() }}</span>
          <span class="meta">
            <strong class="name">{{ call.title() || 'Call' }}</strong>
            <span class="status" aria-live="polite">{{ status() }}</span>
          </span>
          @if (call.onCall()) {
            <button class="cbtn icon" type="button" (click)="rosterOpen.set(!rosterOpen())"
                    [title]="'Participants: ' + call.joinedCount()">👥 {{ call.joinedCount() }}</button>
          }
        </div>

        @if (rosterOpen() && call.onCall()) {
          <ul class="roster">
            @for (p of call.roster(); track p.userId) {
              <li>
                <span class="dot" [class.on]="p.state === 'joined'" [class.ring]="p.state === 'invited'"></span>
                {{ p.displayName }}
                @if (p.isOwner) { <em class="tag">host</em> }
                <span class="pstate">{{ p.state === 'invited' ? 'ringing…' : p.state }}</span>
              </li>
            }
          </ul>
          <div class="add">
            <input class="search" type="search" placeholder="Add someone…" [(ngModel)]="query"
                   (focus)="loadDirectory()" (ngModelChange)="query = $event" aria-label="Search people to add" />
            @if (matches().length) {
              <ul class="results">
                @for (u of matches(); track u.id) {
                  <li><button type="button" (click)="add(u)">
                    <span class="dot" [class.on]="u.presence === 'online'"></span>{{ u.displayName }}</button></li>
                }
              </ul>
            }
          </div>
        }

        @if (showVideo()) {
          <div class="tiles" [class.gallery]="call.layout() === 'gallery'"
               [style.--cols]="gridColumns()">
            @for (peer of call.peers(); track peer.userId) {
              <div class="tile">
                @if (peer.video && peer.videoLive) {
                  <video [appSrcObject]="peer.video" autoplay playsinline muted></video>
                } @else {
                  <div class="camoff"><span class="avatar big" aria-hidden="true">{{ nameInitials(peer.displayName) }}</span>
                    <small>{{ peer.connected ? 'Camera off' : 'Connecting…' }}</small></div>
                }
                <span class="label">{{ peer.displayName }}
                  @if (peer.stats && !peer.stats.receiving) { <em class="warn" title="No audio arriving">⚠</em> }
                  @if (peer.stats?.transport === 'relayed') { <em title="Relayed through TURN">🛰️</em> }
                </span>
              </div>
            }
            <div class="tile local">
              @if (call.localPreview() && call.cameraOn()) {
                <video [appSrcObject]="call.localPreview()" autoplay playsinline muted></video>
              } @else {
                <div class="camoff"><small>Your camera is off</small></div>
              }
              <span class="label">You</span>
            </div>
          </div>
        }

        @if (call.onCall()) {
          <!-- Level meters make the usual culprits obvious: no mic bar = we're sending silence, no
               "them" bar = nothing is arriving, bar but no sound = wrong output device. -->
          <div class="meters">
            <span class="meter" title="Your microphone level">🎙️
              <i class="bar"><b [style.width.%]="micPercent()"></b></i>
            </span>
            <span class="meter" title="Loudest incoming audio">🔊
              <i class="bar"><b [style.width.%]="loudestPeerPercent()"></b></i>
            </span>
            @if (silentPeers().length) {
              <span class="flags"><span class="bad" [title]="silentPeers().join(', ')">
                no audio from {{ silentPeers().length }}</span></span>
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

          @if (call.canSelectSpeaker() || call.microphones().length > 1 || call.cameras().length > 1) {
            <div class="devices">
              @if (call.cameras().length > 1) {
                <label>📷
                  <select [value]="call.cameraId()" (change)="onCamera($event)">
                    <option value="">Default camera</option>
                    @for (d of call.cameras(); track d.deviceId) {
                      <option [value]="d.deviceId">{{ d.label || 'Camera' }}</option>
                    }
                  </select>
                </label>
              }
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
                @if (call.cameraOn() && call.cameras().length > 1) {
                  <button class="cbtn plain" type="button" (click)="call.flipCamera()"
                          title="Switch camera">🔄</button>
                }
                @if (showVideo()) {
                  <button class="cbtn plain" type="button" (click)="call.toggleLayout()"
                          [title]="call.layout() === 'pip' ? 'Gallery view' : 'Spotlight view'">
                    {{ call.layout() === 'pip' ? '▦' : '◲' }}</button>
                }
              }
              <button class="cbtn end" type="button" (click)="call.hangUp()" title="Leave the call">✕ Leave</button>
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
      max-height: calc(100vh - 2rem); overflow: auto;
    }
    .call-card.wide { width: min(680px, calc(100vw - 2rem)); }
    .who { display: flex; align-items: center; gap: .7rem; min-width: 0; }
    .avatar {
      width: 40px; height: 40px; flex: none; border-radius: 50%; display: grid; place-items: center;
      background: var(--brand); color: var(--brand-text); font-weight: 600; font-size: .9rem;
    }
    .avatar.big { width: 52px; height: 52px; font-size: 1rem; }
    .meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .name { font-size: .95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status { color: var(--muted); font-size: .8rem; }

    .roster { list-style: none; margin: 0; padding: .4rem .5rem; display: flex; flex-direction: column; gap: .25rem;
              background: var(--bg); border: 1px solid var(--border); border-radius: 8px; font-size: .82rem; }
    .roster li { display: flex; align-items: center; gap: .4rem; }
    .roster .pstate { margin-left: auto; color: var(--muted); font-size: .74rem; }
    .tag { font-size: .68rem; background: var(--surface); border: 1px solid var(--border);
           border-radius: 99px; padding: 0 .35rem; font-style: normal; color: var(--muted); }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--faint); }
    .dot.on { background: #2ecc71; } .dot.ring { background: #f1c40f; }

    .add { position: relative; }
    .search { width: 100%; box-sizing: border-box; padding: .35rem .5rem; font-size: .82rem;
              background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; }
    .results { list-style: none; margin: .25rem 0 0; padding: 0; max-height: 140px; overflow: auto;
               border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
    .results button { display: flex; align-items: center; gap: .4rem; width: 100%; text-align: left;
                      background: none; border: none; border-bottom: 1px solid var(--border);
                      padding: .35rem .5rem; font-size: .82rem; color: var(--text); cursor: pointer; }
    .results button:hover { background: var(--bg); }

    .tiles { display: grid; gap: .4rem; grid-template-columns: repeat(var(--cols, 1), 1fr); position: relative; }
    .tile { position: relative; background: #0b1020; border-radius: 10px; overflow: hidden; aspect-ratio: 4 / 3; }
    .tile video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .tile.local video { transform: scaleX(-1); } /* mirror our own preview, like every other call app */
    .tile .label { position: absolute; left: .35rem; bottom: .3rem; font-size: .7rem; color: #e7ecf5;
                   background: color-mix(in srgb, #0b1020 65%, transparent); border-radius: 6px; padding: 0 .35rem;
                   max-width: calc(100% - .7rem); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tile .warn { color: #ffb4a9; font-style: normal; }
    /* Spotlight: first remote tile fills the row, ours floats in the corner. */
    .tiles:not(.gallery) { grid-template-columns: 1fr; }
    .tiles:not(.gallery) .tile.local {
      position: absolute; right: .5rem; bottom: .5rem; width: 28%; aspect-ratio: 4 / 3;
      border: 1px solid color-mix(in srgb, var(--surface) 25%, transparent); border-radius: 8px;
    }
    .camoff { position: absolute; inset: 0; display: grid; place-items: center; gap: .3rem; color: var(--border-strong); }
    .camoff small { font-size: .72rem; }

    .meters { display: flex; align-items: center; gap: .6rem; font-size: .78rem; color: var(--muted); }
    .meter { display: inline-flex; align-items: center; gap: .3rem; }
    .bar { display: inline-block; width: 54px; height: 6px; border-radius: 99px; background: var(--border); overflow: hidden; }
    .bar b { display: block; height: 100%; background: #2ecc71; transition: width .2s linear; }
    .flags { margin-left: auto; }
    .flags .bad { color: var(--danger); font-weight: 600; }

    .unlock { background: var(--warning-soft); color: var(--warning); border: 1px solid #f5d98a; border-radius: 8px;
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
    .cbtn.icon { padding: .2rem .5rem; }
    .cbtn.accept { background: var(--success); border-color: transparent; color: var(--on-accent); }
    .cbtn.end { background: transparent; color: var(--danger); border-color: color-mix(in srgb, var(--danger-border) 40%, transparent); }
    .cbtn.plain.on { background: var(--brand); color: var(--brand-text); border-color: transparent; }
    @media (prefers-reduced-motion: no-preference) {
      .call-card { animation: rise .18s ease-out; }
      @keyframes rise { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
    }
  `],
})
export class CallOverlayComponent {
  readonly call = inject(CallService);
  private chat = inject(ChatService);

  readonly rosterOpen = signal(false);
  readonly directory = signal<DirectoryUser[]>([]);
  query = '';

  readonly showVideo = computed(() =>
    this.call.isVideo() && this.call.phase() !== 'incoming' && this.call.phase() !== 'ended');

  /** One column for a spotlight, otherwise a square-ish grid that fits everyone including us. */
  readonly gridColumns = computed(() => {
    if (this.call.layout() === 'pip') return 1;
    const tiles = this.call.peers().length + 1;
    return tiles <= 1 ? 1 : tiles <= 4 ? 2 : 3;
  });

  readonly initials = computed(() => this.nameInitials(this.call.title()));

  readonly status = computed(() => {
    const kind = this.call.isVideo() ? 'video' : 'audio';
    const ringing = this.call.ringingCount();
    switch (this.call.phase()) {
      case 'incoming': return `Incoming ${kind} call…`;
      case 'outgoing': return ringing > 1 ? `Ringing ${ringing} people…` : 'Calling…';
      case 'connecting': return 'Connecting…';
      case 'active': {
        const people = this.call.joinedCount();
        const extra = ringing ? ` · ${ringing} ringing` : '';
        return `${formatDuration(this.call.elapsed())} · ${people} on call${extra}`;
      }
      case 'ended': return this.call.message() ?? 'Call ended';
      default: return '';
    }
  });

  readonly volumePercent = computed(() => Math.round(this.call.volume() * 100));
  readonly micPercent = computed(() => levelToPercent(this.call.micLevel()));
  readonly loudestPeerPercent = computed(() =>
    levelToPercent(Math.max(0, ...this.call.peers().map(p => p.stats?.level ?? 0))));

  /** Connected peers whose audio isn't arriving — the thing to name when someone says "I can't hear". */
  readonly silentPeers = computed(() =>
    this.call.peers().filter(p => p.connected && p.stats && !p.stats.receiving).map(p => p.displayName));

  readonly matches = computed(() => {
    const q = this.query.trim().toLowerCase();
    if (q.length < 1) return [];
    const inCall = new Set(this.call.roster().map(p => p.userId));
    return this.directory()
      .filter(u => !inCall.has(u.id) && u.displayName.toLowerCase().includes(q))
      .slice(0, 6);
  });

  loadDirectory(): void {
    if (this.directory().length) return;
    this.chat.directory().subscribe({ next: d => this.directory.set(d), error: () => {} });
  }

  add(user: DirectoryUser): void {
    this.query = '';
    this.call.addParticipant(user.id);
  }

  nameInitials(name: string): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return '?';
    return trimmed.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
  }

  onVolume(event: Event): void {
    this.call.setVolume(Number((event.target as HTMLInputElement).value) / 100);
  }

  onSpeaker(event: Event): void {
    void this.call.selectSpeaker((event.target as HTMLSelectElement).value);
  }

  onMic(event: Event): void {
    void this.call.selectMic((event.target as HTMLSelectElement).value);
  }

  onCamera(event: Event): void {
    void this.call.selectCamera((event.target as HTMLSelectElement).value);
  }
}

/** Audio levels are 0..1 but conversational speech sits low — scale so the bar is actually readable. */
function levelToPercent(level: number | undefined): number {
  if (!level || level <= 0) return 0;
  return Math.min(100, Math.round(Math.sqrt(level) * 140));
}

/** Re-exported so templates can type the tile list. */
export type { PeerView };
