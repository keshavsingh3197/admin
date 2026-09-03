import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, interval, switchMap, throttleTime } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { VisitorChatService } from '../../core/services/visitor-chat.service';
import {
  VisitorChatMessageView, VisitorChatSessionView, VisitorChatStatus, VisitorChatThread,
} from '../../core/models/visitor-chat.models';

const FILTERS: { key: VisitorChatStatus | 'all'; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'all', label: 'All' },
  { key: 'closed', label: 'Closed' },
  { key: 'blocked', label: 'Blocked' },
];

/** How often the queue and the open conversation refresh, in milliseconds. */
const QUEUE_POLL_MS = 6_000;
const THREAD_POLL_MS = 3_000;

/**
 * Live chat with people on the public sites — the bubble on the portfolio, answered from here. Kept
 * separate from Messages on purpose: those are colleagues with accounts, these are strangers, and the
 * two want different handling (no presence to trust, moderation to hand, personal data to be careful of).
 *
 * There is no socket for this: the visitor side is anonymous and the hub is authenticated, so both ends
 * poll. Typing is a timestamp the server expires, which is why a closed tab never leaves a stuck dot.
 */
@Component({
  selector: 'app-visitor-chat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1>Visitor chat</h1>
          <p class="subtitle">
            People chatting from the public sites.
            @if (waiting() > 0) { <strong>{{ waiting() }} waiting</strong> · }
            {{ onlineCount() }} online now
          </p>
        </div>
        <div class="tabs">
          @for (f of filters; track f.key) {
            <button class="tab" [class.on]="filter() === f.key" (click)="setFilter(f.key)">{{ f.label }}</button>
          }
        </div>
      </header>

      <div class="grid">
        <div class="col list">
          @for (s of sessions(); track s.id) {
            <button class="row" [class.on]="s.id === active()?.id" [class.unread]="s.unreadForStaff > 0"
                    (click)="open(s)">
              <span class="row-top">
                <span class="who">
                  <span class="dot" [class.live]="s.visitorOnline" aria-hidden="true"></span>
                  {{ s.displayName || 'Visitor' }}
                </span>
                <span class="when">{{ s.lastMessageAt | date:'d MMM, HH:mm' }}</span>
              </span>
              <span class="preview">
                @if (s.visitorTyping) { <em>typing…</em> } @else { {{ s.lastMessagePreview }} }
              </span>
              <span class="row-tags">
                <span class="tag">{{ s.source }}</span>
                @if (s.status !== 'open') { <span class="tag warn">{{ s.status }}</span> }
                @if (s.unreadForStaff > 0) { <span class="tag badge">{{ s.unreadForStaff }}</span> }
              </span>
            </button>
          }
          @if (!sessions().length && !loading()) { <p class="muted pad">No conversations yet.</p> }
          @if (loading()) { <p class="muted pad">Loading…</p> }
        </div>

        <div class="col detail">
          @if (active(); as s) {
            <header class="d-head">
              <div>
                <strong>
                  <span class="dot" [class.live]="s.visitorOnline" aria-hidden="true"></span>
                  {{ s.displayName || 'Visitor' }}
                </strong>
                @if (s.email) { <a class="email" [href]="'mailto:' + s.email">{{ s.email }}</a> }
                <span class="muted small">· from {{ s.source }} · started {{ s.createdAt | date:'d MMM, HH:mm' }}</span>
              </div>
              @if (isAdmin()) {
                <div class="d-ops">
                  @if (s.status === 'open') {
                    <button class="btn secondary xs" (click)="setStatus(s, 'closed')">Close</button>
                  } @else {
                    <button class="btn secondary xs" (click)="setStatus(s, 'open')">Reopen</button>
                  }
                  <button class="btn secondary xs" (click)="setStatus(s, 'blocked')">Block</button>
                  <button class="btn danger xs" (click)="remove(s)">Delete</button>
                </div>
              }
            </header>

            <div class="thread">
              @for (m of messages(); track m.id) {
                <div class="bubble" [class.out]="m.author === 'staff'">
                  <span class="body">{{ m.body }}</span>
                  <span class="time">
                    @if (m.author === 'staff' && m.staffName) { {{ m.staffName }} · }
                    {{ m.sentAt | date:'d MMM, HH:mm' }}
                  </span>
                </div>
              }
              @if (s.visitorTyping) {
                <div class="bubble typing" aria-live="polite">
                  <span class="body"><em>{{ s.displayName || 'Visitor' }} is typing…</em></span>
                </div>
              }
            </div>

            @if (s.status === 'blocked') {
              <p class="note">This visitor is blocked — they can't send anything, and replies won't reach them.</p>
            } @else {
              <form class="composer" (ngSubmit)="send(s)">
                <textarea class="input" rows="2" [(ngModel)]="draft" name="draft"
                          (ngModelChange)="onTyping(s)"
                          placeholder="Reply — they see it in the chat bubble on the site…"></textarea>
                <button class="btn primary sm" type="submit" [disabled]="!draft.trim() || busy()">Send</button>
              </form>
            }
          } @else {
            <p class="muted pad">Pick a conversation to read and answer it.</p>
          }
        </div>
      </div>

      @if (error()) { <div class="toast" (click)="error.set(null)">{{ error() }}</div> }
    </div>
  `,
  styles: [`
    .page { padding:1.5rem; max-width:1150px; margin:0 auto; }
    .head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
    h1 { margin:0; }
    .subtitle { color:var(--muted); font-size:.88rem; margin:.2rem 0 0; }
    .tabs { display:flex; gap:.25rem; flex-wrap:wrap; }
    .tab { background:var(--bg); border:1px solid var(--border); border-radius:7px; padding:.35rem .7rem;
      cursor:pointer; color:var(--text); font-size:.82rem; }
    .tab.on { background:var(--brand); color:var(--brand-text); border-color:transparent; }
    .grid { display:grid; grid-template-columns:330px 1fr; gap:1rem; margin-top:1rem; }
    .col { border:1px solid var(--border); border-radius:12px; background:var(--surface); overflow:hidden;
      max-height:74vh; overflow-y:auto; }
    .row { display:flex; flex-direction:column; gap:.25rem; width:100%; text-align:left; background:none;
      border:none; border-bottom:1px solid var(--border); padding:.6rem .8rem; cursor:pointer; color:var(--text); }
    .row:hover { background:var(--bg); }
    .row.on { background:color-mix(in srgb, var(--brand) 10%, var(--surface)); }
    .row.unread .who { font-weight:700; }
    .row-top { display:flex; justify-content:space-between; gap:.5rem; font-size:.88rem; }
    .who { display:inline-flex; align-items:center; gap:.35rem; }
    .dot { width:.5rem; height:.5rem; border-radius:50%; background:var(--border); flex:none; }
    .dot.live { background:var(--success); box-shadow:0 0 0 2px color-mix(in srgb, var(--success) 25%, transparent); }
    .when { color:var(--muted); font-size:.74rem; white-space:nowrap; }
    .preview { color:var(--muted); font-size:.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .row-tags { display:flex; gap:.3rem; }
    .tag { font-size:.7rem; background:var(--bg); border:1px solid var(--border); border-radius:99px;
      padding:0 .45rem; color:var(--muted); }
    .tag.warn { background:var(--warning-soft); color:var(--warning); border-color:#f7d794; }
    .tag.badge { background:var(--brand); color:var(--brand-text); border-color:transparent; }
    .detail { display:flex; flex-direction:column; }
    .d-head { display:flex; align-items:flex-start; justify-content:space-between; gap:.5rem; flex-wrap:wrap;
      padding:.7rem .9rem; border-bottom:1px solid var(--border); }
    .d-head strong { display:inline-flex; align-items:center; gap:.4rem; }
    .email { font-size:.82rem; margin-left:.4rem; }
    .d-ops { display:flex; gap:.3rem; flex-wrap:wrap; }
    .thread { flex:1; display:flex; flex-direction:column; gap:.5rem; padding:.9rem; background:var(--bg);
      min-height:12rem; }
    .bubble { max-width:78%; display:flex; flex-direction:column; gap:.25rem; border:1px solid var(--border);
      border-radius:12px; padding:.5rem .7rem; background:var(--surface); }
    .bubble.out { align-self:flex-end; background:var(--brand); color:var(--brand-text); border-color:transparent; }
    .bubble.typing { opacity:.75; }
    .body { white-space:pre-wrap; word-break:break-word; font-size:.9rem; }
    .time { font-size:.68rem; opacity:.75; align-self:flex-end; }
    .composer { display:flex; gap:.5rem; align-items:flex-end; padding:.7rem .9rem; border-top:1px solid var(--border); }
    .composer .input { flex:1; }
    .input { padding:.5rem .65rem; border:1px solid var(--border); border-radius:8px; background:var(--bg);
      color:var(--text); font-size:.88rem; font-family:inherit; width:100%; box-sizing:border-box; }
    .note { margin:0; padding:.8rem .9rem; color:var(--muted); font-size:.8rem; border-top:1px solid var(--border); }
    .btn { display:inline-flex; align-items:center; gap:.35rem; border:1px solid transparent; border-radius:7px;
      padding:.45rem .8rem; font-size:.85rem; cursor:pointer; }
    .btn.sm { padding:.35rem .7rem; font-size:.82rem; } .btn.xs { padding:.25rem .55rem; font-size:.76rem; }
    .btn.primary { background:var(--brand); color:var(--brand-text); }
    .btn.secondary { background:var(--bg); color:var(--text); border-color:var(--border); }
    .btn.danger { background:transparent; color:var(--danger); border-color:color-mix(in srgb, var(--danger-border) 40%, transparent); }
    .btn:disabled { opacity:.5; cursor:default; }
    .muted { color:var(--muted); } .small { font-size:.78rem; } .pad { padding:1rem; }
    .toast { position:fixed; bottom:1rem; left:50%; transform:translateX(-50%); background:var(--danger-soft); color:var(--danger);
      border:1px solid var(--danger-border); border-radius:8px; padding:.6rem 1rem; z-index:50; cursor:pointer; }
    @media (max-width: 900px) { .grid { grid-template-columns:1fr; } }
  `],
})
export class VisitorChatComponent implements OnInit {
  private api = inject(VisitorChatService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  readonly filters = FILTERS;

  sessions = signal<VisitorChatSessionView[]>([]);
  active = signal<VisitorChatSessionView | null>(null);
  messages = signal<VisitorChatMessageView[]>([]);
  filter = signal<VisitorChatStatus | 'all'>('open');
  loading = signal(false);
  busy = signal(false);
  error = signal<string | null>(null);
  draft = '';

  readonly waiting = computed(() =>
    this.sessions().reduce((total, s) => total + (s.unreadForStaff > 0 ? 1 : 0), 0));
  readonly onlineCount = computed(() => this.sessions().filter(s => s.visitorOnline).length);

  /** Typing pings are throttled: one every few seconds is enough to keep the dot alive. */
  private readonly typing$ = new Subject<string>();

  isAdmin(): boolean { return this.auth.hasRole('Admin'); }

  ngOnInit(): void {
    this.load();

    interval(QUEUE_POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshQueue());

    interval(THREAD_POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshThread());

    this.typing$
      .pipe(throttleTime(3_000), switchMap(id => this.api.typing(id)), takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => {} });
  }

  setFilter(key: VisitorChatStatus | 'all'): void {
    this.filter.set(key);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.fetchQueue(() => this.loading.set(false));
  }

  private refreshQueue(): void {
    if (this.loading()) return;
    this.fetchQueue();
  }

  private fetchQueue(done?: () => void): void {
    const status = this.filter();
    this.api.list(status === 'all' ? undefined : status).subscribe({
      next: list => {
        this.sessions.set(list);
        // Keep the open conversation's header (online, typing, status) in step with the queue.
        const open = this.active();
        if (open) {
          const fresh = list.find(s => s.id === open.id);
          if (fresh) this.active.set(fresh);
        }
        done?.();
      },
      error: () => { done?.(); this.error.set('Could not load the visitor queue.'); },
    });
  }

  open(session: VisitorChatSessionView): void {
    this.draft = '';
    this.active.set(session);
    this.messages.set([]);
    this.api.open(session.id).subscribe({
      next: thread => this.apply(thread, true),
      error: () => this.error.set('Could not open that conversation.'),
    });
  }

  private refreshThread(): void {
    const session = this.active();
    if (!session) return;
    const after = this.messages().at(-1)?.id ?? null;
    this.api.poll(session.id, after).subscribe({
      next: thread => this.apply(thread, false),
      error: () => {},
    });
  }

  /** Appends what arrived (or replaces the thread when it was just opened) and refreshes the header. */
  private apply(thread: VisitorChatThread, replace: boolean): void {
    this.active.set(thread.session);
    this.messages.update(current => replace ? thread.messages : [...current, ...thread.messages]);
  }

  send(session: VisitorChatSessionView): void {
    const body = this.draft.trim();
    if (!body) return;
    this.busy.set(true);
    this.api.reply(session.id, body).subscribe({
      next: message => {
        this.draft = '';
        this.busy.set(false);
        this.messages.update(current => [...current, message]);
        this.refreshQueue();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.error ?? 'Could not send that reply.');
      },
    });
  }

  onTyping(session: VisitorChatSessionView): void {
    if (this.draft.trim()) this.typing$.next(session.id);
  }

  setStatus(session: VisitorChatSessionView, status: VisitorChatStatus): void {
    if (status === 'blocked' && !confirm('Block this visitor? They will not be able to send anything else.')) return;
    this.api.setStatus(session.id, status).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Could not update that conversation.'),
    });
  }

  remove(session: VisitorChatSessionView): void {
    if (!confirm('Delete this conversation and everything in it? This cannot be undone.')) return;
    this.api.remove(session.id).subscribe({
      next: () => { this.active.set(null); this.messages.set([]); this.load(); },
      error: () => this.error.set('Could not delete that conversation.'),
    });
  }
}
