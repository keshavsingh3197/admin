import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CallService } from '../../core/services/call.service';
import { ChatService } from '../../core/services/chat.service';
import { MeetingsService } from '../../core/services/meetings.service';
import { Meeting, SaveMeeting } from '../../core/models/meeting.models';
import { CallMedia } from '../../core/models/call.models';
import { Conversation, DirectoryUser } from '../../core/models/chat.models';

type MeetingsView = 'agenda' | 'calendar';

interface MonthCell {
  /** Local yyyy-mm-dd. */
  key: string;
  date: number;
  inMonth: boolean;
  isToday: boolean;
  items: Meeting[];
}

const VIEW_KEY = 'admin.meetings.view';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The meeting calendar: an agenda of what's coming up or a month grid, a form to schedule one, and a
 * Join button that opens the meeting's call room once the window is open. Reminders arrive over the
 * chat hub (the shell shows them), so this page doesn't poll.
 */
@Component({
  selector: 'app-meetings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="head">
        <h1>Meetings</h1>
        <div class="head-tools">
          <div class="seg" role="tablist" aria-label="View">
            <button class="seg-btn" [class.on]="view() === 'agenda'" (click)="setView('agenda')"
                    role="tab" [attr.aria-selected]="view() === 'agenda'">☰ Agenda</button>
            <button class="seg-btn" [class.on]="view() === 'calendar'" (click)="setView('calendar')"
                    role="tab" [attr.aria-selected]="view() === 'calendar'">▦ Calendar</button>
          </div>
          @if (view() === 'agenda') {
            <label class="chk"><input type="checkbox" [(ngModel)]="includePast" (ngModelChange)="load()" /> Show past</label>
          }
          @if (canAskForAlerts()) {
            <button class="btn secondary sm" (click)="enableAlerts()" title="Show reminders as desktop notifications">
              🔔 Alerts</button>
          }
          <button class="btn primary sm" (click)="openForm()">＋ Schedule</button>
        </div>
      </header>

      @if (view() === 'calendar') {
        <section class="cal">
          <header class="cal-head">
            <button class="btn secondary xs" (click)="shiftMonth(-1)" aria-label="Previous month">‹</button>
            <strong>{{ monthLabel() }}</strong>
            <button class="btn secondary xs" (click)="shiftMonth(1)" aria-label="Next month">›</button>
            <button class="btn secondary xs today" (click)="goToday()">Today</button>
          </header>
          <div class="cal-grid">
            @for (d of weekdayNames; track d) { <span class="cal-dow">{{ d }}</span> }
            @for (cell of monthCells(); track cell.key) {
              <div class="cal-cell"
                   [class.other]="!cell.inMonth" [class.today]="cell.isToday"
                   [class.sel]="cell.key === selectedDay()">
                <button class="cal-date-btn" type="button" (click)="selectDay(cell.key)"
                        [attr.aria-label]="'Show ' + cell.key">
                  <span class="cal-date">{{ cell.date }}</span>
                </button>
                @for (m of cell.items.slice(0, 3); track m.id) {
                  <button class="chip" type="button" [class.cancelled]="m.status === 'cancelled'"
                          [title]="m.title" (click)="open(m)">{{ m.startsAt | date:'HH:mm' }} {{ m.title }}</button>
                }
                @if (cell.items.length > 3) {
                  <button class="more" type="button" (click)="selectDay(cell.key)">+{{ cell.items.length - 3 }} more</button>
                }
              </div>
            }
          </div>
        </section>
      }

      @for (group of grouped(); track group.day) {
        <section class="day">
          <h2>{{ group.day }}</h2>
          @for (m of group.items; track m.id) {
            <article class="card" [class.cancelled]="m.status === 'cancelled'"
                     [class.sel]="m.id === selected()?.id" (click)="open(m)">
              <div class="when">
                <strong>{{ m.startsAt | date:'shortTime' }}</strong>
                <small>{{ m.durationMinutes }} min</small>
              </div>
              <div class="what">
                <span class="title">{{ m.media === 'video' ? '📹' : '📞' }} {{ m.title }}
                  @if (m.status === 'cancelled') { <em class="tag">cancelled</em> }
                  @else if (m.status === 'started') { <em class="tag live">in progress</em> }
                </span>
                @if (m.description) { <span class="desc">{{ m.description }}</span> }
                <span class="people">
                  {{ m.isOwner ? 'You' : m.ownerName }} ·
                  {{ m.invitees.length }} invited@if (m.invitees.length) { : {{ inviteeNames(m) }} }
                </span>
              </div>
              <div class="ops">
                @if (m.canJoin && m.status !== 'cancelled') {
                  <button class="btn primary xs" [disabled]="calls.busy()"
                          (click)="join(m); $event.stopPropagation()">Join</button>
                }
                <button class="btn secondary xs" (click)="open(m); $event.stopPropagation()">Details</button>
              </div>
            </article>
          }
        </section>
      }
      @if (!meetings().length) { <p class="muted pad">Nothing scheduled. Use ＋ Schedule to add a meeting.</p> }

      <!-- Details panel: everything about one meeting, plus the things you do to it. -->
      @if (selected(); as m) {
        <div class="overlay" (click)="closeDetails()">
          <div class="panel wide" (click)="$event.stopPropagation()">
            <header class="p-head">
              <span class="p-title">{{ m.media === 'video' ? '📹' : '📞' }} {{ m.title }}</span>
              <button class="icon-btn" (click)="closeDetails()" aria-label="Close">✕</button>
            </header>

            <div class="p-body pad">
              <dl class="facts">
                <dt>When</dt>
                <dd>{{ m.startsAt | date:'EEEE d MMM, HH:mm' }} – {{ endOf(m) | date:'HH:mm' }}
                  <span class="muted">({{ m.durationMinutes }} min)</span></dd>

                <dt>Status</dt>
                <dd>
                  <span class="tag" [class.live]="m.status === 'started'">{{ m.status }}</span>
                  @if (m.canJoin && m.status !== 'cancelled') { <span class="tag live">joinable now</span> }
                </dd>

                <dt>Organiser</dt>
                <dd>{{ m.isOwner ? 'You' : m.ownerName }}</dd>

                <dt>Participants</dt>
                <dd class="people-list">
                  @for (i of m.invitees; track i.id) { <span class="member">{{ i.displayName }}</span> }
                  @if (!m.invitees.length) { <span class="muted">Nobody invited yet.</span> }
                </dd>

                @if (m.description) {
                  <dt>Notes</dt>
                  <dd class="notes">{{ m.description }}</dd>
                }

                <dt>Meeting link</dt>
                <dd class="link-row">
                  <input class="input" readonly [value]="api.linkFor(m.id)" (click)="selectAll($event)" />
                  <button class="btn secondary xs" (click)="copyLink(m)">{{ copied() ? 'Copied' : 'Copy' }}</button>
                </dd>
              </dl>

              @if (m.isOwner && addingPeople()) {
                <div class="add-people">
                  <span class="lbl">Add participants</span>
                  @for (u of addableFor(m); track u.id) {
                    <button class="dir-row" type="button" (click)="togglePick(u)">
                      <span class="pick">{{ picked().includes(u.id) ? '☑' : '☐' }}</span>
                      <span class="dot" [class]="u.presence"></span>{{ u.displayName }}
                    </button>
                  }
                  @if (!addableFor(m).length) { <p class="muted pad">Everyone available is already invited.</p> }
                  <div class="add-ops">
                    <button class="btn primary xs" [disabled]="!picked().length" (click)="addPeople(m)">Add</button>
                    <button class="btn secondary xs" (click)="addingPeople.set(false)">Done</button>
                  </div>
                </div>
              }

              @if (detailError()) { <p class="err">{{ detailError() }}</p> }
            </div>

            <footer class="p-foot wrap">
              @if (m.canJoin && m.status !== 'cancelled') {
                <button class="btn primary sm" [disabled]="calls.busy()" (click)="join(m)">Join call</button>
              }
              @if (m.isOwner && m.status !== 'cancelled') {
                <button class="btn secondary sm" (click)="openForm(m)">Edit</button>
                <button class="btn secondary sm" (click)="addingPeople.set(!addingPeople())">＋ Participants</button>
                <button class="btn secondary sm" (click)="cancel(m)">Cancel meeting</button>
              }
              @if (m.isOwner) {
                <button class="btn danger sm" (click)="remove(m)">Delete</button>
              }
            </footer>
          </div>
        </div>
      }

      @if (formOpen()) {
        <div class="overlay" (click)="formOpen.set(false)">
          <div class="panel" (click)="$event.stopPropagation()">
            <header class="p-head">
              <span class="p-title">{{ editing() ? 'Edit meeting' : 'Schedule a meeting' }}</span>
              <button class="icon-btn" (click)="formOpen.set(false)">✕</button>
            </header>
            <div class="p-body pad">
              <label class="f">Title
                <input class="input" [(ngModel)]="form.title" name="title" placeholder="What's it about?" />
              </label>
              <label class="f">Notes
                <textarea class="input" rows="2" [(ngModel)]="form.description" name="description"
                          placeholder="Agenda, dial-in notes…"></textarea>
              </label>
              <div class="row">
                <label class="f">Starts
                  <input class="input" type="datetime-local" [(ngModel)]="form.localStart" name="startsAt" />
                </label>
                <label class="f narrow">Minutes
                  <input class="input" type="number" min="5" max="480" step="5"
                         [(ngModel)]="form.durationMinutes" name="duration" />
                </label>
              </div>
              <div class="row">
                <label class="f">Kind
                  <select class="input" [(ngModel)]="form.media" name="media">
                    <option value="video">📹 Video</option>
                    <option value="audio">📞 Audio</option>
                  </select>
                </label>
                <label class="f">Post summary to
                  <select class="input" [(ngModel)]="form.conversationId" name="conversationId">
                    <option value="">No thread</option>
                    @for (c of threads(); track c.id) {
                      <option [value]="c.id">{{ c.isGroup ? '👪 ' : '' }}{{ c.partnerName }}</option>
                    }
                  </select>
                </label>
              </div>
              <label class="chk"><input type="checkbox" [(ngModel)]="form.postSummary" name="postSummary" />
                Print a per-person summary in that thread when the call ends</label>

              <div class="invitees">
                <span class="lbl">Invite ({{ form.inviteeUserIds.length }})</span>
                @for (u of directory(); track u.id) {
                  <button class="dir-row" type="button" (click)="toggleInvitee(u)">
                    <span class="pick">{{ form.inviteeUserIds.includes(u.id) ? '☑' : '☐' }}</span>
                    <span class="dot" [class]="u.presence"></span>{{ u.displayName }}
                  </button>
                }
                @if (!directory().length) { <p class="muted">Nobody to invite yet.</p> }
              </div>
            </div>
            <footer class="p-foot">
              @if (formError()) { <span class="err">{{ formError() }}</span> }
              <button class="btn primary sm" (click)="save()">{{ editing() ? 'Save' : 'Schedule' }}</button>
            </footer>
          </div>
        </div>
      }

      @if (error()) { <div class="toast">{{ error() }}</div> }
    </div>
  `,
  styles: [`
    .page { padding: 1.5rem; max-width: 900px; margin: 0 auto; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; flex-wrap: wrap; }
    .head-tools { display: flex; align-items: center; gap: .75rem; }
    h1 { margin: 0; }
    h2 { font-size: .82rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted);
         margin: 1.25rem 0 .5rem; }
    .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .seg-btn { background: var(--surface); color: var(--muted); border: none; padding: .35rem .7rem;
               font-size: .82rem; cursor: pointer; }
    .seg-btn.on { background: var(--brand); color: var(--brand-text); }

    .cal { margin-top: 1rem; border: 1px solid var(--border); border-radius: 12px;
           background: var(--surface); overflow: hidden; }
    .cal-head { display: flex; align-items: center; gap: .5rem; padding: .6rem .8rem;
                border-bottom: 1px solid var(--border); }
    .cal-head strong { min-width: 10rem; text-align: center; }
    .cal-head .today { margin-left: auto; }
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
    .cal-dow { padding: .4rem; text-align: center; font-size: .72rem; text-transform: uppercase;
               letter-spacing: .04em; color: var(--muted); border-bottom: 1px solid var(--border); }
    .cal-cell { display: flex; flex-direction: column; gap: .15rem; align-items: stretch; min-height: 92px;
                padding: .3rem; border-right: 1px solid var(--border);
                border-bottom: 1px solid var(--border); text-align: left; color: var(--text); }
    .cal-cell:nth-child(7n+1) { border-right: 1px solid var(--border); }
    .cal-cell:hover { background: var(--bg); }
    .cal-cell.other { opacity: .45; }
    .cal-cell.sel { background: color-mix(in srgb, var(--brand) 12%, transparent); }
    .cal-date-btn { background: none; border: none; padding: 0; cursor: pointer; align-self: flex-start; }
    .cal-date { font-size: .78rem; color: var(--muted); }
    .cal-cell.today .cal-date { background: var(--brand); color: var(--brand-text); border-radius: 99px;
                                padding: 0 .35rem; }
    .chip { font-size: .68rem; background: color-mix(in srgb, var(--brand) 16%, var(--surface));
            border: none; color: var(--text); text-align: left; cursor: pointer;
            border-radius: 4px; padding: .05rem .25rem; overflow: hidden; text-overflow: ellipsis;
            white-space: nowrap; }
    .chip:hover { background: color-mix(in srgb, var(--brand) 28%, var(--surface)); }
    .chip.cancelled { text-decoration: line-through; opacity: .6; }
    .more { font-size: .66rem; color: var(--muted); background: none; border: none; cursor: pointer;
            text-align: left; padding: 0; }

    .card { cursor: pointer; }
    .card.sel { border-color: var(--brand); }
    .panel.wide { width: min(620px, 94%); }
    .facts { display: grid; grid-template-columns: 8rem 1fr; gap: .4rem .6rem; margin: 0; }
    .facts dt { color: var(--muted); font-size: .8rem; }
    .facts dd { margin: 0; font-size: .88rem; }
    .notes { white-space: pre-wrap; }
    .people-list { display: flex; flex-wrap: wrap; gap: .3rem; }
    .member { font-size: .8rem; background: var(--bg); border: 1px solid var(--border);
              border-radius: 99px; padding: .1rem .5rem; }
    .link-row { display: flex; gap: .35rem; align-items: center; }
    .link-row .input { font-size: .78rem; }
    .add-people { display: flex; flex-direction: column; border: 1px solid var(--border);
                  border-radius: 8px; margin-top: .6rem; max-height: 220px; overflow: auto; }
    .add-ops { display: flex; gap: .35rem; padding: .4rem .6rem; }
    .p-foot.wrap { flex-wrap: wrap; justify-content: flex-start; }
    .card { display: grid; grid-template-columns: 90px 1fr auto; gap: .75rem; align-items: center;
            border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
            padding: .7rem .9rem; margin-bottom: .5rem; }
    .card.cancelled { opacity: .6; }
    .when { display: flex; flex-direction: column; }
    .when small { color: var(--muted); font-size: .74rem; }
    .what { display: flex; flex-direction: column; gap: .15rem; min-width: 0; }
    .title { font-weight: 600; font-size: .92rem; }
    .desc, .people { color: var(--muted); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; }
    .tag { font-size: .7rem; font-style: normal; background: var(--bg); border: 1px solid var(--border);
           border-radius: 99px; padding: 0 .4rem; color: var(--muted); }
    .tag.live { background: var(--success-soft); color: var(--success); border-color: var(--success-border); }
    .ops { display: flex; gap: .3rem; }
    .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: var(--faint); }
    .dot.online { background: #2ecc71; } .dot.idle { background: #f1c40f; }
    .chk { display: inline-flex; align-items: center; gap: .4rem; color: var(--muted); font-size: .85rem; }
    .btn { display: inline-flex; align-items: center; gap: .4rem; border: 1px solid transparent;
           border-radius: 7px; padding: .5rem .85rem; font-size: .88rem; cursor: pointer; }
    .btn.sm { padding: .35rem .7rem; font-size: .82rem; } .btn.xs { padding: .25rem .55rem; font-size: .78rem; }
    .btn.primary { background: var(--brand); color: var(--brand-text); }
    .btn.secondary { background: var(--bg); color: var(--text); border-color: var(--border); }
    .btn.danger { background: transparent; color: var(--danger); border-color: color-mix(in srgb, var(--danger-border) 40%, transparent); }
    .btn:disabled { opacity: .5; cursor: default; }
    .icon-btn { background: var(--bg); border: 1px solid var(--border); border-radius: 7px; width: 30px; height: 30px; cursor: pointer; }
    .overlay { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
               background: color-mix(in srgb, #0a1020 55%, transparent); backdrop-filter: blur(2px); }
    .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
             width: min(520px, 94%); max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; }
    .p-head, .p-foot { display: flex; align-items: center; justify-content: space-between; gap: .5rem;
                       padding: .7rem 1rem; border-bottom: 1px solid var(--border); }
    .p-foot { border-bottom: none; border-top: 1px solid var(--border); }
    .p-title { font-weight: 600; }
    .p-body { overflow: auto; display: flex; flex-direction: column; gap: .6rem; }
    .f { display: flex; flex-direction: column; gap: .2rem; font-size: .82rem; color: var(--muted); flex: 1; }
    .f.narrow { max-width: 110px; }
    .row { display: flex; gap: .6rem; }
    .input { padding: .45rem .6rem; border: 1px solid var(--border); border-radius: 8px;
             background: var(--bg); color: var(--text); font-size: .88rem; width: 100%; box-sizing: border-box; }
    .invitees { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 8px;
                max-height: 180px; overflow: auto; }
    .lbl { font-size: .78rem; color: var(--muted); padding: .4rem .6rem; border-bottom: 1px solid var(--border); }
    .dir-row { display: flex; align-items: center; gap: .45rem; width: 100%; text-align: left; background: none;
               border: none; border-bottom: 1px solid var(--border); padding: .4rem .6rem; cursor: pointer;
               color: var(--text); font-size: .85rem; }
    .dir-row:hover { background: var(--bg); }
    .pick { width: 1rem; }
    .err { color: var(--danger); font-size: .8rem; }
    .muted { color: var(--muted); } .pad { padding: 1rem; }
    .toast { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); background: var(--danger-soft);
             color: var(--danger); border: 1px solid var(--danger-border); border-radius: 8px; padding: .6rem 1rem; z-index: 50; }
    @media (max-width: 640px) { .card { grid-template-columns: 1fr; } .row { flex-direction: column; } }
  `],
})
export class MeetingsComponent {
  readonly api = inject(MeetingsService);
  readonly chat = inject(ChatService);
  readonly calls = inject(CallService);
  private route = inject(ActivatedRoute);

  meetings = signal<Meeting[]>([]);
  directory = signal<DirectoryUser[]>([]);
  threads = signal<Conversation[]>([]);
  formOpen = signal(false);
  editing = signal<Meeting | null>(null);
  error = signal<string | null>(null);
  formError = signal<string | null>(null);
  includePast = false;

  /** The meeting whose details panel is open. */
  readonly selected = signal<Meeting | null>(null);
  readonly addingPeople = signal(false);
  readonly picked = signal<string[]>([]);
  readonly copied = signal(false);
  readonly detailError = signal<string | null>(null);

  /** Agenda (a list) or Calendar (a month grid); remembered between visits. */
  readonly view = signal<MeetingsView>(loadView());
  /** Which month the grid is showing, as the 1st of that month. */
  readonly month = signal(startOfMonth(new Date()));
  /** yyyy-mm-dd of the day clicked in the grid, which the agenda below then filters to. */
  readonly selectedDay = signal<string | null>(null);
  readonly alertsAsked = signal(false);

  readonly weekdayNames = WEEKDAYS;

  form: {
    title: string; description: string; localStart: string; durationMinutes: number;
    media: CallMedia; postSummary: boolean; conversationId: string; inviteeUserIds: string[];
  } = this.blankForm();

  /** Agenda grouped by local day, so the list reads like a calendar. */
  readonly grouped = computed(() => {
    const selected = this.selectedDay();
    const source = selected ? this.meetings().filter(m => dayKey(new Date(m.startsAt)) === selected) : this.meetings();
    const groups = new Map<string, Meeting[]>();
    for (const m of source) {
      const day = new Date(m.startsAt).toLocaleDateString(undefined,
        { weekday: 'short', day: 'numeric', month: 'short' });
      (groups.get(day) ?? groups.set(day, []).get(day)!).push(m);
    }
    return [...groups.entries()].map(([day, items]) => ({ day, items }));
  });

  readonly monthLabel = computed(() =>
    this.month().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));

  /**
   * The month grid: six weeks starting on the Monday on or before the 1st, each cell carrying that
   * day's meetings. Built from local dates so a meeting lands on the day the user actually sees.
   */
  readonly monthCells = computed<MonthCell[]>(() => {
    const byDay = new Map<string, Meeting[]>();
    for (const m of this.meetings()) {
      const key = dayKey(new Date(m.startsAt));
      (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(m);
    }

    const first = this.month();
    const cursor = new Date(first);
    // Monday-first: getDay() is 0 for Sunday, so shift it into 0..6 with Monday at 0.
    cursor.setDate(1 - ((first.getDay() + 6) % 7));

    const todayKey = dayKey(new Date());
    const cells: MonthCell[] = [];
    for (let i = 0; i < 42; i++) {
      const key = dayKey(cursor);
      cells.push({
        key,
        date: cursor.getDate(),
        inMonth: cursor.getMonth() === first.getMonth(),
        isToday: key === todayKey,
        items: (byDay.get(key) ?? []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return cells;
  });

  /** Only offer the alerts button when the browser can be asked (not granted, not blocked). */
  readonly canAskForAlerts = computed(() =>
    !this.alertsAsked() && typeof Notification !== 'undefined' && Notification.permission === 'default');

  setView(view: MeetingsView): void {
    this.view.set(view);
    localStorage.setItem(VIEW_KEY, view);
    // The calendar shows a whole month, which usually means past days too.
    if (view === 'calendar' && !this.includePast) { this.includePast = true; this.load(); }
    if (view === 'agenda') this.selectedDay.set(null);
  }

  shiftMonth(delta: number): void {
    const next = new Date(this.month());
    next.setMonth(next.getMonth() + delta);
    this.month.set(startOfMonth(next));
    this.selectedDay.set(null);
  }

  goToday(): void {
    this.month.set(startOfMonth(new Date()));
    this.selectedDay.set(dayKey(new Date()));
  }

  selectDay(key: string): void {
    this.selectedDay.update(current => (current === key ? null : key));
  }

  /** Asks for notification permission — must be from a click, which is why it's a button. */
  async enableAlerts(): Promise<void> {
    this.alertsAsked.set(true);
    try { await Notification.requestPermission(); } catch { /* denied or unsupported */ }
  }

  constructor() {
    // Runs once on init, then whenever the hub reports a meeting changed (created, edited, cancelled).
    effect(() => { this.chat.meetingsDirty(); this.load(); });

    // ?meeting=<id> is the shareable meeting link: open that meeting's details straight away.
    const shared = this.route.snapshot.queryParamMap.get('meeting');
    if (shared) {
      this.api.get(shared).subscribe({
        next: m => this.open(m),
        error: () => this.error.set('That meeting is no longer available.'),
      });
    }
  }

  // ---- Details panel ----

  open(meeting: Meeting): void {
    this.detailError.set(null);
    this.addingPeople.set(false);
    this.picked.set([]);
    this.copied.set(false);
    this.selected.set(meeting);
    // Load the people list once, so "add participants" is ready without another click.
    if (!this.directory().length) {
      this.chat.directory().subscribe({ next: d => this.directory.set(d), error: () => {} });
    }
  }

  closeDetails(): void {
    this.selected.set(null);
    this.addingPeople.set(false);
    this.picked.set([]);
  }

  endOf(m: Meeting): Date {
    return new Date(new Date(m.startsAt).getTime() + m.durationMinutes * 60_000);
  }

  /** People not already on the invite list — what the add-participants picker offers. */
  addableFor(m: Meeting): DirectoryUser[] {
    const invited = new Set([...m.invitees.map(i => i.id), m.ownerUserId]);
    return this.directory().filter(u => !invited.has(u.id));
  }

  togglePick(u: DirectoryUser): void {
    this.picked.update(list => list.includes(u.id) ? list.filter(id => id !== u.id) : [...list, u.id]);
  }

  addPeople(m: Meeting): void {
    const ids = this.picked();
    if (!ids.length) return;
    this.api.addInvitees(m.id, ids).subscribe({
      next: updated => {
        this.picked.set([]);
        this.selected.set(updated);
        this.load();
      },
      error: (e: HttpErrorResponse) => this.detailError.set(e.error?.error ?? 'Could not add them.'),
    });
  }

  async copyLink(m: Meeting): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.api.linkFor(m.id));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      // Clipboard blocked (insecure context or permission) — the field is selectable as a fallback.
      this.detailError.set('Could not copy — select the link and copy it manually.');
    }
  }

  selectAll(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  remove(m: Meeting): void {
    if (!confirm(`Delete “${m.title}” for everyone? Cancelling instead keeps the record.`)) return;
    this.api.delete(m.id).subscribe({
      next: () => { this.closeDetails(); this.load(); },
      error: () => this.detailError.set('Could not delete the meeting.'),
    });
  }

  load(): void {
    this.api.list(this.includePast).subscribe({
      next: m => this.meetings.set(m),
      error: () => this.error.set('Could not load your meetings.'),
    });
  }

  inviteeNames(m: Meeting): string {
    return m.invitees.map(i => i.displayName).join(', ');
  }

  openForm(meeting?: Meeting): void {
    this.formError.set(null);
    this.selected.set(null); // the form takes over from the details panel
    this.editing.set(meeting ?? null);
    this.form = meeting ? this.formFrom(meeting) : this.blankForm();
    this.formOpen.set(true);
    this.chat.directory().subscribe({ next: d => this.directory.set(d), error: () => {} });
    this.chat.conversations().subscribe({
      next: c => this.threads.set(c.filter(t => t.status === 'accepted')),
      error: () => {},
    });
  }

  toggleInvitee(u: DirectoryUser): void {
    const list = this.form.inviteeUserIds;
    this.form.inviteeUserIds = list.includes(u.id) ? list.filter(id => id !== u.id) : [...list, u.id];
  }

  save(): void {
    const payload = this.toPayload();
    if (!payload) return;
    const editing = this.editing();
    const request = editing ? this.api.update(editing.id, payload) : this.api.create(payload);
    request.subscribe({
      next: () => { this.formOpen.set(false); this.load(); },
      error: (e: HttpErrorResponse) => this.formError.set(e.error?.error ?? 'Could not save the meeting.'),
    });
  }

  cancel(m: Meeting): void {
    if (!confirm(`Cancel “${m.title}”? Invitees will see it as cancelled.`)) return;
    this.api.cancel(m.id).subscribe({
      next: () => { this.closeDetails(); this.load(); },
      error: () => this.detailError.set('Could not cancel the meeting.'),
    });
  }

  join(m: Meeting): void {
    this.chat.meetingReminder.set(null);
    this.closeDetails();
    void this.calls.joinMeeting(m.id, m.media);
  }

  private blankForm() {
    // Default to the next half hour, which is what people almost always want.
    const start = new Date();
    start.setMinutes(start.getMinutes() + 30 - (start.getMinutes() % 30), 0, 0);
    return {
      title: '', description: '', localStart: toLocalInput(start), durationMinutes: 30,
      media: 'video' as CallMedia, postSummary: true, conversationId: '', inviteeUserIds: [] as string[],
    };
  }

  private formFrom(m: Meeting) {
    return {
      title: m.title,
      description: m.description ?? '',
      localStart: toLocalInput(new Date(m.startsAt)),
      durationMinutes: m.durationMinutes,
      media: m.media,
      postSummary: m.postSummary,
      conversationId: m.conversationId ?? '',
      inviteeUserIds: m.invitees.map(i => i.id),
    };
  }

  private toPayload(): SaveMeeting | null {
    const title = this.form.title.trim();
    if (!title) { this.formError.set('Give the meeting a title.'); return null; }
    const start = new Date(this.form.localStart);
    if (Number.isNaN(start.getTime())) { this.formError.set('Pick a valid start time.'); return null; }
    if (!this.form.inviteeUserIds.length) { this.formError.set('Invite at least one person.'); return null; }

    return {
      title,
      description: this.form.description.trim() || null,
      startsAt: start.toISOString(), // the API expects a UTC instant
      durationMinutes: Number(this.form.durationMinutes) || 30,
      media: this.form.media,
      postSummary: this.form.postSummary,
      inviteeUserIds: this.form.inviteeUserIds,
      conversationId: this.form.conversationId || null,
    };
  }
}

/** `datetime-local` wants a local-time string with no zone, so build it from the local parts. */
function toLocalInput(date: Date): string {
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Local yyyy-mm-dd — the grid's cell key. Never use toISOString here: that would shift the day. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function loadView(): MeetingsView {
  return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'agenda';
}
