import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DataRetentionService } from '../../core/services/data-retention.service';
import { DataDomainOverview } from '../../core/models/data-retention.models';

/**
 * Manual, date-ranged purging for time-series data (login audit logs, analytics visits) — on top
 * of the automatic retention-day cleanup already applied every 30 minutes in the background.
 */
@Component({
  selector: 'app-data-retention',
  imports: [FormsModule, DatePipe, RouterLink],
  template: `
    <div class="wrap">
      <div class="head">
        <h1 class="page-title">Data retention</h1>
        <button class="btn-secondary" type="button" [disabled]="loading()" (click)="reload()">Refresh</button>
      </div>
      <p class="lead">Clear old login logs or analytics visit records for a specific date range, or apply each
        domain's configured retention window immediately. Automatic cleanup already runs every 30 minutes using
        the retention days set in <a routerLink="/settings">Settings</a>.</p>

      @if (message()) { <div class="banner" [class.ok]="ok()">{{ message() }}</div> }

      @if (loading()) {
        <p>Loading…</p>
      } @else {
        <div class="domains">
          @for (d of domains(); track d.key) {
            <div class="card">
              <div class="card-head">
                <div>
                  <h2>{{ d.label }}</h2>
                  <p class="muted">{{ d.description }}</p>
                </div>
                <div class="stats">
                  <div><span>Records</span><strong>{{ d.totalCount }}</strong></div>
                  <div><span>Oldest</span><strong>{{ d.oldestUtc ? (d.oldestUtc | date:'medium') : '—' }}</strong></div>
                  <div><span>Newest</span><strong>{{ d.newestUtc ? (d.newestUtc | date:'medium') : '—' }}</strong></div>
                  <div><span>Retention</span><strong>{{ d.retentionDays }} days</strong></div>
                </div>
              </div>

              <div class="actions">
                <button class="btn-secondary" type="button" [disabled]="busy() === d.key"
                  (click)="purgeExpired(d)">
                  {{ busy() === d.key ? 'Working…' : 'Apply retention now (keep last ' + d.retentionDays + ' days)' }}
                </button>
              </div>

              <div class="range-form">
                <span class="section-label">Clear a specific date range</span>
                <div class="range-inputs">
                  <label><span>From</span><input class="input" type="date" name="from-{{ d.key }}" [(ngModel)]="fromDate[d.key]" /></label>
                  <label><span>To</span><input class="input" type="date" name="to-{{ d.key }}" [(ngModel)]="toDate[d.key]" /></label>
                  <button class="btn-danger" type="button" [disabled]="busy() === d.key || !fromDate[d.key] || !toDate[d.key]"
                    (click)="purgeRange(d)">
                    Clear range
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .wrap { max-width: 900px; margin: 0 auto; padding: 1rem; }
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
    .page-title { font-size: 1.5rem; margin: 0; color: var(--text); }
    .lead { color: var(--muted); margin: 0 0 1.1rem; font-size: 0.9rem; }
    .lead a { color: var(--brand); }
    .domains { display: flex; flex-direction: column; gap: 1rem; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.1rem; display: flex; flex-direction: column; gap: 0.9rem; }
    .card-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; }
    .card-head h2 { margin: 0; font-size: 1.1rem; color: var(--text); }
    .muted { color: var(--muted); font-size: 0.85rem; margin: 0.2rem 0 0; }
    .stats { display: flex; flex-wrap: wrap; gap: 0.7rem; }
    .stats div { border: 1px solid var(--border); border-radius: 8px; padding: 0.4rem 0.6rem; min-width: 110px; background: color-mix(in srgb, var(--surface) 90%, var(--bg)); }
    .stats span { display: block; font-size: 0.72rem; color: var(--muted); }
    .stats strong { font-size: 0.95rem; color: var(--text); }
    .actions { display: flex; }
    .range-form { border-top: 1px dashed var(--border); padding-top: 0.8rem; }
    .section-label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 0.4rem; }
    .range-inputs { display: flex; flex-wrap: wrap; align-items: end; gap: 0.7rem; }
    .range-inputs label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--muted); }
    .input { padding: 0.45rem 0.55rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); }
    .btn-secondary { padding: 0.45rem 0.8rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; }
    .btn-danger { padding: 0.45rem 0.8rem; background: #d93025; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
    .btn-secondary:disabled, .btn-danger:disabled { opacity: 0.55; cursor: default; }
    .banner { background: color-mix(in srgb, #d93025 12%, var(--surface)); color: #c5221f; border: 1px solid color-mix(in srgb, #d93025 30%, var(--border)); border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; }
    .banner.ok { background: color-mix(in srgb, #137333 12%, var(--surface)); color: #137333; border-color: color-mix(in srgb, #137333 30%, var(--border)); }
  `]
})
export class DataRetentionComponent implements OnInit {
  private api = inject(DataRetentionService);

  readonly domains = signal<DataDomainOverview[]>([]);
  readonly loading = signal(true);
  readonly busy = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly ok = signal(false);

  fromDate: Record<string, string> = {};
  toDate: Record<string, string> = {};

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.overview().subscribe({
      next: d => { this.domains.set(d); this.loading.set(false); },
      error: (err: HttpErrorResponse) => { this.loading.set(false); this.fail(err, 'Could not load data retention overview.'); },
    });
  }

  purgeExpired(d: DataDomainOverview): void {
    this.busy.set(d.key);
    this.api.purgeExpired(d.key).subscribe({
      next: r => { this.busy.set(null); this.succeed(`Removed ${r.deletedCount} record(s) older than ${d.retentionDays} days from ${d.label}.`); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(null); this.fail(err, 'Could not apply retention.'); },
    });
  }

  purgeRange(d: DataDomainOverview): void {
    const from = this.fromDate[d.key];
    const to = this.toDate[d.key];
    if (!from || !to) return;
    if (!confirm(`Permanently delete all ${d.label} records from ${from} through ${to}? This cannot be undone.`)) return;

    this.busy.set(d.key);
    this.api.purgeRange({
      domain: d.key,
      fromUtc: new Date(`${from}T00:00:00.000Z`).toISOString(),
      toUtc: new Date(`${to}T23:59:59.999Z`).toISOString(),
    }).subscribe({
      next: r => { this.busy.set(null); this.succeed(`Removed ${r.deletedCount} record(s) from ${d.label} for ${from} – ${to}.`); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(null); this.fail(err, 'Could not clear the selected range.'); },
    });
  }

  private succeed(msg: string): void { this.ok.set(true); this.message.set(msg); }
  private fail(err: HttpErrorResponse, fallback: string): void {
    this.ok.set(false);
    this.message.set(typeof err.error?.error === 'string' ? err.error.error : fallback);
  }
}
