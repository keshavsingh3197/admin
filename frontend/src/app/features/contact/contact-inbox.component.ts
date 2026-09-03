import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ContactInboxService } from '../../core/services/contact.service';
import { ContactStatus, ContactSubmission } from '../../core/models/contact.models';

const FILTERS: { key: ContactStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'Unread' },
  { key: 'replied', label: 'Replied' },
  { key: 'spam', label: 'Spam' },
  { key: 'archived', label: 'Archived' },
];

/**
 * Messages sent through the portfolio's "Contact me" form, and the reply thread for each one.
 *
 * Replies are recorded here but sent from your own mail client: the API has no outbound mail path, so
 * the panel gives you a pre-filled mail link and then tracks whether you confirmed sending it. That's
 * deliberately honest — a "sent" tick that only meant "saved" would be worse than none.
 */
@Component({
  selector: 'app-contact-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1>Contact inbox</h1>
          <p class="subtitle">Messages from the portfolio contact form.
            @if (summaryUnread() > 0) { <strong>{{ summaryUnread() }} unread</strong> }
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
          @for (s of submissions(); track s.id) {
            <button class="row" [class.on]="s.id === active()?.id" [class.unread]="s.status === 'new'"
                    (click)="open(s)">
              <span class="row-top">
                <span class="who">{{ s.name }}</span>
                <span class="when">{{ s.createdAt | date:'d MMM, HH:mm' }}</span>
              </span>
              <span class="preview">{{ s.message }}</span>
              <span class="row-tags">
                <span class="tag" [class.spam]="s.status === 'spam'">{{ s.status }}</span>
                @if (s.replies.length) { <span class="tag">{{ s.replies.length }} repl{{ s.replies.length === 1 ? 'y' : 'ies' }}</span> }
              </span>
            </button>
          }
          @if (!submissions().length && !loading()) { <p class="muted pad">Nothing here.</p> }
          @if (loading()) { <p class="muted pad">Loading…</p> }
        </div>

        <div class="col detail">
          @if (active(); as s) {
            <header class="d-head">
              <div>
                <strong>{{ s.name }}</strong>
                <a class="email" [href]="'mailto:' + s.email">{{ s.email }}</a>
              </div>
              <div class="d-ops">
                <a class="btn primary xs" [href]="mailtoFor(s)" target="_blank" rel="noopener"
                   title="Open your mail client with this reply">✉ Open in mail app</a>
                <button class="btn secondary xs" (click)="setStatus(s, 'archived')">Archive</button>
                <button class="btn secondary xs" (click)="setStatus(s, 'spam')">Spam</button>
                <button class="btn danger xs" (click)="remove(s)">Delete</button>
              </div>
            </header>

            <div class="meta">
              <span>Received {{ s.createdAt | date:'medium' }}</span>
              <span>· via {{ s.source }}</span>
              @if (s.latitude !== null && s.longitude !== null) {
                <a [href]="mapUrl(s)" target="_blank" rel="noopener noreferrer">· 📍 shared location</a>
              }
              @if (s.userAgent) { <span class="ua" [title]="s.userAgent">· {{ s.userAgent }}</span> }
            </div>

            <div class="thread">
              <div class="bubble in">
                <span class="body">{{ s.message }}</span>
                <span class="time">{{ s.createdAt | date:'shortTime' }}</span>
              </div>
              @for (r of s.replies; track $index) {
                <div class="bubble out">
                  <span class="body">{{ r.body }}</span>
                  <span class="time">{{ r.sentAt | date:'d MMM, HH:mm' }}
                    @if (r.markedSent) { · sent ✓ }
                    @else { · <button class="mini" (click)="markSent(s, $index)">mark as sent</button> }
                  </span>
                </div>
              }
            </div>

            <form class="composer" (ngSubmit)="sendReply(s)">
              <textarea class="input" rows="3" [(ngModel)]="draft" name="draft"
                        placeholder="Write a reply — it's saved here, then send it from your mail app…"></textarea>
              <button class="btn primary sm" type="submit" [disabled]="!draft.trim() || busy()">Save reply</button>
            </form>
            <p class="note">Replies are recorded here. Use <strong>Open in mail app</strong> to actually send —
              this API has no mail sender configured.</p>
          } @else {
            <p class="muted pad">Select a message to read it and reply.</p>
          }
        </div>
      </div>

      @if (error()) { <div class="toast">{{ error() }}</div> }
    </div>
  `,
  styles: [`
    .page { padding: 1.5rem; max-width: 1100px; margin: 0 auto; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    h1 { margin: 0; }
    .subtitle { color: var(--muted); font-size: .88rem; margin: .2rem 0 0; }
    .tabs { display: flex; gap: .25rem; flex-wrap: wrap; }
    .tab { background: var(--bg); border: 1px solid var(--border); border-radius: 7px;
           padding: .35rem .7rem; cursor: pointer; color: var(--text); font-size: .82rem; }
    .tab.on { background: var(--brand); color: var(--brand-text); border-color: transparent; }
    .grid { display: grid; grid-template-columns: 340px 1fr; gap: 1rem; margin-top: 1rem; }
    .col { border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
           overflow: hidden; max-height: 72vh; overflow-y: auto; }
    .row { display: flex; flex-direction: column; gap: .25rem; width: 100%; text-align: left;
           background: none; border: none; border-bottom: 1px solid var(--border);
           padding: .6rem .8rem; cursor: pointer; color: var(--text); }
    .row:hover { background: var(--bg); }
    .row.on { background: color-mix(in srgb, var(--brand) 10%, var(--surface)); }
    .row.unread .who { font-weight: 700; }
    .row-top { display: flex; justify-content: space-between; gap: .5rem; font-size: .88rem; }
    .when { color: var(--muted); font-size: .74rem; white-space: nowrap; }
    .preview { color: var(--muted); font-size: .8rem; overflow: hidden; text-overflow: ellipsis;
               white-space: nowrap; }
    .row-tags { display: flex; gap: .3rem; }
    .tag { font-size: .7rem; background: var(--bg); border: 1px solid var(--border);
           border-radius: 99px; padding: 0 .45rem; text-transform: capitalize; color: var(--muted); }
    .tag.spam { background: var(--danger-soft); color: var(--danger); border-color: var(--danger-border); }
    .detail { display: flex; flex-direction: column; }
    .d-head { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem;
              flex-wrap: wrap; padding: .7rem .9rem; border-bottom: 1px solid var(--border); }
    .d-head strong { display: block; }
    .email { font-size: .82rem; }
    .d-ops { display: flex; gap: .3rem; flex-wrap: wrap; }
    .meta { display: flex; flex-wrap: wrap; gap: .3rem; padding: .5rem .9rem; color: var(--muted);
            font-size: .76rem; border-bottom: 1px solid var(--border); }
    .ua { max-width: 26rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .thread { flex: 1; display: flex; flex-direction: column; gap: .5rem; padding: .9rem; background: var(--bg); }
    .bubble { max-width: 78%; display: flex; flex-direction: column; gap: .25rem;
              border: 1px solid var(--border); border-radius: 12px; padding: .5rem .7rem; background: var(--surface); }
    .bubble.out { align-self: flex-end; background: var(--brand); color: var(--brand-text); border-color: transparent; }
    .body { white-space: pre-wrap; word-break: break-word; font-size: .9rem; }
    .time { font-size: .68rem; opacity: .75; align-self: flex-end; }
    .mini { background: none; border: none; color: inherit; text-decoration: underline;
            cursor: pointer; font-size: .68rem; padding: 0; }
    .composer { display: flex; gap: .5rem; align-items: flex-end; padding: .7rem .9rem;
                border-top: 1px solid var(--border); }
    .composer .input { flex: 1; }
    .input { padding: .5rem .65rem; border: 1px solid var(--border); border-radius: 8px;
             background: var(--bg); color: var(--text); font-size: .88rem; font-family: inherit; width: 100%; }
    .note { margin: 0; padding: 0 .9rem .8rem; color: var(--muted); font-size: .76rem; }
    .btn { display: inline-flex; align-items: center; gap: .35rem; border: 1px solid transparent;
           border-radius: 7px; padding: .45rem .8rem; font-size: .85rem; cursor: pointer; text-decoration: none; }
    .btn.sm { padding: .35rem .7rem; font-size: .82rem; } .btn.xs { padding: .25rem .55rem; font-size: .76rem; }
    .btn.primary { background: var(--brand); color: var(--brand-text); }
    .btn.secondary { background: var(--bg); color: var(--text); border-color: var(--border); }
    .btn.danger { background: transparent; color: var(--danger); border-color: color-mix(in srgb, var(--danger-border) 40%, transparent); }
    .btn:disabled { opacity: .5; cursor: default; }
    .muted { color: var(--muted); } .pad { padding: 1rem; }
    .toast { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); background: var(--danger-soft);
             color: var(--danger); border: 1px solid var(--danger-border); border-radius: 8px; padding: .6rem 1rem; z-index: 50; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class ContactInboxComponent implements OnInit {
  private api = inject(ContactInboxService);

  readonly filters = FILTERS;
  submissions = signal<ContactSubmission[]>([]);
  active = signal<ContactSubmission | null>(null);
  filter = signal<ContactStatus | 'all'>('all');
  error = signal<string | null>(null);
  loading = signal(false);
  busy = signal(false);
  draft = '';

  readonly summaryUnread = computed(() => this.submissions().filter(s => s.status === 'new').length);

  ngOnInit(): void { this.load(); }

  setFilter(key: ContactStatus | 'all'): void {
    this.filter.set(key);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const status = this.filter();
    this.api.list(status === 'all' ? undefined : status).subscribe({
      next: list => {
        this.submissions.set(list);
        this.loading.set(false);
        // Keep the open message in sync with the refreshed list.
        const open = this.active();
        if (open) this.active.set(list.find(s => s.id === open.id) ?? null);
      },
      error: () => { this.loading.set(false); this.error.set('Could not load the inbox.'); },
    });
  }

  open(s: ContactSubmission): void {
    this.draft = '';
    this.active.set(s);
    // Fetching marks it read server-side, so refresh the list to drop the unread styling.
    this.api.open(s.id).subscribe({
      next: full => { this.active.set(full); if (s.status === 'new') this.load(); },
      error: () => this.error.set('Could not open that message.'),
    });
  }

  sendReply(s: ContactSubmission): void {
    const body = this.draft.trim();
    if (!body) return;
    this.busy.set(true);
    this.api.reply(s.id, body).subscribe({
      next: updated => { this.draft = ''; this.active.set(updated); this.busy.set(false); this.load(); },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.error ?? 'Could not save the reply.');
      },
    });
  }

  markSent(s: ContactSubmission, index: number): void {
    this.api.markReplySent(s.id, index).subscribe({
      next: updated => this.active.set(updated),
      error: () => this.error.set('Could not update that reply.'),
    });
  }

  setStatus(s: ContactSubmission, status: ContactStatus): void {
    this.api.setStatus(s.id, status).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Could not update the message.'),
    });
  }

  remove(s: ContactSubmission): void {
    if (!confirm(`Delete the message from ${s.name}? This cannot be undone.`)) return;
    this.api.remove(s.id).subscribe({
      next: () => { this.active.set(null); this.load(); },
      error: () => this.error.set('Could not delete the message.'),
    });
  }

  /** A mail-client link pre-filled with the latest saved reply — how a reply actually gets sent. */
  mailtoFor(s: ContactSubmission): string {
    const latest = s.replies.length ? s.replies[s.replies.length - 1].body : '';
    const quoted = s.message.split('\n').map(line => `> ${line}`).join('\n');
    const body = `${latest}\n\n---\nYou wrote:\n${quoted}`;
    return `mailto:${encodeURIComponent(s.email)}`
      + `?subject=${encodeURIComponent('Re: your message')}`
      + `&body=${encodeURIComponent(body)}`;
  }

  mapUrl(s: ContactSubmission): string {
    return `https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=13/${s.latitude}/${s.longitude}`;
  }
}
