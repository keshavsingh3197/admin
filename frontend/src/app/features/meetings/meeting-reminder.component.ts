import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CallService } from '../../core/services/call.service';
import { ChatService } from '../../core/services/chat.service';
import { MeetingsService } from '../../core/services/meetings.service';
import { Meeting } from '../../core/models/meeting.models';

const SNOOZE_MINUTES = 5;

/**
 * "Your meeting starts in 10 minutes" — mounted by the app shell so it shows on any page, not just the
 * calendar. Join opens the call there and then; Snooze puts it back for a few minutes; Dismiss drops it.
 * A desktop notification is raised too when the tab is in the background and permission was granted.
 */
@Component({
  selector: 'app-meeting-reminder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (reminder(); as r) {
      <div class="reminder" role="alert">
        <span class="ico" aria-hidden="true">⏰</span>
        <span class="text">
          <strong>{{ r.title }}</strong>
          <small>{{ r.minutesUntil <= 0 ? 'Starting now' : 'Starts in ' + r.minutesUntil + ' min' }}</small>
        </span>
        <span class="ops">
          <button class="rbtn primary" type="button" [disabled]="calls.busy()" (click)="join(r.meetingId)">Join</button>
          <button class="rbtn" type="button" (click)="snooze()" [title]="'Remind me in ' + snoozeMinutes + ' minutes'">Snooze</button>
          <button class="rbtn ghost" type="button" (click)="dismiss()" aria-label="Dismiss">✕</button>
        </span>
      </div>
    }
  `,
  styles: [`
    .reminder {
      position: fixed; left: 50%; transform: translateX(-50%); bottom: 1rem; z-index: 55;
      display: flex; align-items: center; gap: .7rem; max-width: min(520px, calc(100vw - 2rem));
      padding: .6rem .8rem; background: var(--surface); color: var(--text);
      border: 1px solid var(--border); border-left: 4px solid var(--brand);
      border-radius: 10px; box-shadow: 0 10px 30px color-mix(in srgb, #0a1020 22%, transparent);
    }
    .ico { font-size: 1.1rem; }
    .text { display: flex; flex-direction: column; min-width: 0; }
    .text strong { font-size: .9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .text small { color: var(--muted); font-size: .78rem; }
    .ops { display: flex; gap: .3rem; margin-left: auto; }
    .rbtn { border: 1px solid var(--border); background: var(--bg); color: var(--text);
            border-radius: 7px; padding: .3rem .6rem; font-size: .8rem; cursor: pointer; }
    .rbtn.primary { background: var(--brand); color: var(--brand-text); border-color: transparent; }
    .rbtn.ghost { border-color: transparent; background: none; color: var(--muted); }
    .rbtn:disabled { opacity: .5; cursor: default; }
    @media (prefers-reduced-motion: no-preference) {
      .reminder { animation: slide-up .2s ease-out; }
      @keyframes slide-up { from { transform: translate(-50%, 10px); opacity: 0; }
                            to { transform: translate(-50%, 0); opacity: 1; } }
    }
    @media (max-width: 560px) {
      .reminder { flex-wrap: wrap; }
      .ops { width: 100%; justify-content: flex-end; }
    }
  `],
})
export class MeetingReminderComponent {
  private chat = inject(ChatService);
  private api = inject(MeetingsService);
  private router = inject(Router);
  readonly calls = inject(CallService);

  readonly snoozeMinutes = SNOOZE_MINUTES;

  /** Set while snoozed, so the same reminder stays hidden until the timer fires. */
  private snoozed = signal(false);
  private snoozeTimer: ReturnType<typeof setTimeout> | null = null;

  readonly reminder = computed(() => (this.snoozed() ? null : this.chat.meetingReminder()));

  constructor() {
    // Also raise a desktop notification when the tab isn't in front — a banner nobody sees is no use.
    effect(() => {
      const r = this.chat.meetingReminder();
      if (!r) return;
      this.snoozed.set(false);
      try {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        if (!document.hidden) return;
        new Notification(r.title, {
          body: r.minutesUntil <= 0 ? 'Starting now' : `Starts in ${r.minutesUntil} min`,
          tag: `ks-meeting-${r.meetingId}`,
        });
      } catch { /* notifications unavailable */ }
    });
  }

  join(meetingId: string): void {
    this.dismiss();
    this.api.get(meetingId).subscribe({
      next: (m: Meeting) => {
        void this.calls.joinMeeting(m.id, m.media);
        void this.router.navigate(['/meetings']);
      },
      // If it can't be fetched (cancelled, or the window closed), at least show the calendar.
      error: () => void this.router.navigate(['/meetings']),
    });
  }

  snooze(): void {
    this.snoozed.set(true);
    if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
    this.snoozeTimer = setTimeout(() => this.snoozed.set(false), SNOOZE_MINUTES * 60_000);
  }

  dismiss(): void {
    if (this.snoozeTimer) { clearTimeout(this.snoozeTimer); this.snoozeTimer = null; }
    this.snoozed.set(false);
    this.chat.meetingReminder.set(null);
  }
}
