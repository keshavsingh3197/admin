import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { WebsiteDashboard, WebsiteOption } from '../../core/models/analytics.models';

type MetricKey =
  | 'totalUsers'
  | 'activeUsers'
  | 'activeSessions'
  | 'totalNotes'
  | 'successfulLoginsLast24h'
  | 'failedLoginsLast24h'
  | 'visitsLast24h'
  | 'uniqueVisitorsLast24h';

@Component({
  selector: 'app-analytics',
  imports: [CommonModule],
  template: `
    <section class="analytics-page">
      <header class="hero">
        <div>
          <h1>Analytics Dashboard</h1>
          <p>Choose a website and review its current health and usage snapshot. Click any metric card for details.</p>
        </div>

        <div class="controls">
          <label for="website-select">Website</label>
          <select
            id="website-select"
            [value]="selectedKey()"
            [disabled]="loadingWebsites() || websites().length === 0"
            (change)="onWebsiteChange($event)">
            @for (site of websites(); track site.key) {
              <option [value]="site.key">{{ site.name }}</option>
            }
          </select>
          <button type="button" class="refresh-btn" [disabled]="loadingDashboard()" (click)="refresh()">Refresh</button>
        </div>
      </header>

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      @if (loadingWebsites() || loadingDashboard()) {
        <p class="loading">Loading dashboard...</p>
      }

      @if (dashboard(); as d) {
        <section class="site-overview">
          <h2>{{ d.website.name }}</h2>
          <a [href]="d.website.url" target="_blank" rel="noopener">{{ d.website.url }}</a>
          <div class="status" [class.ok]="d.status.isReachable" [class.down]="!d.status.isReachable">
            {{ d.status.isReachable ? 'Reachable' : 'Unreachable' }}
            <span>
              @if (d.status.statusCode !== null) {
                HTTP {{ d.status.statusCode }}
              }
              @if (d.status.responseMs !== null) {
                • {{ d.status.responseMs }} ms
              }
            </span>
          </div>
          <small>Checked: {{ d.status.checkedAtUtc | date: 'medium' }}</small>
        </section>

        <section class="cards">
          <button type="button" class="card" [class.active]="selectedMetric() === 'totalUsers'" (click)="selectMetric('totalUsers')"><h3>Total users</h3><strong>{{ d.metrics.totalUsers }}</strong></button>
          <button type="button" class="card" [class.active]="selectedMetric() === 'activeUsers'" (click)="selectMetric('activeUsers')"><h3>Active users</h3><strong>{{ d.metrics.activeUsers }}</strong></button>
          <button type="button" class="card" [class.active]="selectedMetric() === 'activeSessions'" (click)="selectMetric('activeSessions')"><h3>Active sessions</h3><strong>{{ d.metrics.activeSessions }}</strong></button>
          <button type="button" class="card" [class.active]="selectedMetric() === 'totalNotes'" (click)="selectMetric('totalNotes')"><h3>Notes</h3><strong>{{ d.metrics.totalNotes }}</strong></button>
          <button type="button" class="card" [class.active]="selectedMetric() === 'successfulLoginsLast24h'" (click)="selectMetric('successfulLoginsLast24h')"><h3>Successful logins (24h)</h3><strong>{{ d.metrics.successfulLoginsLast24h }}</strong></button>
          <button type="button" class="card" [class.active]="selectedMetric() === 'failedLoginsLast24h'" (click)="selectMetric('failedLoginsLast24h')"><h3>Failed logins (24h)</h3><strong>{{ d.metrics.failedLoginsLast24h }}</strong></button>
          <button type="button" class="card" [class.active]="selectedMetric() === 'visitsLast24h'" (click)="selectMetric('visitsLast24h')"><h3>Visits (24h)</h3><strong>{{ d.metrics.visitsLast24h }}</strong></button>
          <button type="button" class="card" [class.active]="selectedMetric() === 'uniqueVisitorsLast24h'" (click)="selectMetric('uniqueVisitorsLast24h')"><h3>Unique visitors (24h)</h3><strong>{{ d.metrics.uniqueVisitorsLast24h }}</strong></button>
        </section>

        <section class="detail-card">
          <h3>{{ detailTitle() }}</h3>
          @if (selectedMetric() === 'visitsLast24h' || selectedMetric() === 'uniqueVisitorsLast24h') {
            <div class="detail-grid">
              <div>
                <h4>Top countries</h4>
                <ul>
                  @for (c of d.details.topCountries; track c.country) {
                    <li><span>{{ c.country }}</span><strong>{{ c.visits }}</strong></li>
                  }
                </ul>
              </div>
              <div>
                <h4>Top pages</h4>
                <ul>
                  @for (p of d.details.topPages; track p.path) {
                    <li><span>{{ p.path }}</span><strong>{{ p.visits }}</strong></li>
                  }
                </ul>
              </div>
            </div>

            <h4>Recent visits</h4>
            <div class="table-wrap">
              <table class="tbl">
                <thead>
                  <tr><th>Time (UTC)</th><th>Path</th><th>Country</th><th>Referrer</th><th>Visitor</th></tr>
                </thead>
                <tbody>
                  @for (v of d.details.recentVisits; track v.timestamp + v.visitorKey + v.path) {
                    <tr>
                      <td>{{ v.timestamp | date:'short' }}</td>
                      <td>{{ v.path }}</td>
                      <td>{{ v.country }}</td>
                      <td>{{ v.referrer || '-' }}</td>
                      <td>{{ v.visitorKey }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="hint">This metric is an aggregate count over the last 24 hours. Click Visits or Unique visitors for geographic and page-level details.</p>
          }
        </section>
      }

      @if (!loadingWebsites() && websites().length === 0) {
        <p class="empty">No websites are configured yet. Update URLs in Settings first.</p>
      }
    </section>
  `,
  styles: [`
    .analytics-page { display: grid; gap: 1rem; }
    .hero {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 1rem;
      padding: 1.25rem;
      border-radius: 10px;
      background: linear-gradient(130deg, #102a43, #1f5f8b);
      color: #fff;
    }
    .hero h1 { margin: 0 0 0.25rem; }
    .hero p { margin: 0; opacity: 0.9; }
    .controls { display: grid; gap: 0.4rem; min-width: 260px; }
    .controls label { font-size: 0.85rem; opacity: 0.9; }
    .controls select, .refresh-btn {
      border: 1px solid rgba(255,255,255,0.45);
      border-radius: 6px;
      padding: 0.55rem 0.65rem;
      font-size: 0.95rem;
      background: rgba(255,255,255,0.96);
      color: #102a43;
    }
    .refresh-btn { cursor: pointer; }
    .site-overview {
      background: #fff;
      border: 1px solid #e6eaf0;
      border-radius: 10px;
      padding: 1rem;
      display: grid;
      gap: 0.35rem;
    }
    .site-overview h2 { margin: 0; }
    .site-overview a { color: #1a73e8; text-decoration: none; }
    .status {
      width: fit-content;
      padding: 0.3rem 0.6rem;
      border-radius: 999px;
      font-weight: 600;
      font-size: 0.9rem;
      display: inline-flex;
      gap: 0.4rem;
      align-items: center;
    }
    .status.ok { background: #e6f4ea; color: #137333; }
    .status.down { background: #fce8e6; color: #c5221f; }
    .status span { font-weight: 500; opacity: 0.9; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.9rem;
    }
    .card {
      background: #fff;
      border: 1px solid #e6eaf0;
      border-radius: 10px;
      padding: 0.9rem;
      display: grid;
      gap: 0.25rem;
      text-align: left;
      cursor: pointer;
    }
    .card.active { border-color: #1a73e8; box-shadow: 0 0 0 2px #e8f0fe; }
    .card h3 { margin: 0; font-size: 0.9rem; color: #4a5568; }
    .card strong { font-size: 1.6rem; color: #102a43; }
    .detail-card {
      background: #fff;
      border: 1px solid #e6eaf0;
      border-radius: 10px;
      padding: 1rem;
      display: grid;
      gap: 0.75rem;
    }
    .detail-card h3, .detail-card h4 { margin: 0; }
    .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; }
    .detail-grid ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
    .detail-grid li { display: flex; justify-content: space-between; gap: 0.5rem; border-bottom: 1px dashed #e8ecf1; padding-bottom: 0.2rem; }
    .hint { color: #5f6c7b; margin: 0; }
    .table-wrap { overflow: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
    .tbl th, .tbl td { padding: 0.5rem; border-bottom: 1px solid #eef0f2; text-align: left; }
    .tbl th { background: #f9fafb; }
    .error { color: #c5221f; }
    .loading, .empty { color: #5f6c7b; }

    @media (max-width: 720px) {
      .hero { align-items: stretch; flex-direction: column; }
      .controls { min-width: 0; }
    }
  `]
})
export class AnalyticsComponent implements OnInit {
  private readonly analytics = inject(AnalyticsService);
  private readonly auth = inject(AuthService);

