import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditService } from '../../core/services/audit.service';
import { AuditEntry } from '../../core/models/audit.models';

/** How an event is presented: a plain-English name and the tone it should read in. */
interface EventStyle {
  label: string;
  tone: 'neutral' | 'ok' | 'warn' | 'danger';
}

/**
 * Plain-English names for the event keys, so the trail is readable by whoever is on call rather
 * than only by someone who knows the constants. An unlisted key falls back to its raw name — new
 * events show up in the viewer immediately, just less prettily, which beats being invisible.
 */
const EVENT_STYLES: Record<string, EventStyle> = {
  'login.password.success': { label: 'Signed in', tone: 'ok' },
  'login.password.failed': { label: 'Failed sign-in', tone: 'warn' },
  'login.locked_out': { label: 'Account locked out', tone: 'danger' },
  'login.social.success': { label: 'Signed in (social)', tone: 'ok' },
  'login.social.failed': { label: 'Failed social sign-in', tone: 'warn' },
  'login.social.blocked': { label: 'Social sign-in blocked', tone: 'danger' },
  '2fa.success': { label: 'Second factor passed', tone: 'ok' },
  '2fa.failed': { label: 'Second factor failed', tone: 'warn' },
  '2fa.enrolled': { label: 'Authenticator enrolled', tone: 'neutral' },
  '2fa.disabled': { label: 'Two-factor disabled', tone: 'danger' },
  '2fa.backup_code.used': { label: 'Backup code used', tone: 'warn' },
  '2fa.reenroll.blocked': { label: 'Re-enrollment blocked', tone: 'danger' },
  'token.refreshed': { label: 'Session refreshed', tone: 'neutral' },
  'token.reuse_detected': { label: 'Refresh token reused', tone: 'danger' },
  'password.changed': { label: 'Password changed', tone: 'neutral' },
  logout: { label: 'Signed out', tone: 'neutral' },
  'admin.user.created': { label: 'User created', tone: 'neutral' },
  'admin.user.updated': { label: 'User updated', tone: 'neutral' },
  'admin.user.deleted': { label: 'User deleted', tone: 'danger' },
  'admin.user.password_reset': { label: 'Password reset by admin', tone: 'warn' },
  'admin.role.changed': { label: 'Role changed', tone: 'warn' },
  'admin.group.changed': { label: 'Group changed', tone: 'neutral' },
  'admin.grant.changed': { label: 'Membership changed', tone: 'warn' },
  'admin.settings.changed': { label: 'Settings changed', tone: 'warn' },
  'admin.console.write': { label: 'Database console write', tone: 'danger' },
  'admin.backup.created': { label: 'Backup created', tone: 'neutral' },
  'admin.retention.purge': { label: 'Retention purge', tone: 'neutral' },
};

const PAGE_SIZE = 50;

/**
 * The audit trail: sign-ins, second factors, token reuse, and administrative actions in one
 * timeline, newest first.
 *
 * <para>Read-only by construction — there is no endpoint behind this screen that edits or deletes a
 * row, because an audit log an administrator can quietly edit is not one. Ageing rows out is the
 * retention sweep's job.</para>
 */
