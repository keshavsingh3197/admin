import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContactInboxSummary, ContactStatus, ContactSubmission } from '../models/contact.models';

/**
 * The portfolio contact-form inbox. Reads are admin-only server-side; the public submit endpoint that
 * feeds this lives at the same API (`POST /api/contact`) and is called by the portfolio, not from here.
 */
@Injectable({ providedIn: 'root' })
export class ContactInboxService {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/contact/admin`;

  list(status?: ContactStatus): Observable<ContactSubmission[]> {
    const q = status ? `?status=${status}` : '';
    return this.http.get<ContactSubmission[]>(`${this.base}${q}`);
  }

  summary(): Observable<ContactInboxSummary> {
    return this.http.get<ContactInboxSummary>(`${this.base}/summary`);
  }

  /** Opening a submission marks it read server-side. */
  open(id: string): Observable<ContactSubmission> {
    return this.http.get<ContactSubmission>(`${this.base}/${id}`);
  }

  reply(id: string, body: string): Observable<ContactSubmission> {
    return this.http.post<ContactSubmission>(`${this.base}/${id}/reply`, { body });
  }

  markReplySent(id: string, index: number): Observable<ContactSubmission> {
    return this.http.post<ContactSubmission>(`${this.base}/${id}/replies/${index}/sent`, {});
  }

  setStatus(id: string, status: ContactStatus): Observable<void> {
    return this.http.post<void>(`${this.base}/${id}/status`, { status });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