  readonly websites = signal<WebsiteOption[]>([]);
  readonly dashboard = signal<WebsiteDashboard | null>(null);
  readonly selectedKey = signal<string>('');
  readonly loadingWebsites = signal(false);
  readonly loadingDashboard = signal(false);
  readonly error = signal<string>('');
  readonly selectedMetric = signal<MetricKey>('visitsLast24h');

  ngOnInit(): void {
    this.loadWebsites();
    this.analytics.trackVisit({
      websiteKey: 'admin',
      path: window.location.pathname,
      referrer: document.referrer || undefined,
    }).subscribe({ error: () => { /* tracking should never block UI */ } });
  }

  onWebsiteChange(event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    this.selectedKey.set(key);
    this.loadDashboard(key);
  }

  refresh(): void {
    const key = this.selectedKey();
    if (!key) return;
    this.loadDashboard(key);
  }

  private loadWebsites(): void {
    this.loadingWebsites.set(true);
    this.error.set('');
    this.analytics.getWebsites().subscribe({
      next: (websites) => {
        this.websites.set(websites);
        this.loadingWebsites.set(false);

        if (websites.length === 0) {
          this.dashboard.set(null);
          this.selectedKey.set('');
          return;
        }

        const preferred = this.pickDefaultWebsite(websites);
        this.selectedKey.set(preferred.key);
        this.loadDashboard(preferred.key);
      },
      error: () => {
        this.loadingWebsites.set(false);
        this.error.set('Unable to load websites.');
      }
    });
  }

