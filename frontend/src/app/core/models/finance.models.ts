// Mirrors the KeshavSingh.Finance package shapes (served by the admin API). The financial logic
// lives server-side in that private package; the UI only renders these.

export type Frequency = 'Monthly' | 'Quarterly' | 'Annual' | 'OneOff';
export type IncomeType = 'Salary' | 'Business' | 'Rental' | 'Interest' | 'Dividend' | 'Pension' | 'Other';
export type ExpenseCategory =
  'Housing' | 'Utilities' | 'Groceries' | 'Transport' | 'Healthcare' | 'Education' | 'Insurance' | 'Lifestyle' | 'Other';
export type AssetClass = 'Equity' | 'Debt' | 'Gold' | 'RealEstate' | 'Cash' | 'Crypto' | 'Other';
export type AccountType = 'Taxable' | 'Retirement' | 'TaxAdvantaged';
export type DebtType = 'Home' | 'Auto' | 'Personal' | 'CreditCard' | 'Education' | 'Other';
export type GoalPriority = 'Low' | 'Medium' | 'High';
export type AdvisorySeverity = 'Info' | 'Warning' | 'Critical';

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
