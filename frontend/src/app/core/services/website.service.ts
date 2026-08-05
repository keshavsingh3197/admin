import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UpsertWebsiteContentRequest, WebsiteContentView } from '../models/website.models';

/**
 * Content served to the public sites (portfolio, blog, …) from this admin API. Each entry is a JSON
 * payload addressed by site + key, which the site fetches from the public endpoint once published.
 */
@Injectable({ providedIn: 'root' })
export class WebsiteContentService {
  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/website-content`;

  list(siteKey?: string): Observable<WebsiteContentView[]> {
    const query = siteKey ? `?siteKey=${encodeURIComponent(siteKey)}` : '';
    return this.http.get<WebsiteContentView[]>(`${this.baseUrl}${query}`);
  }

  upsert(request: UpsertWebsiteContentRequest): Observable<WebsiteContentView> {
    return this.http.put<WebsiteContentView>(this.baseUrl, request);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(id)}`);
  }

  /** Where a site reads this entry from once it is published — shown in the UI so it can be copied. */
  publicUrl(siteKey: string, contentKey: string): string {
    return `${this.baseUrl}/public/${encodeURIComponent(siteKey)}/${encodeURIComponent(contentKey)}`;
  }
}