@Component({
  selector: 'app-audit',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="stack">
      <header class="spread">
        <div>
          <h1 class="page-title">Audit log</h1>
          <p class="subtitle">Who did what, and when. Read-only.</p>
        </div>
        <button class="btn-secondary" type="button" (click)="reload()" [disabled]="loading()">
          {{ loading() ? 'Loading…' : 'Refresh' }}
        </button>
      </header>

      <div class="card filters">
        <label class="field grow">
          <span>Search</span>
          <input class="input" type="search" placeholder="Email, target, or IP address"
                 [ngModel]="search()" (ngModelChange)="onSearch($event)" />
        </label>

        <label class="field">
          <span>Event</span>
          <select class="input" [ngModel]="eventFilter()" (ngModelChange)="setEvent($event)">
            <option value="">All events</option>
            <option value="admin.">— Administrative actions only —</option>
            @for (name of knownEvents(); track name) {
              <option [value]="name">{{ styleFor(name).label }}</option>
            }
          </select>
        </label>

        <label class="field">
          <span>Outcome</span>
          <select class="input" [ngModel]="outcome()" (ngModelChange)="setOutcome($event)">
            <option value="">Any</option>
            <option value="true">Succeeded</option>
            <option value="false">Failed</option>
          </select>
        </label>

        <label class="field">
          <span>From</span>
          <input class="input" type="date" [ngModel]="from()" (ngModelChange)="setFrom($event)" />
        </label>

        <label class="field">
          <span>To</span>
          <input class="input" type="date" [ngModel]="to()" (ngModelChange)="setTo($event)" />
        </label>

        @if (hasFilters()) {
          <button class="btn-link" type="button" (click)="clearFilters()">Clear</button>
        }
      </div>

      @if (error(); as message) {
        <div class="banner" role="alert">{{ message }}</div>
      }

      <div class="card card-flush">
        <div class="table-scroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              @for (row of entries(); track row.id) {
                <tr>
                  <td class="when" [title]="row.timestamp">{{ row.timestamp | date: 'medium' }}</td>
                  <td>
                    <span class="status" [class]="toneClass(row)">
                      {{ styleFor(row.event).label }}
                    </span>
                  </td>
                  <td class="truncate">{{ row.actor }}</td>
                  <td class="truncate faint">{{ row.target || '—' }}</td>
                  <td class="details">{{ row.details || '—' }}</td>
                  <td class="faint mono">{{ row.ipAddress || '—' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6">
                    <p class="empty">
                      {{ loading() ? 'Loading…' : (hasFilters() ? 'Nothing matches these filters.' : 'Nothing recorded yet.') }}
                    </p>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (total() > 0) {
        <div class="spread pager">
          <span class="hint">{{ rangeLabel() }}</span>
          <span class="row">
            <button class="btn-secondary btn-sm" type="button" (click)="page(-1)" [disabled]="skip() === 0 || loading()">
              ← Newer
            </button>
            <button class="btn-secondary btn-sm" type="button" (click)="page(1)" [disabled]="!hasMore() || loading()">
              Older →
            </button>
          </span>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-3); }
    .filters .field { min-width: 9rem; }
    .filters .field.grow { flex: 1; min-width: 14rem; }
    .when { white-space: nowrap; color: var(--muted); font-variant-numeric: tabular-nums; }
    .details { max-width: 26rem; }
    .mono { font-family: var(--font-mono); font-size: var(--text-xs); }
    .pager { padding: 0 var(--space-1); }
    td .status { font-weight: 600; }
  `],
})
export class AuditComponent {
  private api = inject(AuditService);

  readonly entries = signal<AuditEntry[]>([]);
  readonly total = signal(0);
  readonly skip = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly knownEvents = signal<string[]>([]);

  readonly search = signal('');
  readonly eventFilter = signal('');
  readonly outcome = signal('');
  readonly from = signal('');
  readonly to = signal('');

  readonly hasFilters = computed(() =>
    !!(this.search() || this.eventFilter() || this.outcome() || this.from() || this.to()));

  readonly hasMore = computed(() => this.skip() + PAGE_SIZE < this.total());

  readonly rangeLabel = computed(() => {
    const first = this.total() === 0 ? 0 : this.skip() + 1;
    const last = Math.min(this.skip() + this.entries().length, this.total());
    return `${first}–${last} of ${this.total()}`;
  });

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.reload();
    this.api.events().subscribe({
      next: names => this.knownEvents.set(names),
      // A missing filter list is a degraded screen, not a broken one — the table still loads.
      error: () => this.knownEvents.set([]),
    });
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .list({
        event: this.eventFilter() || undefined,
        q: this.search().trim() || undefined,
        success: this.outcome() === '' ? undefined : this.outcome() === 'true',
        // A date input gives a local calendar day; `to` is exclusive server-side, so the day the
        // user picked is included by asking for everything before the following midnight.
        from: this.from() ? new Date(this.from()).toISOString() : undefined,
        to: this.to() ? new Date(new Date(this.to()).getTime() + 86_400_000).toISOString() : undefined,
        skip: this.skip(),
        take: PAGE_SIZE,
      })
      .subscribe({
        next: page => {
          this.entries.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('The audit log could not be loaded.');
          this.entries.set([]);
          this.loading.set(false);
        },
      });
  }

  /** Typing re-queries the server, so it is debounced; every other filter applies immediately. */
  onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilter(), 300);
  }

  setEvent(value: string): void { this.eventFilter.set(value); this.applyFilter(); }
  setOutcome(value: string): void { this.outcome.set(value); this.applyFilter(); }
  setFrom(value: string): void { this.from.set(value); this.applyFilter(); }
  setTo(value: string): void { this.to.set(value); this.applyFilter(); }

  clearFilters(): void {
    this.search.set('');
    this.eventFilter.set('');
    this.outcome.set('');
    this.from.set('');
    this.to.set('');
    this.applyFilter();
  }

  page(direction: 1 | -1): void {
    this.skip.update(current => Math.max(0, current + direction * PAGE_SIZE));
    this.reload();
  }

  styleFor(event: string): EventStyle {
    return EVENT_STYLES[event] ?? { label: event, tone: 'neutral' };
  }

  /** A failed event reads as a failure whatever its usual tone — the outcome outranks the label. */
  toneClass(row: AuditEntry): string {
    return row.success ? this.styleFor(row.event).tone : 'down';
  }

  /** Any filter change returns to the first page: staying on page 4 of a different result set is a bug. */
  private applyFilter(): void {
    this.skip.set(0);
    this.reload();
  }
}
