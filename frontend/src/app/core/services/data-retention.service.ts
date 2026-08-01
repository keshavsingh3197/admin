import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DataDomainOverview, PurgeRangeRequest, PurgeResult } from '../models/data-retention.models';

/** Client for manual, date-ranged data purging (/api/data-retention/*). */
@Injectable({ providedIn: 'root' })
export class DataRetentionService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  overview(): Observable<DataDomainOverview[]> {
    return this.http.get<DataDomainOverview[]>(`${this.base}/data-retention/overview`);
  }

  purgeRange(req: PurgeRangeRequest): Observable<PurgeResult> {
    return this.http.post<PurgeResult>(`${this.base}/data-retention/purge-range`, req);
  }

  purgeExpired(domain: string): Observable<PurgeResult> {
    return this.http.post<PurgeResult>(`${this.base}/data-retention/purge-expired/${domain}`, {});
  }
}
