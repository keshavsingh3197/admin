import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuditPage, AuditQuery } from '../models/audit.models';

/** Read-only client for the audit trail (/api/audit). There is deliberately no write method. */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(query: AuditQuery): Observable<AuditPage> {
    let params = new HttpParams();
    // Only send the filters that are actually set — an empty string would otherwise be matched
    // against as a real (and always-failing) filter value.
    if (query.event) params = params.set('event', query.event);
    if (query.q) params = params.set('q', query.q);
    if (query.success !== undefined) params = params.set('success', String(query.success));
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    params = params.set('skip', String(query.skip ?? 0)).set('take', String(query.take ?? 50));

    return this.http.get<AuditPage>(`${this.base}/audit`, { params });
  }

  events(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/audit/events`);
  }
}
