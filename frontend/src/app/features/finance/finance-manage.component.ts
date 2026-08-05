import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FinanceService } from '../../core/services/finance.service';
import {
  AccountType, AssetClass, DebtType, Expense, ExpenseCategory, FamilyMember, FinancialGoal,
  Frequency, GoalPriority, Household, ImportTransactionsRequest, IncomeSource, IncomeType,
  InstrumentKind, Investment, Liability, PdfStatementPreview, Transaction, TransactionDirection,
} from '../../core/models/finance.models';

type Tab = 'household' | 'members' | 'income' | 'expenses' | 'investments' | 'liabilities' | 'goals' | 'transactions';

@Component({
  selector: 'app-finance-manage',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="manage">
      <div class="fin-head">
        <div><h1>Manage finances</h1><p class="subtitle">Add and edit the data behind your dashboard.</p></div>
        <div class="head-actions">
          <button class="btn-secondary" (click)="exportXlsx()" [disabled]="busy()">⬇ Export .xlsx</button>
          <a class="btn-secondary" routerLink="/finance">← Dashboard</a>
        </div>
      </div>

      @if (errorMessage()) { <div class="error-banner">⚠️ {{ errorMessage() }}</div> }

      <div class="tabs">
        @for (t of tabs; track t.key) {
          <button class="tab" [class.active]="tab() === t.key" (click)="setTab(t.key)">{{ t.label }}</button>
        }
      </div>

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
        <div class="card">
          <div class="card-head">
            <h2>{{ currentLabel() }}</h2>
            <div class="head-actions">
              @if (tab() === 'transactions') { <button class="btn-secondary" (click)="openImport()">⬆ Import CSV</button> }
              <button class="btn-primary" (click)="openCreate()">+ Add</button>
            </div>
          </div>
          @if (loading()) { <p class="muted">Loading…</p> }
          @else {
            <div class="table-wrap">
              <table>
                <thead><tr>@for (c of columns(); track c) { <th>{{ c }}</th> }<th></th></tr></thead>
                <tbody>
                  @for (row of pagedRows(); track row.id) {
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
            @if (pageInfo().total > 0) {
              <div class="pager">
                <span class="muted">{{ pageInfo().start }}–{{ pageInfo().end }} of {{ pageInfo().total }}</span>
                <span class="pager-btns">
                  <button class="btn-secondary sm" (click)="prev()" [disabled]="!canPrev()">‹ Prev</button>
                  <button class="btn-secondary sm" (click)="next()" [disabled]="!canNext()">Next ›</button>
                </span>
              </div>
            }
          }
        </div>
      }

      <!-- Add/edit modal -->
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
                  <label class="check" style="align-self:end"><input type="checkbox" [(ngModel)]="model.isActive"> Active</label>
                </div>
              }
              @case ('expenses') {
                <label class="field"><span>Label</span><input class="input" [(ngModel)]="model.label"></label>
                <div class="grid-2">
                  <label class="field"><span>Category</span><select class="input" [(ngModel)]="model.category">@for (o of expenseCategories; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                  <label class="field"><span>Frequency</span><select class="input" [(ngModel)]="model.frequency">@for (o of frequencies; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Amount</span><input class="input" type="number" [(ngModel)]="model.amount"></label>
                  <label class="check" style="align-self:end"><input type="checkbox" [(ngModel)]="model.isEssential"> Essential (must-pay)</label>
                </div>
              }
              @case ('investments') {
                <label class="field"><span>Name</span><input class="input" [(ngModel)]="model.name"></label>
                <div class="grid-2">
                  <label class="field"><span>Kind</span><select class="input" [(ngModel)]="model.kind">@for (o of instrumentKinds; track o) { <option [value]="o">{{ label(o) }}</option> }</select></label>
                  <label class="field"><span>Asset class</span><select class="input" [(ngModel)]="model.assetClass">@for (o of assetClasses; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Account</span><select class="input" [(ngModel)]="model.accountType">@for (o of accountTypes; track o) { <option [value]="o">{{ label(o) }}</option> }</select></label>
                  <label class="field"><span>Monthly SIP (opt)</span><input class="input" type="number" [(ngModel)]="model.sipMonthly"></label>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Invested</span><input class="input" type="number" [(ngModel)]="model.investedAmount"></label>
                  <label class="field"><span>Current value</span><input class="input" type="number" [(ngModel)]="model.currentValue"></label>
                </div>
                <label class="field"><span>Expected return % (opt)</span><input class="input" type="number" [(ngModel)]="model.expectedReturnPct"></label>
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
              @case ('transactions') {
                <div class="grid-2">
                  <label class="field"><span>Date</span><input class="input" type="date" [(ngModel)]="model.date"></label>
                  <label class="field"><span>Direction</span><select class="input" [(ngModel)]="model.direction">
                    <option value="Debit">Debit (money out)</option><option value="Credit">Credit (money in)</option></select></label>
                </div>
                <label class="field"><span>Description</span><input class="input" [(ngModel)]="model.description"></label>
                <div class="grid-2">
                  <label class="field"><span>Amount</span><input class="input" type="number" [(ngModel)]="model.amount"></label>
                  <label class="field"><span>Category</span><input class="input" [(ngModel)]="model.category" placeholder="Groceries / Salary"></label>
                </div>
                <label class="field"><span>Account</span><input class="input" [(ngModel)]="model.account" placeholder="HDFC Savings"></label>
              }
            }

            @if (usesMember()) {
              <label class="field"><span>Member</span>
                <div class="member-row">
                  <select class="input" [(ngModel)]="model.memberId">
                    <option [ngValue]="null">— Household —</option>
                    @for (mem of members(); track mem.id) { <option [ngValue]="mem.id">{{ mem.name }}</option> }
                  </select>
                  <button type="button" class="btn-secondary sm" (click)="toggleAddMember()">+ New</button>
                </div>
                @if (addingMember()) {
                  <div class="member-row" style="margin-top:0.4rem">
                    <input class="input" [(ngModel)]="newMemberName" placeholder="New member name">
                    <button type="button" class="btn-primary sm" (click)="addMemberInline()" [disabled]="busy()">Add</button>
                  </div>
                }
              </label>
            }

            <div class="form-actions">
              <button class="btn-primary" (click)="save()" [disabled]="busy()">Save</button>
              <button class="btn-secondary" (click)="close()">Cancel</button>
            </div>
          </div>
        </div>
      }

      <!-- CSV import modal -->
      @if (importing()) {
        <div class="scrim" (click)="closeImport()">
          <div class="dialog" (click)="$event.stopPropagation()">
            <h2>Import bank statement</h2>
            <label class="field"><span>Statement file (.csv, .xlsx or .pdf)</span>
              <input class="input" type="file" accept=".csv,text/csv,.xlsx,.pdf,application/pdf"
                     (change)="onImportFile($event)"></label>

            @if (pdfFile()) {
              <!-- Bank PDFs are usually locked with a DOB/PAN-style password. It is sent with this one
                   request to read the file and is never stored, here or on the server. -->
              <p class="muted">{{ pdfFile()!.name }} — read the statement first, then map its columns.</p>
              <div class="grid-2">
                <label class="field"><span>PDF password (if protected)</span>
                  <input class="input" type="password" autocomplete="off" [(ngModel)]="pdfPassword"
                         placeholder="Leave blank if not protected"></label>
                <div class="field">
                  <span>&nbsp;</span>
                  <button class="btn-secondary" (click)="readPdf()" [disabled]="busy()">
                    {{ pdfPreview() ? 'Read again' : 'Read statement' }}</button>
                </div>
              </div>
            }

            @if (pdfPreview(); as p) {
              <p class="muted">{{ p.totalRows }} row(s) across {{ p.pages }} page(s), {{ p.columns }} columns.
                Check the numbers below against the table, then map them.</p>
              <div class="preview-scroll">
                <table class="preview">
                  <thead><tr>@for (c of p.rows[0]; track $index) { <th>{{ $index }}</th> }</tr></thead>
                  <tbody>
                    @for (row of p.rows; track $index) {
                      <tr>@for (cell of row; track $index) { <td>{{ cell }}</td> }</tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            @if (xlsxFile()) {
              <!-- We can't read an .xlsx in the browser without pulling in a parser, so the columns are
                   entered by hand here (0 = first column) and the server does the parsing. -->
              <p class="muted">{{ xlsxFile()!.name }} — enter which columns to use, counting from 0.</p>
              <div class="grid-2">
                <label class="field"><span>Date column</span>
                  <input class="input" type="number" min="0" [(ngModel)]="imp.dateColumn"></label>
                <label class="field"><span>Description column</span>
                  <input class="input" type="number" min="0" [(ngModel)]="imp.descriptionColumn"></label>
              </div>
              <label class="field"><span>Amount columns</span><select class="input" [(ngModel)]="amountMode">
                <option value="single">One signed amount column</option>
                <option value="split">Separate debit &amp; credit columns</option></select></label>
              @if (amountMode === 'single') {
                <label class="field"><span>Amount column</span>
                  <input class="input" type="number" min="0" [(ngModel)]="imp.amountColumn"></label>
              } @else {
                <div class="grid-2">
                  <label class="field"><span>Debit (out) column</span>
                    <input class="input" type="number" min="0" [(ngModel)]="imp.debitColumn"></label>
                  <label class="field"><span>Credit (in) column</span>
                    <input class="input" type="number" min="0" [(ngModel)]="imp.creditColumn"></label>
                </div>
              }
              <div class="grid-2">
                <label class="field"><span>Date format (optional)</span><input class="input" [(ngModel)]="imp.dateFormat" placeholder="dd/MM/yyyy"></label>
                <label class="field"><span>Account label</span><input class="input" [(ngModel)]="imp.account" placeholder="HDFC Savings"></label>
              </div>
              <label class="check"><input type="checkbox" [(ngModel)]="imp.hasHeader"> First row is a header</label>
            }

            @if (csvColumns().length) {
              <p class="muted">Detected {{ csvColumns().length }} columns — map them below.</p>
              <div class="grid-2">
                <label class="field"><span>Date column</span><select class="input" [(ngModel)]="imp.dateColumn">@for (c of csvColumns(); track c.index){<option [ngValue]="c.index">{{ c.label }}</option>}</select></label>
                <label class="field"><span>Description column</span><select class="input" [(ngModel)]="imp.descriptionColumn">@for (c of csvColumns(); track c.index){<option [ngValue]="c.index">{{ c.label }}</option>}</select></label>
              </div>
              <label class="field"><span>Amount columns</span><select class="input" [(ngModel)]="amountMode">
                <option value="single">One signed amount column</option>
                <option value="split">Separate debit &amp; credit columns</option></select></label>
              @if (amountMode === 'single') {
                <label class="field"><span>Amount column</span><select class="input" [(ngModel)]="imp.amountColumn">@for (c of csvColumns(); track c.index){<option [ngValue]="c.index">{{ c.label }}</option>}</select></label>
              } @else {
                <div class="grid-2">
                  <label class="field"><span>Debit (out) column</span><select class="input" [(ngModel)]="imp.debitColumn">@for (c of csvColumns(); track c.index){<option [ngValue]="c.index">{{ c.label }}</option>}</select></label>
                  <label class="field"><span>Credit (in) column</span><select class="input" [(ngModel)]="imp.creditColumn">@for (c of csvColumns(); track c.index){<option [ngValue]="c.index">{{ c.label }}</option>}</select></label>
                </div>
              }
              <div class="grid-2">
                <label class="field"><span>Date format (optional)</span><input class="input" [(ngModel)]="imp.dateFormat" placeholder="dd/MM/yyyy"></label>
                <label class="field"><span>Account label</span><input class="input" [(ngModel)]="imp.account" placeholder="HDFC Savings"></label>
              </div>
              <label class="check"><input type="checkbox" [(ngModel)]="imp.hasHeader"> First row is a header</label>
            }
            @if (importMsg()) { <p class="muted">{{ importMsg() }}</p> }
            <div class="form-actions">
              <button class="btn-primary" (click)="submitImport()"
                      [disabled]="busy() || (!imp.csvText && !xlsxFile() && !pdfPreview())">Import</button>
              <button class="btn-secondary" (click)="closeImport()">Close</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .manage { padding: 2rem; }
    .fin-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.25rem; }
    .head-actions { display:flex; gap:0.5rem; align-items:center; }
    .subtitle { color:var(--muted); margin:0.25rem 0 0; }
    .tabs { display:flex; flex-wrap:wrap; gap:0.4rem; margin-bottom:1.1rem; }
    .tab { padding:0.45rem 0.85rem; border:1px solid var(--border); background:var(--surface); color:var(--text);
      border-radius:99px; font-size:0.85rem; font-weight:600; cursor:pointer; }
    .tab.active { background:var(--brand); color:var(--brand-text); border-color:var(--brand); }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:1.25rem; box-shadow:var(--shadow-sm); }
    .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; gap:0.75rem; }
    .card-head h2 { margin:0; font-size:1.05rem; color:var(--text); }
    .muted { color:var(--muted); }
    .table-wrap { overflow-x:auto; }
    table { width:100%; border-collapse:collapse; font-size:0.9rem; color:var(--text); }
    th, td { text-align:left; padding:0.55rem 0.6rem; border-bottom:1px solid var(--border); }
    th { color:var(--muted); font-weight:600; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.03em; }
    td.empty { color:var(--muted); text-align:center; padding:1.5rem; }
    td.actions { text-align:right; white-space:nowrap; }
    .pager { display:flex; justify-content:space-between; align-items:center; margin-top:0.9rem; }
    .pager-btns { display:flex; gap:0.4rem; }
    .field { display:block; margin-bottom:0.75rem; } .field span { display:block; font-size:0.82rem; color:var(--muted); margin-bottom:0.25rem; }
    .input { display:block; width:100%; padding:0.5rem 0.7rem; border:1px solid var(--border); border-radius:6px;
      font-size:0.95rem; box-sizing:border-box; background:var(--surface); color:var(--text); }
    .input:focus { outline:none; border-color:var(--brand); box-shadow:0 0 0 2px color-mix(in srgb, var(--brand) 28%, transparent); }
    .member-row { display:flex; gap:0.5rem; align-items:center; }
    .member-row .input { flex:1; }
    .check { display:flex; align-items:center; gap:0.4rem; font-size:0.9rem; color:var(--text); margin-bottom:0.5rem; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
    @media (max-width:560px){ .grid-2{ grid-template-columns:1fr; } }
    .form-actions { display:flex; gap:0.6rem; margin-top:0.75rem; }
    .btn-primary { background:var(--brand); color:var(--brand-text); border:none; padding:0.5rem 1rem; border-radius:6px; cursor:pointer; text-decoration:none; font-weight:600; }
    .btn-primary[disabled] { opacity:0.6; cursor:default; }
    .btn-secondary { background:transparent; border:1px solid var(--border); padding:0.5rem 1rem; border-radius:6px; cursor:pointer; text-decoration:none; color:var(--text); }
    .btn-danger { background:transparent; border:1px solid #d03b3b; color:#d03b3b; padding:0.5rem 1rem; border-radius:6px; cursor:pointer; }
    .btn-secondary.sm, .btn-danger.sm, .btn-primary.sm { padding:0.3rem 0.6rem; font-size:0.82rem; }
    .actions .btn-secondary.sm { margin-left:0.3rem; }
    .error-banner { background:color-mix(in srgb, #d03b3b 14%, var(--surface)); color:#d03b3b;
      border:1px solid color-mix(in srgb, #d03b3b 40%, var(--surface)); border-radius:6px; padding:0.75rem 1rem; margin-bottom:1rem; }
    .scrim { position:fixed; inset:0; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index:1000; padding:1rem; }
    .dialog { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
      padding:1.5rem; width:100%; max-width:540px; max-height:90vh; overflow-y:auto; box-shadow:var(--shadow-sm); }
    .dialog h2 { margin:0 0 1rem; color:var(--text); }
    .preview-scroll { max-height:220px; overflow:auto; border:1px solid var(--border); border-radius:6px; margin-bottom:0.75rem; }
    .preview { border-collapse:collapse; width:100%; font-size:0.74rem; }
    .preview th, .preview td { border-bottom:1px solid var(--border); border-right:1px solid var(--border);
      padding:0.25rem 0.4rem; text-align:left; white-space:nowrap; max-width:16rem; overflow:hidden; text-overflow:ellipsis; }
    .preview th { position:sticky; top:0; background:var(--surface); color:var(--muted); font-weight:600; }
  `],
})
export class FinanceManageComponent implements OnInit {
  private api = inject(FinanceService);

  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'household', label: 'Household' }, { key: 'members', label: 'Members' },
    { key: 'income', label: 'Income' }, { key: 'expenses', label: 'Expenses' },
    { key: 'investments', label: 'Investments' }, { key: 'liabilities', label: 'Debts' },
    { key: 'goals', label: 'Goals' }, { key: 'transactions', label: 'Transactions' },
  ];

  readonly frequencies: Frequency[] = ['Monthly', 'Quarterly', 'Annual', 'OneOff'];
  readonly incomeTypes: IncomeType[] = ['Salary', 'Business', 'Rental', 'Interest', 'Dividend', 'Pension', 'Other'];
  readonly expenseCategories: ExpenseCategory[] =
    ['Housing', 'Utilities', 'Groceries', 'Transport', 'Healthcare', 'Education', 'Insurance', 'Lifestyle', 'Other'];
  readonly assetClasses: AssetClass[] = ['Equity', 'Debt', 'Gold', 'RealEstate', 'Cash', 'Crypto', 'Other'];
  readonly instrumentKinds: InstrumentKind[] =
    ['MutualFund', 'Stock', 'ProvidentFund', 'Nps', 'FixedDeposit', 'RecurringDeposit', 'Bond',
     'GoldPhysical', 'GoldDigital', 'InsurancePolicy', 'RealEstate', 'Crypto', 'Cash', 'Other'];
  readonly accountTypes: AccountType[] = ['Taxable', 'Retirement', 'TaxAdvantaged'];
  readonly debtTypes: DebtType[] = ['Home', 'Auto', 'Personal', 'CreditCard', 'Education', 'Gold', 'Business', 'Other'];
  readonly priorities: GoalPriority[] = ['Low', 'Medium', 'High'];
  private readonly memberTabs: Tab[] = ['income', 'expenses', 'investments', 'liabilities', 'transactions'];

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

  // Client-side pagination for the small collections.
  page = signal(0);
  readonly pageSize = 10;

  // Server-side pagination for the (potentially large) transactions ledger.
  transactions = signal<Transaction[]>([]);
  txTotal = signal(0);
  txSkip = signal(0);
  readonly txLimit = 25;

  // Inline "add member" inside a picker.
  addingMember = signal(false);
  newMemberName = '';

  // Statement import dialog state. CSV is parsed here for the column picker; .xlsx is sent as-is and
  // parsed server-side, so its columns are entered by hand. A PDF is read server-side first — the
  // preview it returns supplies the column picker, since a PDF has no header row to detect.
  importing = signal(false);
  importMsg = signal<string | null>(null);
  amountMode: 'single' | 'split' = 'single';
  csvColumns = signal<{ index: number; label: string }[]>([]);
  xlsxFile = signal<File | null>(null);
  pdfFile = signal<File | null>(null);
  pdfPreview = signal<PdfStatementPreview | null>(null);
  /** Held only for the life of this dialog — never persisted, never sent anywhere else. */
  pdfPassword = '';
  imp: ImportTransactionsRequest = this.blankImport();

  ngOnInit(): void { this.loadAll(); }

  loadAll(): void {
    this.loading.set(true);
    this.api.getHousehold().subscribe({ next: h => this.household = h, error: () => this.fail('load your household') });
    this.api.listMembers().subscribe({ next: v => this.members.set(v) });
    this.api.listIncome().subscribe({ next: v => this.income.set(v) });
    this.api.listExpenses().subscribe({ next: v => this.expenses.set(v) });
    this.api.listInvestments().subscribe({ next: v => this.investments.set(v) });
    this.api.listLiabilities().subscribe({ next: v => this.liabilities.set(v) });
    this.api.listGoals().subscribe({ next: v => { this.goals.set(v); this.loading.set(false); }, error: () => this.loading.set(false) });
    if (this.tab() === 'transactions') this.loadTransactions();
  }

  loadTransactions(): void {
    this.api.listTransactions(this.txSkip(), this.txLimit).subscribe({
      next: r => { this.transactions.set(r.items); this.txTotal.set(r.total); },
      error: () => this.fail('load transactions'),
    });
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    this.page.set(0);
    if (t === 'transactions') { this.txSkip.set(0); this.loadTransactions(); }
  }

  currentLabel = computed(() => this.tabs.find(t => t.key === this.tab())?.label ?? '');
  singular = computed(() => {
    const l = this.currentLabel();
    return l === 'Debts' ? 'debt' : l === 'Income' ? 'income' : l.replace(/s$/, '').toLowerCase();
  });
  usesMember = computed(() => this.memberTabs.includes(this.tab()));

  /** Humanises enum-ish option values, e.g. GoldPhysical → "Gold Physical". */
  label(v: string): string { return v.replace(/([a-z])([A-Z])/g, '$1 $2'); }

  rows(): any[] {
    switch (this.tab()) {
      case 'members': return this.members();
      case 'income': return this.income();
      case 'expenses': return this.expenses();
      case 'investments': return this.investments();
      case 'liabilities': return this.liabilities();
      case 'goals': return this.goals();
      case 'transactions': return this.transactions();
      default: return [];
    }
  }

  pagedRows = computed(() => {
    if (this.tab() === 'transactions') return this.transactions();
    const all = this.rows();
    const start = this.page() * this.pageSize;
    return all.slice(start, start + this.pageSize);
  });

  pageInfo = computed(() => {
    if (this.tab() === 'transactions') {
      const total = this.txTotal(); const start = this.txSkip();
      return { start: total ? start + 1 : 0, end: Math.min(start + this.txLimit, total), total };
    }
    const total = this.rows().length; const start = this.page() * this.pageSize;
    return { start: total ? start + 1 : 0, end: Math.min(start + this.pageSize, total), total };
  });
  canPrev = computed(() => this.tab() === 'transactions' ? this.txSkip() > 0 : this.page() > 0);
  canNext = computed(() => this.tab() === 'transactions'
    ? this.txSkip() + this.txLimit < this.txTotal()
    : (this.page() + 1) * this.pageSize < this.rows().length);
  prev(): void {
    if (this.tab() === 'transactions') { this.txSkip.set(Math.max(0, this.txSkip() - this.txLimit)); this.loadTransactions(); }
    else this.page.update(p => Math.max(0, p - 1));
  }
  next(): void {
    if (this.tab() === 'transactions') { this.txSkip.update(s => s + this.txLimit); this.loadTransactions(); }
    else this.page.update(p => p + 1);
  }

  columns(): string[] {
    switch (this.tab()) {
      case 'members': return ['Name', 'Relation', 'Earning'];
      case 'income': return ['Label', 'Type', 'Frequency', 'Amount', 'Active'];
      case 'expenses': return ['Label', 'Category', 'Frequency', 'Amount', 'Essential'];
      case 'investments': return ['Name', 'Kind', 'Class', 'Invested', 'Current', 'SIP'];
      case 'liabilities': return ['Name', 'Type', 'Outstanding', 'Rate %', 'EMI'];
      case 'goals': return ['Name', 'Target', 'Saved', 'By', 'Priority'];
      case 'transactions': return ['Date', 'Description', 'Dir', 'Amount', 'Category', 'Account'];
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
      case 'investments': return [r.name, this.label(r.kind), r.assetClass, n(r.investedAmount), n(r.currentValue), r.sipMonthly ? n(r.sipMonthly) : '—'];
      case 'liabilities': return [r.name, r.type, n(r.outstanding), String(r.interestRatePct), r.emiMonthly ? n(r.emiMonthly) : '—'];
      case 'goals': return [r.name, n(r.targetAmount), n(r.currentSavings), (r.targetDate ?? '').slice(0, 10), r.priority];
      case 'transactions': return [(r.date ?? '').slice(0, 10), r.description, r.direction, n(r.amount), r.category ?? '—', r.account ?? '—'];
      default: return [];
    }
  }

  openCreate(): void { this.model = this.blank(); this.addingMember.set(false); this.editing.set(true); }
  openEdit(row: any): void {
    this.model = { ...row };
    if (this.model.dateOfBirth) this.model.dateOfBirth = String(this.model.dateOfBirth).slice(0, 10);
    if (this.model.targetDate) this.model.targetDate = String(this.model.targetDate).slice(0, 10);
    if (this.model.date) this.model.date = String(this.model.date).slice(0, 10);
    this.addingMember.set(false);
    this.editing.set(true);
  }
  close(): void { this.editing.set(false); }

  toggleAddMember(): void { this.addingMember.update(v => !v); this.newMemberName = ''; }
  addMemberInline(): void {
    const name = this.newMemberName.trim();
    if (!name) return;
    this.busy.set(true);
    this.api.createMember({ name, isEarning: false }).subscribe({
      next: m => {
        this.busy.set(false);
        this.api.listMembers().subscribe({ next: v => this.members.set(v) });
        this.model.memberId = m.id;
        this.addingMember.set(false);
        this.newMemberName = '';
      },
      error: () => { this.busy.set(false); this.fail('add the member'); },
    });
  }

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
      next: () => { this.busy.set(false); this.editing.set(false); this.errorMessage.set(null); this.reloadCurrent(); },
      error: () => { this.busy.set(false); this.fail('save this item'); },
    });
  }

  remove(row: any): void {
    if (!confirm(`Delete "${row.name ?? row.label ?? row.description}"?`)) return;
    this.dispatchDelete(this.tab(), row.id).subscribe({
      next: () => this.reloadCurrent(),
      error: () => this.fail('delete this item'),
    });
  }

  private reloadCurrent(): void {
    if (this.tab() === 'transactions') this.loadTransactions();
    else this.loadAll();
  }

  exportXlsx(): void {
    this.busy.set(true);
    this.api.exportXlsx().subscribe({
      next: blob => {
        this.busy.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'finance-export.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => { this.busy.set(false); this.fail('export your data'); },
    });
  }

  // ---- CSV import ----

  openImport(): void { this.imp = this.blankImport(); this.csvColumns.set([]); this.importMsg.set(null); this.amountMode = 'single'; this.importing.set(true); }
  closeImport(): void {
    this.importing.set(false);
    // Drop the picked file so reopening the dialog doesn't re-import the last statement by accident,
    // and the password with it — it has no reason to outlive the dialog.
    this.xlsxFile.set(null);
    this.pdfFile.set(null);
    this.pdfPreview.set(null);
    this.pdfPassword = '';
    this.csvColumns.set([]);
    this.imp = this.blankImport();
  }

  onImportFile(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importMsg.set(null);
    this.csvColumns.set([]);
    this.xlsxFile.set(null);
    this.pdfFile.set(null);
    this.pdfPreview.set(null);
    this.pdfPassword = '';

    if (file.name.toLowerCase().endsWith('.xlsx')) {
      // Workbooks go to the server untouched; no browser-side parser to add.
      this.imp = { ...this.blankImport(), csvText: '' };
      this.xlsxFile.set(file);
      return;
    }

    if (file.name.toLowerCase().endsWith('.pdf')) {
      // A PDF may be encrypted and has no header row, so nothing can be mapped until the server has
      // read it. The user enters the password (if any) and asks for the preview.
      this.imp = { ...this.blankImport(), csvText: '' };
      this.pdfFile.set(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      this.imp = { ...this.blankImport(), csvText: text };
      this.detectColumns(text);
    };
    reader.readAsText(file);
  }

  /** Asks the server to read the PDF, then drives the column picker from the table it found. */
  readPdf(): void {
    const file = this.pdfFile();
    if (!file) return;

    this.busy.set(true);
    this.importMsg.set(null);
    this.api.previewPdf(file, this.pdfPassword || null).subscribe({
      next: preview => {
        this.busy.set(false);
        this.pdfPreview.set(preview);
        // Label each column with a sample value so the numbers mean something while mapping.
        const sample = preview.rows.find(r => r.some(c => c.trim().length > 0)) ?? [];
        this.csvColumns.set(Array.from({ length: preview.columns }, (_, i) => ({
          index: i,
          label: `${i}: ${(sample[i] ?? '').trim() || '(blank)'}`,
        })));
        if (preview.columns >= 3) {
          this.imp.dateColumn = 0;
          this.imp.descriptionColumn = 1;
          this.imp.amountColumn = Math.min(2, preview.columns - 1);
        }
        // Statement PDFs repeat their headings on every page; the parser drops them as unparseable
        // rows anyway, so skipping only the first would just lose a transaction.
        this.imp.hasHeader = false;
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.pdfPreview.set(null);
        this.csvColumns.set([]);
        this.errorMessage.set(e.error?.error ?? 'Could not read that PDF. Please try again.');
      },
    });
  }

  private detectColumns(text: string): void {
    const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) ?? '';
    const cells = this.splitCsvLine(firstLine);
    this.csvColumns.set(cells.map((c, i) => ({ index: i, label: `${i}: ${c.trim() || '(blank)'}` })));
    if (cells.length >= 2) { this.imp.dateColumn = 0; this.imp.descriptionColumn = 1; this.imp.amountColumn = Math.min(2, cells.length - 1); }
  }

  private splitCsvLine(line: string): string[] {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  submitImport(): void {
    const req: ImportTransactionsRequest = {
      ...this.imp,
      amountColumn: this.amountMode === 'single' ? this.imp.amountColumn : null,
      debitColumn: this.amountMode === 'split' ? this.imp.debitColumn : null,
      creditColumn: this.amountMode === 'split' ? this.imp.creditColumn : null,
      dateFormat: this.imp.dateFormat || null,
      account: this.imp.account || null,
      category: this.imp.category || null,
    };

    const workbook = this.xlsxFile();
    const pdf = this.pdfFile();
    this.busy.set(true);
    const request = pdf
      ? this.api.importPdf(pdf, this.pdfPassword || null, req)
      : workbook
        ? this.api.importWorkbook(workbook, req)
        : this.api.importTransactions(req);

    request.subscribe({
      next: r => {
        this.busy.set(false);
        this.importMsg.set(`Imported ${r.imported} transaction(s), skipped ${r.skipped}.`
          + ' Uncategorised rows were labelled from their description — see Finance for the analysis.');
        this.txSkip.set(0);
        this.loadTransactions();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        // The server explains what it could not read (wrong password, scanned pages); pass that on.
        if (e.error?.error) this.errorMessage.set(e.error.error);
        else this.fail('import the statement');
      },
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
        return { name: m.name.trim(), assetClass: m.assetClass, kind: m.kind, accountType: m.accountType, investedAmount: this.num(m.investedAmount), currentValue: this.num(m.currentValue), expectedReturnPct: this.optNum(m.expectedReturnPct), sipMonthly: this.optNum(m.sipMonthly), memberId: this.optStr(m.memberId) };
      case 'liabilities':
        if (!m.name?.trim()) return null;
        return { name: m.name.trim(), type: m.type, outstanding: this.num(m.outstanding), interestRatePct: this.num(m.interestRatePct), emiMonthly: this.optNum(m.emiMonthly), memberId: this.optStr(m.memberId) };
      case 'goals':
        if (!m.name?.trim() || !m.targetDate) return null;
        return { name: m.name.trim(), targetAmount: this.num(m.targetAmount), currentSavings: this.num(m.currentSavings), targetDate: m.targetDate, priority: m.priority };
      case 'transactions':
        if (!m.description?.trim() || !m.date) return null;
        return { date: m.date, description: m.description.trim(), amount: this.num(m.amount), direction: m.direction, category: this.optStr(m.category), account: this.optStr(m.account), memberId: this.optStr(m.memberId) };
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
      case 'transactions': return id ? this.api.updateTransaction(id, body) : this.api.createTransaction(body);
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
      case 'transactions': return this.api.deleteTransaction(id);
      default: throw new Error('unknown');
    }
  }

  private today(): string { return new Date().toISOString().slice(0, 10); }

  private blank(): any {
    switch (this.tab()) {
      case 'members': return { name: '', relation: '', dateOfBirth: '', isEarning: true };
      case 'income': return { label: '', type: 'Salary', frequency: 'Monthly', amount: 0, memberId: null, isActive: true };
      case 'expenses': return { label: '', category: 'Housing', frequency: 'Monthly', amount: 0, isEssential: true, memberId: null };
      case 'investments': return { name: '', assetClass: 'Equity', kind: 'MutualFund', accountType: 'Taxable', investedAmount: 0, currentValue: 0, expectedReturnPct: '', sipMonthly: '', memberId: null };
      case 'liabilities': return { name: '', type: 'Home', outstanding: 0, interestRatePct: 0, emiMonthly: '', memberId: null };
      case 'goals': return { name: '', targetAmount: 0, currentSavings: 0, targetDate: '', priority: 'Medium' };
      case 'transactions': return { date: this.today(), description: '', amount: 0, direction: 'Debit', category: '', account: '', memberId: null };
      default: return {};
    }
  }

  private blankImport(): ImportTransactionsRequest {
    return { csvText: '', dateColumn: 0, descriptionColumn: 1, amountColumn: 2, debitColumn: null, creditColumn: null, dateFormat: '', hasHeader: true, account: '', category: '' };
  }
}
