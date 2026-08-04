import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CallService, formatDuration } from '../../core/services/call.service';

/**
 * The call card. Mounted by the app shell (not by the Messages page) so a call can ring, connect and
 * be hung up from anywhere in admin. Audio playback lives in CallService, not here — this is only UI.
 */
@Component({
  selector: 'app-call-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (call.busy()) {
      <div class="call-card" role="dialog" aria-label="Call">
        <div class="who">
          <span class="avatar" aria-hidden="true">{{ initials() }}</span>
          <span class="meta">
            <strong class="name">{{ call.partnerName() || 'Unknown' }}</strong>
            <span class="status" aria-live="polite">{{ status() }}</span>
          </span>
        </div>

        <div class="actions">
          @switch (call.phase()) {
            @case ('incoming') {
              <button class="cbtn accept" type="button" (click)="call.accept()" title="Answer">📞 Answer</button>
              <button class="cbtn end" type="button" (click)="call.decline()" title="Decline">Decline</button>
            }
            @case ('ended') {
              <button class="cbtn plain" type="button" (click)="call.dismiss()">Dismiss</button>
            }
            @default {
              @if (call.onCall()) {
                <button class="cbtn plain" type="button" [class.on]="call.muted()" (click)="call.toggleMute()"
                        [title]="call.muted() ? 'Unmute' : 'Mute'">{{ call.muted() ? '🔇 Muted' : '🎙️ Mute' }}</button>
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
      position: fixed; right: 1rem; bottom: 1rem; z-index: 60; width: min(320px, calc(100vw - 2rem));
      display: flex; flex-direction: column; gap: .75rem; padding: .9rem 1rem;
      background: var(--surface); color: var(--text); border: 1px solid var(--border);
      border-radius: 14px; box-shadow: 0 10px 30px color-mix(in srgb, #0a1020 25%, transparent);
    }
    .who { display: flex; align-items: center; gap: .7rem; min-width: 0; }
    .avatar {
      width: 40px; height: 40px; flex: none; border-radius: 50%; display: grid; place-items: center;
      background: var(--brand); color: var(--brand-text); font-weight: 600; font-size: .9rem;
    }
    .meta { display: flex; flex-direction: column; min-width: 0; }
    .name { font-size: .95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status { color: var(--muted); font-size: .8rem; }
    .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
    .cbtn { border: 1px solid var(--border); background: var(--bg); color: var(--text);
            border-radius: 8px; padding: .4rem .7rem; font-size: .82rem; cursor: pointer; }
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

  readonly initials = computed(() => {
    const name = this.call.partnerName().trim();
    if (!name) return '?';
    return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
  });

  readonly status = computed(() => {
    switch (this.call.phase()) {
      case 'incoming': return 'Incoming audio call…';
      case 'outgoing': return 'Calling…';
      case 'connecting': return 'Connecting…';
      case 'active': return formatDuration(this.call.elapsed());
      case 'ended': return this.call.message() ?? 'Call ended';
      default: return '';
    }
  });
}
