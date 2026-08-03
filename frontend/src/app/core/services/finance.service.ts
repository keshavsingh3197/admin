import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Expense, FamilyMember, FinanceOverview, FinancialGoal, Household,
  ImportResult, ImportTransactionsRequest, IncomeSource, Investment, Liability,
  PagedResult, Transaction,
} from '../models/finance.models';

/** Family-finance API. Everything is owner-scoped server-side; no logic lives here. */
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private get f() { return `${this.baseUrl}/finance`; }

  getOverview(): Observable<FinanceOverview> { return this.http.get<FinanceOverview>(`${this.f}/overview`); }

  getHousehold(): Observable<Household> { return this.http.get<Household>(`${this.f}/household`); }
  updateHousehold(b: Partial<Household>): Observable<Household> { return this.http.put<Household>(`${this.f}/household`, b); }

  listMembers() { return this.http.get<FamilyMember[]>(`${this.f}/members`); }
  createMember(b: Partial<FamilyMember>) { return this.http.post<FamilyMember>(`${this.f}/members`, b); }
  updateMember(id: string, b: Partial<FamilyMember>) { return this.http.put<FamilyMember>(`${this.f}/members/${id}`, b); }
  deleteMember(id: string) { return this.http.delete<void>(`${this.f}/members/${id}`); }

  listIncome() { return this.http.get<IncomeSource[]>(`${this.f}/income`); }
  createIncome(b: Partial<IncomeSource>) { return this.http.post<IncomeSource>(`${this.f}/income`, b); }
  updateIncome(id: string, b: Partial<IncomeSource>) { return this.http.put<IncomeSource>(`${this.f}/income/${id}`, b); }
  deleteIncome(id: string) { return this.http.delete<void>(`${this.f}/income/${id}`); }

  listExpenses() { return this.http.get<Expense[]>(`${this.f}/expenses`); }
  createExpense(b: Partial<Expense>) { return this.http.post<Expense>(`${this.f}/expenses`, b); }
  updateExpense(id: string, b: Partial<Expense>) { return this.http.put<Expense>(`${this.f}/expenses/${id}`, b); }
  deleteExpense(id: string) { return this.http.delete<void>(`${this.f}/expenses/${id}`); }

  listInvestments() { return this.http.get<Investment[]>(`${this.f}/investments`); }
  createInvestment(b: Partial<Investment>) { return this.http.post<Investment>(`${this.f}/investments`, b); }
  updateInvestment(id: string, b: Partial<Investment>) { return this.http.put<Investment>(`${this.f}/investments/${id}`, b); }
  deleteInvestment(id: string) { return this.http.delete<void>(`${this.f}/investments/${id}`); }

  listLiabilities() { return this.http.get<Liability[]>(`${this.f}/liabilities`); }
  createLiability(b: Partial<Liability>) { return this.http.post<Liability>(`${this.f}/liabilities`, b); }
  updateLiability(id: string, b: Partial<Liability>) { return this.http.put<Liability>(`${this.f}/liabilities/${id}`, b); }
  deleteLiability(id: string) { return this.http.delete<void>(`${this.f}/liabilities/${id}`); }

  listGoals() { return this.http.get<FinancialGoal[]>(`${this.f}/goals`); }
  createGoal(b: Partial<FinancialGoal>) { return this.http.post<FinancialGoal>(`${this.f}/goals`, b); }
  updateGoal(id: string, b: Partial<FinancialGoal>) { return this.http.put<FinancialGoal>(`${this.f}/goals/${id}`, b); }
  deleteGoal(id: string) { return this.http.delete<void>(`${this.f}/goals/${id}`); }

  listTransactions(skip: number, limit: number): Observable<PagedResult<Transaction>> {
    return this.http.get<PagedResult<Transaction>>(`${this.f}/transactions?skip=${skip}&limit=${limit}`);
  }
  createTransaction(b: Partial<Transaction>) { return this.http.post<Transaction>(`${this.f}/transactions`, b); }
  updateTransaction(id: string, b: Partial<Transaction>) { return this.http.put<Transaction>(`${this.f}/transactions/${id}`, b); }
  deleteTransaction(id: string) { return this.http.delete<void>(`${this.f}/transactions/${id}`); }
  importTransactions(b: ImportTransactionsRequest): Observable<ImportResult> {
    return this.http.post<ImportResult>(`${this.f}/transactions/import`, b);
  }

  exportXlsx(): Observable<Blob> {
    return this.http.get(`${this.f}/export`, { responseType: 'blob' });
  }
}
