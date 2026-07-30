import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TrackVisitRequest, WebsiteDashboard, WebsiteOption } from '../models/analytics.models';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getWebsites(): Observable<WebsiteOption[]> {
    return this.http.get<WebsiteOption[]>(`${this.baseUrl}/analytics/websites`);
  }

  getDashboard(websiteKey: string): Observable<WebsiteDashboard> {
    return this.http.get<WebsiteDashboard>(`${this.baseUrl}/analytics/dashboard/${encodeURIComponent(websiteKey)}`);
  }

  trackVisit(req: TrackVisitRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/analytics/visit`, req);
  }
}