  private loadDashboard(websiteKey: string): void {
    this.loadingDashboard.set(true);
    this.error.set('');
    this.analytics.getDashboard(websiteKey).subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.selectedMetric.set('visitsLast24h');
        this.loadingDashboard.set(false);
      },
      error: () => {
        this.loadingDashboard.set(false);
        this.dashboard.set(null);
        this.error.set('Unable to load analytics for the selected website.');
      }
    });
  }

  private pickDefaultWebsite(websites: WebsiteOption[]): WebsiteOption {
    if (this.auth.hasRole('Admin')) {
      const adminSite = websites.find((w) => w.key === 'admin');
      if (adminSite) return adminSite;
    }
    return websites[0];
  }

  selectMetric(metric: MetricKey): void {
    this.selectedMetric.set(metric);
  }

  detailTitle(): string {
    switch (this.selectedMetric()) {
      case 'visitsLast24h': return 'Visit breakdown (24h)';
      case 'uniqueVisitorsLast24h': return 'Unique visitors breakdown (24h)';
      case 'successfulLoginsLast24h': return 'Successful logins (24h)';
      case 'failedLoginsLast24h': return 'Failed logins (24h)';
      case 'activeSessions': return 'Active sessions';
      case 'activeUsers': return 'Active users';
      case 'totalUsers': return 'Total users';
      case 'totalNotes': return 'Total notes';
      default: return 'Metric details';
    }
  }
}
