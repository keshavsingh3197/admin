import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HealthReport } from '../models/health.models';
import { EcosystemStatusReport } from '../models/analytics.models';

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  checks(): Observable<HealthReport> {
    return this.http.get<HealthReport>(`${this.baseUrl}/health/checks`);
  }

  ecosystemStatus(refresh = false): Observable<EcosystemStatusReport> {
    return this.http.get<EcosystemStatusReport>(`${this.baseUrl}/status${refresh ? '?refresh=true' : ''}`);
  }
}
