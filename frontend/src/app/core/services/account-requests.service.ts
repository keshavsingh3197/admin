import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AccountRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface AccountRequest {
  id: string;
  email: string;
  displayName: string;
  reason: string | null;
  status: AccountRequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  createdUserId: string | null;
}

export interface AccountRequestSummary {
  pending: number;
  total: number;
}

export interface AccountRequestSubmitResult {
  received: boolean;
  message: string;
}

/**
 * "Request an account", and the queue an admin decides it from.
 *
 * {@link submit} is the only anonymous call here — it takes no session and creates nothing anyone
 * can sign in with. Everything else is admin-only and goes through the usual bearer interceptor.
 */
@Injectable({ providedIn: 'root' })
export class AccountRequestsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/account-requests`;

  /** Public sign-up form. The result is deliberately the same whatever the server found. */
  submit(payload: {
    email: string;
    displayName: string;
    password: string;
    reason?: string;
  }): Observable<AccountRequestSubmitResult> {
    return this.http.post<AccountRequestSubmitResult>(this.base, payload);
  }

  list(status?: AccountRequestStatus): Observable<AccountRequest[]> {
    const params: Record<string, string> = status ? { status } : {};
    return this.http.get<AccountRequest[]>(`${this.base}/admin`, { params });
  }

  summary(): Observable<AccountRequestSummary> {
    return this.http.get<AccountRequestSummary>(`${this.base}/admin/summary`);
  }

  approve(id: string, roles?: string[], note?: string): Observable<void> {
    return this.http.post<void>(`${this.base}/admin/${id}/approve`, {
      roles: roles ?? null,
      note: note ?? null,
    });
  }

  reject(id: string, note?: string): Observable<void> {
    return this.http.post<void>(`${this.base}/admin/${id}/reject`, { note: note ?? null });
  }
}
