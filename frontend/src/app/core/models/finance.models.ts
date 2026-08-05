// Mirrors the KeshavSingh.Finance package shapes (served by the admin API). The financial logic
// lives server-side in that private package; the UI only renders these.

export type Frequency = 'Monthly' | 'Quarterly' | 'Annual' | 'OneOff';
export type IncomeType = 'Salary' | 'Business' | 'Rental' | 'Interest' | 'Dividend' | 'Pension' | 'Other';
export type ExpenseCategory =
  'Housing' | 'Utilities' | 'Groceries' | 'Transport' | 'Healthcare' | 'Education' | 'Insurance' | 'Lifestyle' | 'Other';
export type AssetClass = 'Equity' | 'Debt' | 'Gold' | 'RealEstate' | 'Cash' | 'Crypto' | 'Other';
export type AccountType = 'Taxable' | 'Retirement' | 'TaxAdvantaged';
export type InstrumentKind =
  'Other' | 'MutualFund' | 'Stock' | 'ProvidentFund' | 'Nps' | 'FixedDeposit' | 'RecurringDeposit'
  | 'Bond' | 'GoldPhysical' | 'GoldDigital' | 'InsurancePolicy' | 'RealEstate' | 'Crypto' | 'Cash';
export type DebtType = 'Home' | 'Auto' | 'Personal' | 'CreditCard' | 'Education' | 'Gold' | 'Business' | 'Other';
export type GoalPriority = 'Low' | 'Medium' | 'High';
export type AdvisorySeverity = 'Info' | 'Warning' | 'Critical';
export type TransactionDirection = 'Debit' | 'Credit';

export interface Household {
  id: string;
  name: string;
  currency: string;
  emergencyFundTargetMonths: number;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation?: string | null;
  dateOfBirth?: string | null;
  isEarning: boolean;
}

export interface IncomeSource {
  id: string;
  label: string;
  type: IncomeType;
  frequency: Frequency;
  amount: number;
  memberId?: string | null;
  isActive: boolean;
}

export interface Expense {
  id: string;
  label: string;
  category: ExpenseCategory;
  frequency: Frequency;
  amount: number;
  isEssential: boolean;
  memberId?: string | null;
}

export interface Investment {
  id: string;
  name: string;
  assetClass: AssetClass;
  kind: InstrumentKind;
  accountType: AccountType;
  investedAmount: number;
  currentValue: number;
  expectedReturnPct?: number | null;
  sipMonthly?: number | null;
  memberId?: string | null;
}

export interface Liability {
  id: string;
  name: string;
  type: DebtType;
  outstanding: number;
  interestRatePct: number;
  emiMonthly?: number | null;
  memberId?: string | null;
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentSavings: number;
  targetDate: string;
  priority: GoalPriority;
}

export interface AllocationSlice { assetClass: AssetClass; value: number; pct: number; }
export interface MemberIncome { memberId?: string | null; name: string; monthlyIncome: number; pct: number; }
export interface GoalProgress {
  goalId: string;
  name: string;
  targetAmount: number;
  currentSavings: number;
  progressPct: number;
  monthsRemaining: number;
  requiredMonthly: number;
  priority: GoalPriority;
}

export interface HouseholdMetrics {
  currency: string;
  planningAge?: number | null;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyEssentialExpenses: number;
  monthlyDebtPayments: number;
  monthlyOutflow: number;
  monthlySurplus: number;
  savingsRatePct: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  cashValue: number;
  equityPct: number;
  emergencyFundMonths: number;
  debtToIncomePct: number;
  totalSipMonthly: number;
  allocation: AllocationSlice[];
  memberIncomes: MemberIncome[];
  goals: GoalProgress[];
}

export interface Advisory {
  severity: AdvisorySeverity;
  category: string;
  title: string;
  message: string;
  recommendedAction?: string | null;
  metricValue?: number | null;
}

export interface FinanceOverview {
  metrics: HouseholdMetrics;
  advisories: Advisory[];
}

export interface Transaction {
  id: string;
  memberId?: string | null;
  date: string;
  description: string;
  amount: number;
  direction: TransactionDirection;
  category?: string | null;
  account?: string | null;
}

export interface PagedResult<T> { items: T[]; total: number; }
export interface ImportResult { imported: number; skipped: number; }

/** Zero-based column mapping posted to the CSV import endpoint. */
export interface ImportTransactionsRequest {
  csvText: string;
  dateColumn: number;
  descriptionColumn: number;
  amountColumn?: number | null;
  debitColumn?: number | null;
  creditColumn?: number | null;
  dateFormat?: string | null;
  hasHeader: boolean;
  account?: string | null;
  category?: string | null;
}

/**
 * The table the server recovered from a statement PDF. A PDF has no header row to infer columns from,
 * so the mapping is chosen against these rows.
 */
export interface PdfStatementPreview {
  pages: number;
  columns: number;
  totalRows: number;
  truncated: boolean;
  rows: string[][];
}

// ---- Statement analysis (mirrors KeshavSingh.Finance.StatementInsights) ----

/** What the analyser thinks a narration was. Serialised as a string by the API. */
export type StatementEntryKind =
  | 'Unknown' | 'Salary' | 'LoanEmi' | 'Rent' | 'Utilities' | 'Insurance' | 'Investment'
  | 'Groceries' | 'Transport' | 'Healthcare' | 'Education' | 'Lifestyle'
  | 'CreditCardPayment' | 'SelfTransfer' | 'Interest' | 'Fees';

export interface MonthlyTotal {
  year: number;
  month: number;
  moneyIn: number;
  moneyOut: number;
  net: number;
  label: string;
}

export interface CategoryTotal {
  kind: StatementEntryKind;
  total: number;
  count: number;
}

/** A payment that keeps coming back — salary, EMI, subscription. */
export interface RecurringSeries {
  label: string;
  kind: StatementEntryKind;
  direction: TransactionDirection;
  typicalAmount: number;
  occurrences: number;
  averageGapDays: number;
  firstSeen: string;
  lastSeen: string;
  isMonthly: boolean;
}

/** A record the analyser thinks is missing. Nothing is created until the user accepts it. */
export interface StatementSuggestion {
  kind: 'income' | 'liability' | 'expense';
  label: string;
  monthlyAmount: number;
  detected: StatementEntryKind;
  occurrences: number;
  reason: string;
  incomeType?: IncomeType | null;
  debtType?: DebtType | null;
  expenseCategory?: ExpenseCategory | null;
  isEssential: boolean;
}

export interface StatementAnalysis {
  from: string | null;
  to: string | null;
  transactionCount: number;
  totalIn: number;
  totalOut: number;
  averageMonthlyIn: number;
  averageMonthlyOut: number;
  months: MonthlyTotal[];
  categories: CategoryTotal[];
  recurring: RecurringSeries[];
  suggestions: StatementSuggestion[];
}

/** One accepted suggestion, sent back to be created. */
export interface AppliedSuggestion {
  kind: 'income' | 'liability' | 'expense';
  label: string;
  monthlyAmount: number;
  incomeType?: IncomeType | null;
  debtType?: DebtType | null;
  expenseCategory?: ExpenseCategory | null;
  isEssential: boolean;
}
