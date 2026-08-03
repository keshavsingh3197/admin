import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { FinanceService } from '../../core/services/finance.service';
import {
  AccountType, AssetClass, DebtType, Expense, ExpenseCategory, FamilyMember, FinancialGoal,
  Frequency, GoalPriority, Household, IncomeSource, IncomeType, Investment, Liability,
} from '../../core/models/finance.models';

type Tab = 'household' | 'members' | 'income' | 'expenses' | 'investments' | 'liabilities' | 'goals';

@Component({
  selector: 'app-finance-manage',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="manage">
      <div class="fin-head">
        <div><h1>Manage finances</h1><p class="subtitle">Add and edit the data behind your dashboard.</p></div>
        <a class="btn-secondary" routerLink="/finance">← Back to dashboard</a>
      </div>

      @if (errorMessage()) { <div class="error-banner">⚠️ {{ errorMessage() }}</div> }

      <div class="tabs">
        @for (t of tabs; track t.key) {
          <button class="tab" [class.active]="tab() === t.key" (click)="tab.set(t.key)">{{ t.label }}</button>
        }
      </div>

      <!-- Household -->
      @if (tab() === 'household') {
        <div class="card">
          <div class="grid-2">
            <label class="field"><span>Name</span><input class="input" [(ngModel)]="household.name"></label>
            <label class="field"><span>Currency (ISO, e.g. INR)</span><input class="input" maxlength="3" [(ngModel)]="household.currency"></label>
          </div>
          <label class="field"><span>Emergency fund target (months of essentials)</span>
            <input class="input" type="number" [(ngModel)]="household.emergencyFundTargetMonths"></label>
          <div class="form-actions"><button class="btn-primary" (click)="saveHousehold()" [disabled]="busy()">Save household</button></div>
        </div>
      } @else {
        <!-- List + add -->
        <div class="card">
          <div class="card-head"><h2>{{ currentLabel() }}</h2><button class="btn-primary" (click)="openCreate()">+ Add</button></div>
          @if (loading()) { <p class="muted">Loading…</p> }
          @else {
            <div class="table-wrap">
              <table>
                <thead><tr>@for (c of columns(); track c) { <th>{{ c }}</th> }<th></th></tr></thead>
                <tbody>
                  @for (row of rows(); track row.id) {
                    <tr>
                      @for (cell of rowCells(row); track $index) { <td>{{ cell }}</td> }
                      <td class="actions">
                        <button class="btn-secondary sm" (click)="openEdit(row)">Edit</button>
                        <button class="btn-danger sm" (click)="remove(row)">Delete</button>
                      </td>
                    </tr>
                  } @empty { <tr><td class="empty" [attr.colspan]="columns().length + 1">Nothing here yet.</td></tr> }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <!-- Modal -->
      @if (editing()) {
        <div class="scrim" (click)="close()">
          <div class="dialog" (click)="$event.stopPropagation()">
            <h2>{{ model.id ? 'Edit' : 'Add' }} {{ singular() }}</h2>

            @switch (tab()) {
              @case ('members') {
                <label class="field"><span>Name</span><input class="input" [(ngModel)]="model.name"></label>
                <div class="grid-2">
                  <label class="field"><span>Relation</span><input class="input" [(ngModel)]="model.relation" placeholder="Self / Spouse / Child"></label>
                  <label class="field"><span>Date of birth</span><input class="input" type="date" [(ngModel)]="model.dateOfBirth"></label>
                </div>
                <label class="check"><input type="checkbox" [(ngModel)]="model.isEarning"> Earns income</label>
              }
              @case ('income') {
                <label class="field"><span>Label</span><input class="input" [(ngModel)]="model.label"></label>
                <div class="grid-2">
                  <label class="field"><span>Type</span><select class="input" [(ngModel)]="model.type">@for (o of incomeTypes; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                  <label class="field"><span>Frequency</span><select class="input" [(ngModel)]="model.frequency">@for (o of frequencies; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Amount</span><input class="input" type="number" [(ngModel)]="model.amount"></label>
                  <label class="field"><span>Member</span><select class="input" [(ngModel)]="model.memberId"><option [ngValue]="null">— Household —</option>@for (mem of members(); track mem.id) { <option [value]="mem.id">{{ mem.name }}</option> }</select></label>
                </div>
                <label class="check"><input type="checkbox" [(ngModel)]="model.isActive"> Active</label>
              }
              @case ('expenses') {
                <label class="field"><span>Label</span><input class="input" [(ngModel)]="model.label"></label>
                <div class="grid-2">
                  <label class="field"><span>Category</span><select class="input" [(ngModel)]="model.category">@for (o of expenseCategories; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                  <label class="field"><span>Frequency</span><select class="input" [(ngModel)]="model.frequency">@for (o of frequencies; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Amount</span><input class="input" type="number" [(ngModel)]="model.amount"></label>
                  <label class="field"><span>Member</span><select class="input" [(ngModel)]="model.memberId"><option [ngValue]="null">— Household —</option>@for (mem of members(); track mem.id) { <option [value]="mem.id">{{ mem.name }}</option> }</select></label>
                </div>
                <label class="check"><input type="checkbox" [(ngModel)]="model.isEssential"> Essential (must-pay)</label>
              }
              @case ('investments') {
                <label class="field"><span>Name</span><input class="input" [(ngModel)]="model.name"></label>
                <div class="grid-2">
                  <label class="field"><span>Asset class</span><select class="input" [(ngModel)]="model.assetClass">@for (o of assetClasses; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                  <label class="field"><span>Account</span><select class="input" [(ngModel)]="model.accountType">@for (o of accountTypes; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Invested</span><input class="input" type="number" [(ngModel)]="model.investedAmount"></label>
                  <label class="field"><span>Current value</span><input class="input" type="number" [(ngModel)]="model.currentValue"></label>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Expected return % (opt)</span><input class="input" type="number" [(ngModel)]="model.expectedReturnPct"></label>
                  <label class="field"><span>Monthly SIP (opt)</span><input class="input" type="number" [(ngModel)]="model.sipMonthly"></label>
                </div>
                <label class="field"><span>Member</span><select class="input" [(ngModel)]="model.memberId"><option [ngValue]="null">— Household —</option>@for (mem of members(); track mem.id) { <option [value]="mem.id">{{ mem.name }}</option> }</select></label>
              }
              @case ('liabilities') {
                <label class="field"><span>Name</span><input class="input" [(ngModel)]="model.name"></label>
                <div class="grid-2">
                  <label class="field"><span>Type</span><select class="input" [(ngModel)]="model.type">@for (o of debtTypes; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                  <label class="field"><span>Interest rate %</span><input class="input" type="number" [(ngModel)]="model.interestRatePct"></label>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Outstanding</span><input class="input" type="number" [(ngModel)]="model.outstanding"></label>
                  <label class="field"><span>Monthly EMI (opt)</span><input class="input" type="number" [(ngModel)]="model.emiMonthly"></label>
                </div>
                <label class="field"><span>Member</span><select class="input" [(ngModel)]="model.memberId"><option [ngValue]="null">— Household —</option>@for (mem of members(); track mem.id) { <option [value]="mem.id">{{ mem.name }}</option> }</select></label>
              }
              @case ('goals') {
                <label class="field"><span>Name</span><input class="input" [(ngModel)]="model.name"></label>
                <div class="grid-2">
                  <label class="field"><span>Target amount</span><input class="input" type="number" [(ngModel)]="model.targetAmount"></label>
                  <label class="field"><span>Saved so far</span><input class="input" type="number" [(ngModel)]="model.currentSavings"></label>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Target date</span><input class="input" type="date" [(ngModel)]="model.targetDate"></label>
                  <label class="field"><span>Priority</span><select class="input" [(ngModel)]="model.priority">@for (o of priorities; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                </div>
              }
            }

            <div class="form-actions">
              <button class="btn-primary" (click)="save()" [disabled]="busy()">Save</button>
              <button class="btn-secondary" (click)="close()">Cancel</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .manage { padding: 2rem; }
    .fin-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.25rem; }
    .subtitle { color:#666; margin:0.25rem 0 0; }
    .tabs { display:flex; flex-wrap:wrap; gap:0.4rem; margin-bottom:1.1rem; }
    .tab { padding:0.45rem 0.85rem; border:1px solid #ccc; background:#fff; color:#444; border-radius:99px;
      font-size:0.85rem; font-weight:600; cursor:pointer; }
    .tab.active { background:#1a73e8; color:#fff; border-color:#1a73e8; }
    .card { background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:1.25rem; }
    .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; }
    .card-head h2 { margin:0; font-size:1.05rem; }
    .muted { color:#888; }
    .table-wrap { overflow-x:auto; }
    table { width:100%; border-collapse:collapse; font-size:0.9rem; }
    th, td { text-align:left; padding:0.55rem 0.6rem; border-bottom:1px solid #eee; }
    th { color:#888; font-weight:600; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.03em; }
    td.empty { color:#888; text-align:center; padding:1.5rem; }
    td.actions { text-align:right; white-space:nowrap; }
    .field { display:block; margin-bottom:0.75rem; } .field span { display:block; font-size:0.82rem; color:#555; margin-bottom:0.25rem; }
    .input { display:block; width:100%; padding:0.5rem 0.7rem; border:1px solid #ccc; border-radius:4px; font-size:0.95rem; box-sizing:border-box; }
    .check { display:flex; align-items:center; gap:0.4rem; font-size:0.9rem; color:#444; margin-bottom:0.5rem; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
    @media (max-width:560px){ .grid-2{ grid-template-columns:1fr; } }
    .form-actions { display:flex; gap:0.6rem; margin-top:0.75rem; }
    .btn-primary { background:#1a73e8; color:#fff; border:none; padding:0.5rem 1rem; border-radius:4px; cursor:pointer; text-decoration:none; }
    .btn-secondary { background:transparent; border:1px solid #ccc; padding:0.5rem 1rem; border-radius:4px; cursor:pointer; text-decoration:none; color:#333; }
    .btn-danger { background:transparent; border:1px solid #d93025; color:#d93025; padding:0.5rem 1rem; border-radius:4px; cursor:pointer; }
    .btn-secondary.sm, .btn-danger.sm { padding:0.3rem 0.6rem; font-size:0.82rem; margin-left:0.3rem; }
    .error-banner { background:#fce8e6; color:#c5221f; border:1px solid #f5c6c6; border-radius:4px; padding:0.75rem 1rem; margin-bottom:1rem; }
    .scrim { position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:1000; padding:1rem; }
    .dialog { background:#fff; border-radius:8px; padding:1.5rem; width:100%; max-width:520px; max-height:90vh; overflow-y:auto; }
    .dialog h2 { margin:0 0 1rem; }
  `],
})
export class FinanceManageComponent implements OnInit {
  private api = inject(FinanceService);

  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'household', label: 'Household' }, { key: 'members', label: 'Members' },
    { key: 'income', label: 'Income' }, { key: 'expenses', label: 'Expenses' },
    { key: 'investments', label: 'Investments' }, { key: 'liabilities', label: 'Debts' },
    { key: 'goals', label: 'Goals' },
  ];

  readonly frequencies: Frequency[] = ['Monthly', 'Quarterly', 'Annual', 'OneOff'];
  readonly incomeTypes: IncomeType[] = ['Salary', 'Business', 'Rental', 'Interest', 'Dividend', 'Pension', 'Other'];
  readonly expenseCategories: ExpenseCategory[] =
    ['Housing', 'Utilities', 'Groceries', 'Transport', 'Healthcare', 'Education', 'Insurance', 'Lifestyle', 'Other'];
  readonly assetClasses: AssetClass[] = ['Equity', 'Debt', 'Gold', 'RealEstate', 'Cash', 'Crypto', 'Other'];
  readonly accountTypes: AccountType[] = ['Taxable', 'Retirement', 'TaxAdvantaged'];
  readonly debtTypes: DebtType[] = ['Home', 'Auto', 'Personal', 'CreditCard', 'Education', 'Other'];
  readonly priorities: GoalPriority[] = ['Low', 'Medium', 'High'];

  tab = signal<Tab>('household');
  loading = signal(true);
  editing = signal(false);
  busy = signal(false);
  errorMessage = signal<string | null>(null);
  model: any = {};

  household: Household = { id: '', name: 'My Household', currency: 'INR', emergencyFundTargetMonths: 6 };
  members = signal<FamilyMember[]>([]);
  income = signal<IncomeSource[]>([]);
  expenses = signal<Expense[]>([]);
  investments = signal<Investment[]>([]);
  liabilities = signal<Liability[]>([]);
  goals = signal<FinancialGoal[]>([]);

  ngOnInit(): void { this.loadAll(); }

  loadAll(): void {
    this.loading.set(true);
    this.api.getHousehold().subscribe({ next: h => this.household = h, error: () => this.fail('load your household') });
    this.api.listMembers().subscribe({ next: v => this.members.set(v) });
    this.api.listIncome().subscribe({ next: v => this.income.set(v) });
    this.api.listExpenses().subscribe({ next: v => this.expenses.set(v) });
    this.api.listInvestments().subscribe({ next: v => this.investments.set(v) });
    this.api.listLiabilities().subscribe({ next: v => this.liabilities.set(v) });
    this.api.listGoals().subscribe({ next: v => { this.goals.set(v); this.loading.set(false); }, error: () => { this.loading.set(false); } });
  }

  currentLabel = computed(() => this.tabs.find(t => t.key === this.tab())?.label ?? '');
  singular = computed(() => { const l = this.currentLabel(); return l === 'Debts' ? 'debt' : l.replace(/s$/, '').toLowerCase(); });

  rows(): any[] {
    switch (this.tab()) {
      case 'members': return this.members();
      case 'income': return this.income();
      case 'expenses': return this.expenses();
      case 'investments': return this.investments();
      case 'liabilities': return this.liabilities();
      case 'goals': return this.goals();
      default: return [];
    }
  }

  columns(): string[] {
    switch (this.tab()) {
      case 'members': return ['Name', 'Relation', 'Earning'];
      case 'income': return ['Label', 'Type', 'Frequency', 'Amount', 'Active'];
      case 'expenses': return ['Label', 'Category', 'Frequency', 'Amount', 'Essential'];
      case 'investments': return ['Name', 'Class', 'Invested', 'Current', 'SIP'];
      case 'liabilities': return ['Name', 'Type', 'Outstanding', 'Rate %', 'EMI'];
      case 'goals': return ['Name', 'Target', 'Saved', 'By', 'Priority'];
      default: return [];
    }
  }

  rowCells(r: any): string[] {
    const n = (v: any) => (v || v === 0) ? Number(v).toLocaleString() : '—';
    const yn = (v: any) => v ? 'Yes' : 'No';
    switch (this.tab()) {
      case 'members': return [r.name, r.relation ?? '—', yn(r.isEarning)];
      case 'income': return [r.label, r.type, r.frequency, n(r.amount), yn(r.isActive)];
      case 'expenses': return [r.label, r.category, r.frequency, n(r.amount), yn(r.isEssential)];
      case 'investments': return [r.name, r.assetClass, n(r.investedAmount), n(r.currentValue), r.sipMonthly ? n(r.sipMonthly) : '—'];
      case 'liabilities': return [r.name, r.type, n(r.outstanding), String(r.interestRatePct), r.emiMonthly ? n(r.emiMonthly) : '—'];
      case 'goals': return [r.name, n(r.targetAmount), n(r.currentSavings), (r.targetDate ?? '').slice(0, 10), r.priority];
      default: return [];
    }
  }

  openCreate(): void { this.model = this.blank(); this.editing.set(true); }
  openEdit(row: any): void {
    this.model = { ...row };
    if (this.model.dateOfBirth) this.model.dateOfBirth = String(this.model.dateOfBirth).slice(0, 10);
    if (this.model.targetDate) this.model.targetDate = String(this.model.targetDate).slice(0, 10);
    this.editing.set(true);
  }
  close(): void { this.editing.set(false); }

  saveHousehold(): void {
    this.busy.set(true);
    this.api.updateHousehold({
      name: this.household.name, currency: this.household.currency,
      emergencyFundTargetMonths: Number(this.household.emergencyFundTargetMonths) || 0,
    }).subscribe({
      next: h => { this.household = h; this.busy.set(false); },
      error: () => { this.busy.set(false); this.fail('save the household'); },
    });
  }

  save(): void {
    const kind = this.tab();
    const body = this.buildBody(kind);
    if (!body) { this.fail('complete the required fields'); return; }
    this.busy.set(true);
    this.dispatch(kind, this.model.id, body).subscribe({
      next: () => { this.busy.set(false); this.editing.set(false); this.errorMessage.set(null); this.loadAll(); },
      error: () => { this.busy.set(false); this.fail('save this item'); },
    });
  }

  remove(row: any): void {
    if (!confirm(`Delete "${row.name ?? row.label}"?`)) return;
    this.dispatchDelete(this.tab(), row.id).subscribe({
      next: () => this.loadAll(),
      error: () => this.fail('delete this item'),
    });
  }

  private fail(what: string): void { this.errorMessage.set(`Could not ${what}. Please try again.`); }

  private num(v: any): number { return Number(v) || 0; }
  private optNum(v: any): number | null { return v === '' || v === null || v === undefined ? null : Number(v); }
  private optStr(v: any): string | null { return v ? v : null; }

  private buildBody(kind: Tab): any | null {
    const m = this.model;
    switch (kind) {
      case 'members':
        if (!m.name?.trim()) return null;
        return { name: m.name.trim(), relation: this.optStr(m.relation), dateOfBirth: this.optStr(m.dateOfBirth), isEarning: !!m.isEarning };
      case 'income':
        if (!m.label?.trim()) return null;
        return { label: m.label.trim(), type: m.type, frequency: m.frequency, amount: this.num(m.amount), memberId: this.optStr(m.memberId), isActive: m.isActive ?? true };
      case 'expenses':
        if (!m.label?.trim()) return null;
        return { label: m.label.trim(), category: m.category, frequency: m.frequency, amount: this.num(m.amount), isEssential: !!m.isEssential, memberId: this.optStr(m.memberId) };
      case 'investments':
        if (!m.name?.trim()) return null;
        return { name: m.name.trim(), assetClass: m.assetClass, accountType: m.accountType, investedAmount: this.num(m.investedAmount), currentValue: this.num(m.currentValue), expectedReturnPct: this.optNum(m.expectedReturnPct), sipMonthly: this.optNum(m.sipMonthly), memberId: this.optStr(m.memberId) };
      case 'liabilities':
        if (!m.name?.trim()) return null;
        return { name: m.name.trim(), type: m.type, outstanding: this.num(m.outstanding), interestRatePct: this.num(m.interestRatePct), emiMonthly: this.optNum(m.emiMonthly), memberId: this.optStr(m.memberId) };
      case 'goals':
        if (!m.name?.trim() || !m.targetDate) return null;
        return { name: m.name.trim(), targetAmount: this.num(m.targetAmount), currentSavings: this.num(m.currentSavings), targetDate: m.targetDate, priority: m.priority };
      default: return null;
    }
  }

  private dispatch(kind: Tab, id: string | undefined, body: any): Observable<any> {
    switch (kind) {
      case 'members': return id ? this.api.updateMember(id, body) : this.api.createMember(body);
      case 'income': return id ? this.api.updateIncome(id, body) : this.api.createIncome(body);
      case 'expenses': return id ? this.api.updateExpense(id, body) : this.api.createExpense(body);
      case 'investments': return id ? this.api.updateInvestment(id, body) : this.api.createInvestment(body);
      case 'liabilities': return id ? this.api.updateLiability(id, body) : this.api.createLiability(body);
      case 'goals': return id ? this.api.updateGoal(id, body) : this.api.createGoal(body);
      default: throw new Error('unknown');
    }
  }

  private dispatchDelete(kind: Tab, id: string): Observable<void> {
    switch (kind) {
      case 'members': return this.api.deleteMember(id);
      case 'income': return this.api.deleteIncome(id);
      case 'expenses': return this.api.deleteExpense(id);
      case 'investments': return this.api.deleteInvestment(id);
      case 'liabilities': return this.api.deleteLiability(id);
      case 'goals': return this.api.deleteGoal(id);
      default: throw new Error('unknown');
    }
  }

  private blank(): any {
    switch (this.tab()) {
      case 'members': return { name: '', relation: '', dateOfBirth: '', isEarning: true };
      case 'income': return { label: '', type: 'Salary', frequency: 'Monthly', amount: 0, memberId: null, isActive: true };
      case 'expenses': return { label: '', category: 'Housing', frequency: 'Monthly', amount: 0, isEssential: true, memberId: null };
      case 'investments': return { name: '', assetClass: 'Equity', accountType: 'Taxable', investedAmount: 0, currentValue: 0, expectedReturnPct: '', sipMonthly: '', memberId: null };
      case 'liabilities': return { name: '', type: 'Home', outstanding: 0, interestRatePct: 0, emiMonthly: '', memberId: null };
      case 'goals': return { name: '', targetAmount: 0, currentSavings: 0, targetDate: '', priority: 'Medium' };
      default: return {};
    }
  }
}
