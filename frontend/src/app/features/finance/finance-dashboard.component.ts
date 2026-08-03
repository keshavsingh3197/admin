import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FinanceService } from '../../core/services/finance.service';
import { Advisory, AdvisorySeverity, FinanceOverview, HouseholdMetrics } from '../../core/models/finance.models';

@Component({
  selector: 'app-finance-dashboard',
  imports: [RouterLink],
  template: `
    <div class="finance">
      <div class="fin-head">
        <div>
          <h1>Finance</h1>
          <p class="subtitle">Your household's money at a glance, with suggestions to improve it.</p>
        </div>
        <a class="btn-primary" routerLink="/finance/manage">Manage data</a>
      </div>

      @if (loading()) {
        <p class="loading">Loading…</p>
      } @else if (errorMessage()) {
        <div class="error-banner">⚠️ {{ errorMessage() }}</div>
      } @else if (metrics(); as m) {
        @if (!hasData()) {
          <div class="empty-card">
            <div class="empty-icon">💰</div>
            <h2>No finances yet</h2>
            <p>Add income, expenses, investments, debts and goals to see your net worth and tailored suggestions.</p>
            <a class="btn-primary" routerLink="/finance/manage">Add your data</a>
          </div>
        } @else {
          <div class="kpi-grid">
            <div class="kpi">
              <span class="kpi-label">Net worth</span>
              <span class="kpi-value">{{ money(m.netWorth) }}</span>
              <span class="kpi-sub">{{ money(m.totalAssets) }} assets − {{ money(m.totalLiabilities) }} debt</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">Monthly surplus</span>
              <span class="kpi-value" [class.pos]="m.monthlySurplus >= 0" [class.neg]="m.monthlySurplus < 0">{{ money(m.monthlySurplus) }}</span>
              <span class="kpi-sub">{{ m.savingsRatePct }}% savings rate</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">Emergency fund</span>
              <span class="kpi-value">{{ m.emergencyFundMonths }} mo</span>
              <span class="kpi-sub">of essentials covered</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">Monthly income</span>
              <span class="kpi-value">{{ money(m.monthlyIncome) }}</span>
              <span class="kpi-sub">outflow {{ money(m.monthlyOutflow) }}</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">Debt-to-income</span>
              <span class="kpi-value">{{ m.debtToIncomePct }}%</span>
              <span class="kpi-sub">of income to repayments</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">Monthly SIP</span>
              <span class="kpi-value">{{ money(m.totalSipMonthly) }}</span>
              <span class="kpi-sub">invested automatically</span>
            </div>
          </div>

          <div class="fin-cols">
            <section class="card">
              <div class="card-head"><h2>Suggestions</h2><span class="muted">{{ advisories().length }} total</span></div>
              @if (advisories().length === 0) {
                <p class="muted">✅ Nothing needs attention — nicely balanced.</p>
              } @else {
                @for (a of advisories(); track a.category + $index) {
                  <div class="advis" [class]="'sev-' + a.severity.toLowerCase()">
                    <span class="advis-icon">{{ icon(a.severity) }}</span>
                    <div class="advis-body">
                      <div class="advis-top">
                        <strong>{{ a.title }}</strong>
                        <span class="sev-tag" [class]="'sev-' + a.severity.toLowerCase()">{{ a.severity }}</span>
                      </div>
                      <p class="advis-msg">{{ a.message }}</p>
                      @if (a.recommendedAction) { <p class="advis-action">→ {{ a.recommendedAction }}</p> }
                    </div>
                  </div>
                }
              }
            </section>

            <div class="fin-side">
              <section class="card">
                <div class="card-head"><h2>Asset allocation</h2></div>
                @if (m.allocation.length === 0) {
                  <p class="muted">No investments recorded.</p>
                } @else {
                  @for (s of m.allocation; track s.assetClass) {
                    <div class="meter-row">
                      <div class="meter-top">
                        <span><span class="dot" [class]="s.assetClass.toLowerCase()"></span>{{ s.assetClass }}</span>
                        <span class="muted">{{ s.pct }}% · {{ money(s.value) }}</span>
                      </div>
                      <div class="meter"><span class="meter-fill" [class]="s.assetClass.toLowerCase()" [style.width.%]="s.pct"></span></div>
                    </div>
                  }
                }
              </section>

              @if (m.goals.length) {
                <section class="card">
                  <div class="card-head"><h2>Goals</h2></div>
                  @for (g of m.goals; track g.goalId) {
                    <div class="meter-row">
                      <div class="meter-top"><span>{{ g.name }}</span><span class="muted">{{ g.progressPct }}% · {{ g.monthsRemaining }} mo left</span></div>
                      <div class="meter"><span class="meter-fill goal" [style.width.%]="clamp(g.progressPct)"></span></div>
                      @if (g.progressPct < 100) { <span class="meter-note muted">Needs {{ money(g.requiredMonthly) }}/mo to stay on track</span> }
                    </div>
                  }
                </section>
              }

              @if (m.memberIncomes.length > 1) {
                <section class="card">
                  <div class="card-head"><h2>Income by member</h2></div>
                  @for (mi of m.memberIncomes; track mi.memberId) {
                    <div class="meter-row">
                      <div class="meter-top"><span>{{ mi.name }}</span><span class="muted">{{ mi.pct }}% · {{ money(mi.monthlyIncome) }}</span></div>
                      <div class="meter"><span class="meter-fill member" [style.width.%]="mi.pct"></span></div>
                    </div>
                  }
                </section>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .finance { padding: 2rem; --v-blue:#2a78d6; --v-orange:#eb6834; --v-aqua:#1baf7a; --v-yellow:#eda100;
      --v-magenta:#e87ba4; --v-green:#008300; --v-violet:#4a3aa7; --st-info:#2a78d6; --st-warning:#fab219;
      --st-critical:#d03b3b; --st-good:#0ca30c; }
    .fin-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.5rem; }
    .subtitle { color:#666; margin:0.25rem 0 0; }
    .loading { color:#666; }
    .btn-primary { background:#1a73e8; color:#fff; border:none; padding:0.55rem 1.1rem; border-radius:4px;
      cursor:pointer; text-decoration:none; font-size:0.95rem; display:inline-block; }
    .error-banner { background:#fce8e6; color:#c5221f; border:1px solid #f5c6c6; border-radius:4px; padding:0.75rem 1rem; }
    .empty-card { text-align:center; padding:3rem 1.5rem; border:1px solid #e0e0e0; border-radius:8px; background:#fff; }
    .empty-icon { font-size:2.5rem; } .empty-card h2 { margin:0.75rem 0 0.4rem; }
    .empty-card p { color:#666; max-width:40ch; margin:0 auto 1.2rem; }

    .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; margin-bottom:1.5rem; }
    .kpi { background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:1rem 1.1rem; display:flex; flex-direction:column; gap:0.25rem; }
    .kpi-label { font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:0.04em; }
    .kpi-value { font-size:1.55rem; font-weight:700; color:#1a1a1a; line-height:1.1; }
    .kpi-value.pos { color:var(--st-good); } .kpi-value.neg { color:var(--st-critical); }
    .kpi-sub { font-size:0.78rem; color:#666; }

    .fin-cols { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:1.25rem; align-items:start; }
    @media (max-width:900px){ .fin-cols{ grid-template-columns:1fr; } }
    .fin-side { display:flex; flex-direction:column; gap:1.25rem; }
    .card { background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:1.25rem; }
    .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.9rem; }
    .card-head h2 { margin:0; font-size:1.05rem; }
    .muted { color:#888; font-size:0.88rem; }

    .advis { display:flex; gap:0.7rem; padding:0.8rem 0.9rem; border:1px solid #e0e0e0; border-left-width:4px;
      border-radius:6px; margin-bottom:0.7rem; background:#fafafa; }
    .advis:last-child { margin-bottom:0; }
    .advis.sev-critical { border-left-color:var(--st-critical); }
    .advis.sev-warning { border-left-color:var(--st-warning); }
    .advis.sev-info { border-left-color:var(--st-info); }
    .advis-icon { font-size:1.05rem; } .advis-body { flex:1; min-width:0; }
    .advis-top { display:flex; justify-content:space-between; align-items:center; gap:0.5rem; }
    .advis-msg { margin:0.25rem 0 0; font-size:0.86rem; color:#555; }
    .advis-action { margin:0.4rem 0 0; font-size:0.82rem; color:#222; font-weight:500; }
    .sev-tag { font-size:0.66rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;
      padding:0.1rem 0.45rem; border-radius:99px; color:#fff; flex-shrink:0; }
    .sev-tag.sev-critical { background:var(--st-critical); }
    .sev-tag.sev-warning { background:var(--st-warning); color:#3a2c00; }
    .sev-tag.sev-info { background:var(--st-info); }

    .meter-row { margin-bottom:0.85rem; } .meter-row:last-child { margin-bottom:0; }
    .meter-top { display:flex; justify-content:space-between; font-size:0.84rem; margin-bottom:0.35rem; }
    .meter-top .dot { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:0.45rem; vertical-align:middle; }
    .meter { height:8px; border-radius:4px; background:#eee; overflow:hidden; }
    .meter-fill { display:block; height:100%; border-radius:4px; background:#1a73e8; }
    .meter-fill.goal { background:var(--v-blue); } .meter-fill.member { background:var(--v-aqua); }
    .meter-note { display:block; font-size:0.76rem; margin-top:0.3rem; }

    .dot.equity,.meter-fill.equity{background:var(--v-blue);} .dot.debt,.meter-fill.debt{background:var(--v-aqua);}
    .dot.gold,.meter-fill.gold{background:var(--v-yellow);} .dot.realestate,.meter-fill.realestate{background:var(--v-orange);}
    .dot.cash,.meter-fill.cash{background:var(--v-green);} .dot.crypto,.meter-fill.crypto{background:var(--v-magenta);}
    .dot.other,.meter-fill.other{background:var(--v-violet);}
  `],
})
export class FinanceDashboardComponent implements OnInit {
  private api = inject(FinanceService);

  loading = signal(true);
  errorMessage = signal<string | null>(null);
  private overview = signal<FinanceOverview | null>(null);

  metrics = computed<HouseholdMetrics | null>(() => this.overview()?.metrics ?? null);
  advisories = computed<Advisory[]>(() => this.overview()?.advisories ?? []);

  hasData = computed(() => {
    const m = this.metrics();
    return !!m && (m.monthlyIncome > 0 || m.totalAssets > 0 || m.totalLiabilities > 0
      || m.monthlyExpenses > 0 || m.goals.length > 0);
  });

  ngOnInit(): void {
    this.api.getOverview().subscribe({
      next: o => { this.overview.set(o); this.loading.set(false); },
      error: () => { this.errorMessage.set('Failed to load your finances. Please try again.'); this.loading.set(false); },
    });
  }

  money(v: number): string {
    const currency = this.metrics()?.currency || 'INR';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
    } catch {
      return `${currency} ${Math.round(v).toLocaleString()}`;
    }
  }

  icon(s: AdvisorySeverity): string { return s === 'Critical' ? '🔴' : s === 'Warning' ? '⚠️' : 'ℹ️'; }
  clamp(pct: number): number { return Math.max(0, Math.min(100, pct)); }
}
