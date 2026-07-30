import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SettingsView, UpdateSettingsRequest } from '../models/settings.models';

/** Client for the identity provider's runtime auth-security settings (/api/settings). */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get(): Observable<SettingsView> {
    return this.http.get<SettingsView>(`${this.base}/settings`);
  }

  update(req: UpdateSettingsRequest): Observable<SettingsView> {
    return this.http.put<SettingsView>(`${this.base}/settings`, req);
  }
}
