import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FinanceService } from '../../core/services/finance.service';
import {
  Advisory, AdvisorySeverity, AppliedSuggestion, FinanceOverview, HouseholdMetrics,
  StatementAnalysis, StatementSuggestion,
} from '../../core/models/finance.models';

@Component({
  selector: 'app-finance-dashboard',
  imports: [RouterLink, DatePipe],
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
                  <div class="alloc">
                    <svg viewBox="0 0 42 42" class="donut" role="img" aria-label="Asset allocation by class">
                      <circle class="donut-track" cx="21" cy="21" r="15.915" fill="none" stroke-width="5"></circle>
                      <g transform="rotate(-90 21 21)">
                        @for (seg of donut(); track seg.cls) {
                          <circle class="donut-seg" [class]="seg.cls" cx="21" cy="21" r="15.915" fill="none" stroke-width="5"
                            [attr.stroke-dasharray]="seg.dash + ' ' + (100 - seg.dash)" [attr.stroke-dashoffset]="seg.offset"></circle>
                        }
                      </g>
                      <text x="21" y="20.5" class="donut-center">{{ money(m.totalAssets) }}</text>
                      <text x="21" y="25" class="donut-sub">assets</text>
                    </svg>
                    <ul class="legend">
                      @for (s of m.allocation; track s.assetClass) {
                        <li>
                          <span class="dot" [class]="s.assetClass.toLowerCase()"></span>
                          <span class="legend-name">{{ s.assetClass }}</span>
                          <span class="muted">{{ s.pct }}% · {{ money(s.value) }}</span>
                        </li>
                      }
                    </ul>
                  </div>
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

      <!-- Statement analysis: what the imported ledger says, and the records it implies. -->
      <section class="card statement">
        <div class="card-head">
          <h2>From your bank statement</h2>
          <span class="head-tools">
            <select class="mini-select" [value]="months()" (change)="onMonths($event)" aria-label="Period">
              <option [value]="3">Last 3 months</option>
              <option [value]="6">Last 6 months</option>
              <option [value]="12">Last 12 months</option>
            </select>
            <a class="btn-secondary sm" routerLink="/finance/manage">Import statement</a>
          </span>
        </div>

        @if (insightsLoading()) { <p class="muted">Analysing…</p> }
        @else if (insights(); as a) {
          @if (!a.transactionCount) {
            <p class="muted">No transactions in this period. Import a statement (CSV or .xlsx) and this fills in
              — average income and spend, what recurs, and the salary/EMI records it implies.</p>
          } @else {
            <div class="stat-row">
              <span class="stat"><small>Money in / month</small><strong class="pos">{{ money(a.averageMonthlyIn) }}</strong></span>
              <span class="stat"><small>Money out / month</small><strong class="neg">{{ money(a.averageMonthlyOut) }}</strong></span>
              <span class="stat"><small>Transactions</small><strong>{{ a.transactionCount }}</strong></span>
              <span class="stat"><small>Period</small><strong>{{ a.from | date:'MMM y' }} – {{ a.to | date:'MMM y' }}</strong></span>
            </div>

            @if (a.months.length) {
              <div class="bars" role="img" aria-label="Money in and out per month">
                @for (mo of a.months; track mo.label) {
                  <span class="bar-col" [title]="mo.label + ': in ' + money(mo.moneyIn) + ', out ' + money(mo.moneyOut)">
                    <span class="bar-pair">
                      <i class="bar in" [style.height.%]="barHeight(mo.moneyIn)"></i>
                      <i class="bar out" [style.height.%]="barHeight(mo.moneyOut)"></i>
                    </span>
                    <small>{{ mo.label.split(' ')[0] }}</small>
                  </span>
                }
              </div>
            }

            @if (a.categories.length) {
              <h3 class="sub">Where it went</h3>
              <ul class="cat-list">
                @for (c of a.categories.slice(0, 8); track c.kind) {
                  <li><span class="cat-name">{{ prettyKind(c.kind) }}</span>
                    <span class="meter"><span class="meter-fill" [style.width.%]="categoryPct(c.total)"></span></span>
                    <span class="muted">{{ money(c.total) }}</span></li>
                }
              </ul>
            }

            @if (a.suggestions.length) {
              <h3 class="sub">Fill in from the statement</h3>
              <p class="muted small">These are guesses from bank narrations — check each one before adding it.</p>
              <ul class="sugg-list">
                @for (s of a.suggestions; track s.label + s.kind) {
                  <li class="sugg" [class.on]="isPicked(s)">
                    <label class="sugg-main">
                      <input type="checkbox" [checked]="isPicked(s)" (change)="togglePick(s)" />
                      <span>
                        <strong>{{ s.label }}</strong>
                        <span class="badge">{{ s.kind === 'liability' ? 'EMI' : s.kind }}</span>
                        <small class="muted">{{ s.reason }}</small>
                      </span>
                    </label>
                    <span class="sugg-amt">{{ money(s.monthlyAmount) }}/mo</span>
                  </li>
                }
              </ul>
              <div class="sugg-ops">
                <button class="btn-primary sm" [disabled]="!picked().length || applying()" (click)="apply()">
                  Add {{ picked().length || '' }} selected</button>
                @if (applyMsg()) { <span class="muted">{{ applyMsg() }}</span> }
              </div>
            } @else {
              <p class="muted small">Nothing recurring detected yet — a few months of statement data makes this
                much better at spotting salary and EMIs.</p>
            }
          }
        } @else if (insightsError()) {
          <p class="muted">{{ insightsError() }}</p>
        }
      </section>
    </div>
  `,
  styles: [`
    .finance { padding: 2rem;
      /* Validated categorical hues (light defaults); dark steps applied below via the themed body. */
      --v-blue:#2a78d6; --v-aqua:#1baf7a; --v-yellow:#eda100; --v-orange:#eb6834;
      --v-green:#0a9d5a; --v-magenta:#e87ba4; --v-violet:#6d5ce0;
      --st-warning:#fab219; --st-critical:var(--danger); --st-good:var(--success); }
    :host-context(body[data-theme='dark']) .finance {
      --v-blue:#3987e5; --v-aqua:#199e70; --v-yellow:var(--warning); --v-orange:#d95926;
      --v-green:#12a866; --v-magenta:#d55181; --v-violet:#9085e9; }
    .fin-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.5rem; }
    .subtitle { color:var(--muted); margin:0.25rem 0 0; }
    .loading { color:var(--muted); }
    .btn-primary { background:var(--brand); color:var(--brand-text); border:none; padding:0.55rem 1.1rem;
      border-radius:6px; cursor:pointer; text-decoration:none; font-size:0.95rem; display:inline-block; font-weight:600; }
    .error-banner { background:color-mix(in srgb, var(--st-critical) 14%, var(--surface)); color:var(--st-critical);
      border:1px solid color-mix(in srgb, var(--st-critical) 40%, var(--surface)); border-radius:6px; padding:0.75rem 1rem; }
    .empty-card { text-align:center; padding:3rem 1.5rem; border:1px solid var(--border); border-radius:12px;
      background:var(--surface); box-shadow:var(--shadow-sm); }
    .empty-icon { font-size:2.5rem; } .empty-card h2 { margin:0.75rem 0 0.4rem; color:var(--text); }
    .empty-card p { color:var(--muted); max-width:40ch; margin:0 auto 1.2rem; }

    .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; margin-bottom:1.5rem; }
    .kpi { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:1rem 1.1rem;
      display:flex; flex-direction:column; gap:0.25rem; box-shadow:var(--shadow-sm); }
    .kpi-label { font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; }
    .kpi-value { font-size:1.55rem; font-weight:700; color:var(--text); line-height:1.1; }
    .kpi-value.pos { color:var(--st-good); } .kpi-value.neg { color:var(--st-critical); }
    .kpi-sub { font-size:0.78rem; color:var(--muted); }

    .fin-cols { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:1.25rem; align-items:start; }
    @media (max-width:900px){ .fin-cols{ grid-template-columns:1fr; } }
    .fin-side { display:flex; flex-direction:column; gap:1.25rem; }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:1.25rem; box-shadow:var(--shadow-sm); }
    .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.9rem; }
    .card-head h2 { margin:0; font-size:1.05rem; color:var(--text); }
    .muted { color:var(--muted); font-size:0.88rem; }

    .advis { display:flex; gap:0.7rem; padding:0.8rem 0.9rem; border:1px solid var(--border); border-left-width:4px;
      border-radius:8px; margin-bottom:0.7rem; background:color-mix(in srgb, var(--text) 4%, var(--surface)); }
    .advis:last-child { margin-bottom:0; }
    .advis.sev-critical { border-left-color:var(--st-critical); }
    .advis.sev-warning { border-left-color:var(--st-warning); }
    .advis.sev-info { border-left-color:var(--brand); }
    .advis-icon { font-size:1.05rem; } .advis-body { flex:1; min-width:0; }
    .advis-top { display:flex; justify-content:space-between; align-items:center; gap:0.5rem; }
    .advis-top strong { color:var(--text); }
    .advis-msg { margin:0.25rem 0 0; font-size:0.86rem; color:var(--muted); }
    .advis-action { margin:0.4rem 0 0; font-size:0.82rem; color:var(--text); font-weight:500; }
    .sev-tag { font-size:0.66rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;
      padding:0.1rem 0.45rem; border-radius:99px; color:var(--surface); flex-shrink:0; }
    .sev-tag.sev-critical { background:var(--st-critical); }
    .sev-tag.sev-warning { background:var(--st-warning); color:#3a2c00; }
    .sev-tag.sev-info { background:var(--brand); color:var(--brand-text); }

    .meter-row { margin-bottom:0.85rem; } .meter-row:last-child { margin-bottom:0; }
    .meter-top { display:flex; justify-content:space-between; font-size:0.84rem; margin-bottom:0.35rem; color:var(--text); }
    .meter-top .dot { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:0.45rem; vertical-align:middle; }
    .meter { height:8px; border-radius:4px; background:color-mix(in srgb, var(--text) 12%, transparent); overflow:hidden; }
    .meter-fill { display:block; height:100%; border-radius:4px; background:var(--brand); }
    .meter-fill.goal { background:var(--v-blue); } .meter-fill.member { background:var(--v-aqua); }
    .meter-note { display:block; font-size:0.76rem; margin-top:0.3rem; }

    .dot.equity,.meter-fill.equity{background:var(--v-blue);} .dot.debt,.meter-fill.debt{background:var(--v-aqua);}
    .dot.gold,.meter-fill.gold{background:var(--v-yellow);} .dot.realestate,.meter-fill.realestate{background:var(--v-orange);}
    .dot.cash,.meter-fill.cash{background:var(--v-green);} .dot.crypto,.meter-fill.crypto{background:var(--v-magenta);}
    .dot.other,.meter-fill.other{background:var(--v-violet);}

    .alloc { display:flex; gap:1.25rem; align-items:center; flex-wrap:wrap; }
    .donut { width:150px; height:150px; flex-shrink:0; }
    .donut-track { stroke:color-mix(in srgb, var(--text) 12%, transparent); }
    .donut-center { font-size:4px; font-weight:700; fill:var(--text); text-anchor:middle; }
    .donut-sub { font-size:2.6px; fill:var(--muted); text-anchor:middle; text-transform:uppercase; letter-spacing:0.05em; }
    .legend { list-style:none; margin:0; padding:0; flex:1; min-width:150px; display:flex; flex-direction:column; gap:0.4rem; }
    .legend li { display:flex; align-items:center; gap:0.5rem; font-size:0.86rem; color:var(--text); }
    .legend-name { flex:1; } .legend .muted { flex:none; }
    .donut-seg.equity{stroke:var(--v-blue);} .donut-seg.debt{stroke:var(--v-aqua);}
    .donut-seg.gold{stroke:var(--v-yellow);} .donut-seg.realestate{stroke:var(--v-orange);}
    .donut-seg.cash{stroke:var(--v-green);} .donut-seg.crypto{stroke:var(--v-magenta);}
    .donut-seg.other{stroke:var(--v-violet);}

    /* ---- Statement analysis ---- */
    .statement { margin-top:1.25rem; }
    .head-tools { display:flex; align-items:center; gap:.5rem; }
    .mini-select { background:var(--bg); color:var(--text); border:1px solid var(--border);
                   border-radius:6px; padding:.25rem .4rem; font-size:.8rem; }
    .btn-secondary.sm { padding:.3rem .6rem; font-size:.8rem; }
    .stat-row { display:flex; flex-wrap:wrap; gap:1.25rem; margin:.5rem 0 1rem; }
    .stat { display:flex; flex-direction:column; }
    .stat small { color:var(--muted); font-size:.74rem; text-transform:uppercase; letter-spacing:.04em; }
    .stat strong { font-size:1.05rem; }
    .stat .pos { color:var(--success); } .stat .neg { color:var(--danger); }
    .bars { display:flex; align-items:flex-end; gap:.6rem; height:120px; padding:.5rem 0 0;
            border-bottom:1px solid var(--border); }
    .bar-col { display:flex; flex-direction:column; align-items:center; gap:.25rem; flex:1; height:100%; }
    .bar-pair { display:flex; align-items:flex-end; gap:2px; flex:1; width:100%; justify-content:center; }
    .bar { width:40%; max-width:18px; border-radius:3px 3px 0 0; min-height:2px; }
    .bar.in { background:#34a853; } .bar.out { background:#ea4335; }
    .bar-col small { color:var(--muted); font-size:.68rem; }
    .sub { font-size:.82rem; text-transform:uppercase; letter-spacing:.05em; color:var(--muted);
           margin:1.1rem 0 .4rem; }
    .small { font-size:.8rem; }
    .cat-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.35rem; }
    .cat-list li { display:grid; grid-template-columns:9rem 1fr 6rem; align-items:center; gap:.6rem;
                   font-size:.85rem; }
    .cat-list .muted { text-align:right; }
    .sugg-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.35rem; }
    .sugg { display:flex; align-items:flex-start; justify-content:space-between; gap:.6rem;
            border:1px solid var(--border); border-radius:8px; padding:.5rem .6rem; }
    .sugg.on { border-color:var(--brand); background:color-mix(in srgb, var(--brand) 8%, transparent); }
    .sugg-main { display:flex; align-items:flex-start; gap:.5rem; cursor:pointer; }
    .sugg-main > span { display:flex; flex-direction:column; gap:.1rem; }
    .sugg-main small { font-size:.76rem; }
    .badge { align-self:flex-start; font-size:.68rem; text-transform:uppercase; letter-spacing:.04em;
             background:var(--bg); border:1px solid var(--border); border-radius:99px; padding:0 .4rem;
             color:var(--muted); }
    .sugg-amt { white-space:nowrap; font-weight:600; font-size:.88rem; }
    .sugg-ops { display:flex; align-items:center; gap:.6rem; margin-top:.6rem; }
    @media (max-width:640px) { .cat-list li { grid-template-columns:7rem 1fr; } .cat-list .muted { display:none; } }
  `],
})
export class FinanceDashboardComponent implements OnInit {
  private api = inject(FinanceService);

  loading = signal(true);
  errorMessage = signal<string | null>(null);
  private overview = signal<FinanceOverview | null>(null);

  // ---- Statement analysis ----
  readonly months = signal(6);
  readonly insights = signal<StatementAnalysis | null>(null);
  readonly insightsLoading = signal(true);
  readonly insightsError = signal<string | null>(null);
  readonly picked = signal<StatementSuggestion[]>([]);
  readonly applying = signal(false);
  readonly applyMsg = signal<string | null>(null);

  metrics = computed<HouseholdMetrics | null>(() => this.overview()?.metrics ?? null);
  advisories = computed<Advisory[]>(() => this.overview()?.advisories ?? []);

  hasData = computed(() => {
    const m = this.metrics();
    return !!m && (m.monthlyIncome > 0 || m.totalAssets > 0 || m.totalLiabilities > 0
      || m.monthlyExpenses > 0 || m.goals.length > 0);
  });

  // Donut segments: pathLength is 100 (r=15.915), so dash length == percent; offset is the
  // negative running total so each arc starts where the previous ended.
  donut = computed(() => {
    let acc = 0;
    return (this.metrics()?.allocation ?? []).map(s => {
      const seg = { cls: s.assetClass.toLowerCase(), dash: s.pct, offset: -acc };
      acc += s.pct;
      return seg;
    });
  });

  ngOnInit(): void {
    this.api.getOverview().subscribe({
      next: o => { this.overview.set(o); this.loading.set(false); },
      error: () => { this.errorMessage.set('Failed to load your finances. Please try again.'); this.loading.set(false); },
    });
    this.loadInsights();
  }

  // ---- Statement analysis ----

  loadInsights(): void {
    this.insightsLoading.set(true);
    this.picked.set([]);
    this.applyMsg.set(null);
    this.api.insights(this.months()).subscribe({
      next: a => { this.insights.set(a); this.insightsLoading.set(false); },
      error: () => {
        this.insightsLoading.set(false);
        this.insightsError.set('Could not analyse your transactions.');
      },
    });
  }

  onMonths(event: Event): void {
    this.months.set(Number((event.target as HTMLSelectElement).value) || 6);
    this.loadInsights();
  }

  /** Bar height as a percentage of the busiest month, so the chart scales itself. */
  barHeight(value: number): number {
    const peak = Math.max(1, ...(this.insights()?.months ?? []).flatMap(m => [m.moneyIn, m.moneyOut]));
    return Math.round((value / peak) * 100);
  }

  categoryPct(total: number): number {
    const peak = Math.max(1, ...(this.insights()?.categories ?? []).map(c => c.total));
    return Math.round((total / peak) * 100);
  }

  /** "LoanEmi" → "Loan EMI", "SelfTransfer" → "Self transfer". */
  prettyKind(kind: string): string {
    if (kind === 'LoanEmi') return 'Loan EMI';
    const spaced = kind.replace(/([a-z])([A-Z])/g, '$1 $2');
    return spaced.charAt(0) + spaced.slice(1).toLowerCase();
  }

  isPicked(s: StatementSuggestion): boolean {
    return this.picked().some(p => p.label === s.label && p.kind === s.kind);
  }

  togglePick(s: StatementSuggestion): void {
    this.picked.update(list => this.isPicked(s)
      ? list.filter(p => !(p.label === s.label && p.kind === s.kind))
      : [...list, s]);
  }

  apply(): void {
    const chosen = this.picked();
    if (!chosen.length) return;
    this.applying.set(true);
    const payload: AppliedSuggestion[] = chosen.map(s => ({
      kind: s.kind,
      label: s.label,
      monthlyAmount: s.monthlyAmount,
      incomeType: s.incomeType ?? null,
      debtType: s.debtType ?? null,
      expenseCategory: s.expenseCategory ?? null,
      isEssential: s.isEssential,
    }));

    this.api.applySuggestions(payload).subscribe({
      next: r => {
        this.applying.set(false);
        this.picked.set([]);
        this.applyMsg.set(r.created > 0
          ? `Added ${r.created} record${r.created === 1 ? '' : 's'} — reloading your totals…`
          : 'Those records already exist.');
        // The metrics change as soon as records land, so pull the overview again.
        if (r.created > 0) {
          this.api.getOverview().subscribe({ next: o => this.overview.set(o), error: () => {} });
        }
      },
      error: () => { this.applying.set(false); this.applyMsg.set('Could not add those records.'); },
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
