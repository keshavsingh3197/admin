import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UserSession } from '../../core/models/session.models';
import { AuthService } from '../../core/services/auth.service';
import { SessionsService } from '../../core/services/sessions.service';

@Component({
  selector: 'app-sessions',
  imports: [DatePipe],
  template: `
    <div class="page">
      <div class="page-head"><div><p class="eyebrow">Account security</p><h1>Active sessions</h1><p class="lead">Review where your account is signed in across applications.</p></div><button class="secondary" type="button" [disabled]="loading()" (click)="load()">Refresh</button></div>
      @if (message()) { <div class="banner" role="status">{{ message() }}</div> }
      @if (loading()) { <div class="state">Loading sessions…</div> }
      @else if (!sessions().length) { <div class="state"><strong>No active sessions</strong><span>Your active application sessions will appear here.</span></div> }
      @else {
        <div class="session-list">
          @for (session of sessions(); track session.id) {
            <article>
              <div class="app-mark" aria-hidden="true">{{ appDisplayName(session.appKey).slice(0, 2).toUpperCase() }}</div>
              <div class="details"><div class="title-row"><h2>{{ appDisplayName(session.appKey) }}</h2>@if (session.isCurrent) { <span class="badge">Current</span> }</div><strong>{{ session.deviceLabel || 'Unknown device' }}</strong><span>Signed in {{ session.createdAt | date:'medium' }}</span><span>Expires {{ session.expiresAt | date:'medium' }}</span></div>
              <button class="danger" type="button" [disabled]="revokingId() === session.id" (click)="revoke(session)">{{ revokingId() === session.id ? 'Removing…' : (session.isCurrent ? 'Sign out' : 'Revoke') }}</button>
            </article>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page{max-width:820px;margin:0 auto}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1.25rem}.eyebrow{color:var(--brand);font-size:.75rem;font-weight:700;text-transform:uppercase;margin:0 0 .3rem}h1{margin:0;font-size:1.65rem}.lead{color:var(--muted);margin:.4rem 0 0}.session-list{border:1px solid var(--border);border-radius:8px;background:var(--surface);overflow:hidden}.session-list article{display:grid;grid-template-columns:44px 1fr auto;gap:1rem;align-items:center;padding:1rem;border-bottom:1px solid var(--border)}.session-list article:last-child{border-bottom:0}.app-mark{width:44px;height:44px;display:grid;place-items:center;background:color-mix(in srgb,var(--brand) 12%,var(--surface));color:var(--brand);font-weight:800;border:1px solid color-mix(in srgb,var(--brand) 24%,var(--border));border-radius:7px}.details{display:flex;flex-direction:column;gap:.2rem}.details h2{font-size:1rem;margin:0}.details>strong{font-size:.88rem}.details>span{color:var(--muted);font-size:.78rem}.title-row{display:flex;align-items:center;gap:.5rem}.badge{color:var(--success)!important;background:#ecfdf3;border:1px solid var(--success-border);padding:.08rem .4rem;border-radius:999px;font-size:.68rem!important;font-weight:700}.secondary,.danger{font:inherit;padding:.5rem .8rem;border-radius:5px;cursor:pointer;background:transparent}.secondary{border:1px solid var(--border);color:var(--text)}.danger{border:1px solid #fda29b;color:var(--danger)}.danger:hover{background:var(--danger-soft)}.banner,.state{padding:1rem;border:1px solid var(--border);background:var(--surface);border-radius:7px;margin-bottom:1rem}.banner{border-left:3px solid var(--brand)}.state{display:grid;gap:.35rem;text-align:center;color:var(--muted)}button:disabled{opacity:.55;cursor:default}@media(max-width:600px){.session-list article{grid-template-columns:44px 1fr}.session-list article .danger{grid-column:2;justify-self:start}.page-head{flex-direction:column}}
  `],
})
export class SessionsComponent implements OnInit {
  private readonly api = inject(SessionsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly sessions = signal<UserSession[]>([]);
  readonly loading = signal(true);
  readonly revokingId = signal<string | null>(null);
  readonly message = signal('');

  /** Known *.keshavsingh.in app keys, shown plainly instead of a raw slug — every session belongs to
   *  one of these, and "which site am I looking at" should never take a second guess. */
  private static readonly APP_NAMES: Record<string, string> = {
    admin: 'Admin',
    blog: 'Blog',
    'content-blog': 'Blog',
    portfolio: 'Portfolio',
    'ghar-ledger': 'Ghar Ledger',
  };

  appDisplayName(appKey: string): string {
    return SessionsComponent.APP_NAMES[appKey.toLowerCase()]
      ?? appKey.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.list().subscribe({ next: (sessions) => { this.sessions.set(sessions); this.loading.set(false); }, error: () => { this.message.set('Sessions could not be loaded.'); this.loading.set(false); } });
  }

  revoke(session: UserSession) {
    if (!confirm(session.isCurrent ? 'Sign out this session?' : `Revoke the ${session.appKey} session?`)) return;
    this.revokingId.set(session.id);
    this.api.revoke(session.id).subscribe({ next: () => {
      this.revokingId.set(null);
      if (session.isCurrent) { this.auth.forceClear(); void this.router.navigate(['/login']); return; }
      this.sessions.update((items) => items.filter((item) => item.id !== session.id));
      this.message.set('Session revoked.');
    }, error: () => { this.revokingId.set(null); this.message.set('The session could not be revoked.'); } });
  }
}