import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SettingsView, UpdateSettingsRequest, UpsertWebsiteLinkRequest, WebsiteLinkView } from '../models/settings.models';

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

  listWebsites(): Observable<WebsiteLinkView[]> {
    return this.http.get<WebsiteLinkView[]>(`${this.base}/settings/websites`);
  }

  createWebsite(req: UpsertWebsiteLinkRequest): Observable<WebsiteLinkView> {
    return this.http.post<WebsiteLinkView>(`${this.base}/settings/websites`, req);
  }

  updateWebsite(id: string, req: UpsertWebsiteLinkRequest): Observable<WebsiteLinkView> {
    return this.http.put<WebsiteLinkView>(`${this.base}/settings/websites/${encodeURIComponent(id)}`, req);
  }

  deleteWebsite(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/settings/websites/${encodeURIComponent(id)}`);
  }
}
