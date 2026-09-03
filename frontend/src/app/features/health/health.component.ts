import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { HealthService } from '../../core/services/health.service';
import { HealthCheck, HealthReport, HealthStatus } from '../../core/models/health.models';

type StatusFilter = 'all' | HealthStatus;

/**
 * Diagnostic sweep across the pieces most likely to silently drift (stale RBAC data, a dead
 * website link, Mongo connectivity, retention settings out of range) so problems surface here
 * first instead of as a live "unexpected error" for an admin.
 */
@Component({
  selector: 'app-health',
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    <div class="wrap">
      <div class="head">
        <div>
          <h1 class="page-title">System health</h1>
          <p class="lead">Diagnostic checks across the database, RBAC data, websites, and settings.</p>
        </div>
        <button class="btn-secondary" type="button" [disabled]="loading()" (click)="reload()">Refresh</button>
      </div>

      @if (error()) { <div class="banner">{{ error() }}</div> }

      @if (loading() && !report()) {
        <div class="initial-loading"><span class="spinner"></span> Running checks…</div>
      } @else if (report(); as r) {
        <div class="summary">
          <div class="overall" [class.healthy]="r.errorCount === 0 && r.warningCount === 0" [class.degraded]="r.errorCount === 0 && r.warningCount > 0"><strong>{{ overallLabel() }}</strong><span>{{ overallMessage() }}</span></div>
          <div class="pill ok">{{ r.okCount }} OK</div>
          <div class="pill warning">{{ r.warningCount }} Warning</div>
          <div class="pill error">{{ r.errorCount }} Error</div>
          <small class="generated">Generated {{ r.generatedAtUtc | date:'medium' }}</small>
        </div>

        <div class="filters">
          <label for="status-filter">Filter</label>
          <select id="status-filter" [(ngModel)]="statusFilter">
            <option value="all">All statuses</option>
            <option value="error">Error only</option>
            <option value="warning">Warning only</option>
            <option value="ok">OK only</option>
          </select>
        </div>

        <div class="body">
          @if (loading()) {
            <div class="loading-overlay"><span class="spinner"></span> Refreshing…</div>
          }

          @for (group of filteredGroups(); track group.category) {
            <section class="category">
              <h2>{{ group.category }}</h2>
              <div class="checks">
                @for (c of group.checks; track c.key) {
                  <div class="check" [class.ok]="c.status === 'ok'" [class.warning]="c.status === 'warning'" [class.error]="c.status === 'error'">
                    <div class="check-head">
                      <span class="dot"></span>
                      <strong>{{ c.label }}</strong>
                    </div>
                    <p>{{ c.message }}</p>
                    <div class="check-foot">@if (c.durationMs !== null && c.durationMs !== undefined) { <span>{{ c.durationMs }} ms</span> } @if (c.actionRoute && c.status !== 'ok') { <a [routerLink]="c.actionRoute">Review</a> }</div>
                  </div>
                }
              </div>
            </section>
          }

          @if (filteredGroups().length === 0) {
            <p class="empty">No checks match this filter.</p>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .wrap { max-width: 1000px; margin: 0 auto; padding: 1rem; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem; }
    .page-title { font-size: 1.5rem; margin: 0; color: var(--text); }
    .lead { color: var(--muted); margin: 0.2rem 0 0; font-size: 0.9rem; }
    .btn-secondary { padding: 0.45rem 0.8rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; }
    .btn-secondary:disabled { opacity: 0.55; cursor: default; }
    .banner { background: color-mix(in srgb, var(--danger) 12%, var(--surface)); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger-border) 30%, var(--border)); border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; }
    .initial-loading, .loading-overlay { display: flex; align-items: center; justify-content: center; gap: 0.6rem; color: var(--muted); font-size: 0.9rem; }
    .initial-loading { padding: 2rem 0; }
    .loading-overlay { position: absolute; inset: 0; z-index: 2; background: color-mix(in srgb, var(--bg) 65%, transparent); border-radius: 10px; backdrop-filter: blur(1px); }
    .spinner { width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--brand); border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .summary { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin: 0.8rem 0; }
    .overall { flex: 1 0 100%; display: flex; flex-direction: column; gap: .2rem; border-left: 4px solid var(--danger-border); background: var(--surface); padding: .75rem 1rem; border-radius: 6px; }
    .overall.healthy { border-color: var(--success-border); } .overall.degraded { border-color: var(--warning-border); } .overall span { color: var(--muted); font-size: .82rem; }
    .pill { padding: 0.3rem 0.7rem; border-radius: 999px; font-weight: 600; font-size: 0.85rem; }
    .pill.ok { background: var(--success-soft); color: var(--success); }
    .pill.warning { background: var(--warning-soft); color: var(--warning); }
    .pill.error { background: var(--danger-soft); color: var(--danger); }
    .generated { color: var(--muted); margin-left: 0.3rem; }
    .filters { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem; }
    .filters label { font-size: 0.85rem; color: var(--muted); }
    .filters select { padding: 0.4rem 0.55rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); }
    .body { position: relative; display: grid; gap: 1rem; }
    .category h2 { font-size: 1rem; margin: 0 0 0.5rem; color: var(--text); }
    .checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.7rem; }
    .check { border: 1px solid var(--border); border-radius: 8px; padding: 0.7rem 0.8rem; background: var(--surface); }
    .check-head { display: flex; align-items: center; gap: 0.45rem; }
    .check-head strong { color: var(--text); font-size: 0.92rem; }
    .check p { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.85rem; }
    .check-foot { display:flex; justify-content:space-between; margin-top:.55rem; color:var(--muted); font-size:.72rem; }.check-foot a{color:var(--brand);text-decoration:none;font-weight:600}
    .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
    .check.ok .dot { background: var(--success); }
    .check.warning .dot { background: var(--warning); }
    .check.error .dot { background: var(--danger); }
    .check.error { border-color: color-mix(in srgb, var(--danger-border) 40%, var(--border)); }
    .check.warning { border-color: color-mix(in srgb, var(--warning-border) 40%, var(--border)); }
    .empty { color: var(--muted); }
  `]
})
export class HealthComponent implements OnInit {
  private api = inject(HealthService);

  readonly report = signal<HealthReport | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  statusFilter: StatusFilter = 'all';

  readonly filteredGroups = computed(() => {
    const r = this.report();
    if (!r) return [];
    const filter = this.statusFilter;
    const checks = filter === 'all' ? r.checks : r.checks.filter((c) => c.status === filter);
    const byCategory = new Map<string, HealthCheck[]>();
    for (const c of checks) {
      const list = byCategory.get(c.category) ?? [];
      list.push(c);
      byCategory.set(c.category, list);
    }
    return Array.from(byCategory.entries()).map(([category, items]) => ({ category, checks: items }));
  });

  overallLabel(): string { const report = this.report(); return report?.errorCount ? 'Action required' : report?.warningCount ? 'Degraded' : 'All systems operational'; }
  overallMessage(): string { const report = this.report(); return report?.errorCount ? `${report.errorCount} check(s) require attention.` : report?.warningCount ? `${report.warningCount} warning(s) should be reviewed.` : 'All diagnostic checks completed successfully.'; }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.checks().subscribe({
      next: (r) => { this.report.set(r); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(typeof err.error?.error === 'string' ? err.error.error : 'Could not run health checks.');
      },
    });
  }
}
