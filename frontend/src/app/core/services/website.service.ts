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

  list(siteKey?: string, locale?: string): Observable<WebsiteContentView[]> {
    const params: Record<string, string> = {};
    if (siteKey) params['siteKey'] = siteKey;
    if (locale) params['locale'] = locale;
    return this.http.get<WebsiteContentView[]>(this.baseUrl, { params });
  }

  upsert(request: UpsertWebsiteContentRequest): Observable<WebsiteContentView> {
    return this.http.put<WebsiteContentView>(this.baseUrl, request);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(id)}`);
  }

  /**
   * Where a site reads this entry from once it is published — shown in the UI so it can be copied.
   * The `locale` query selects the language; a key with no row for it falls back down the locale's
   * chain server-side.
   */
  publicUrl(siteKey: string, contentKey: string, locale?: string): string {
    const query = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return `${this.baseUrl}/public/${encodeURIComponent(siteKey)}/${encodeURIComponent(contentKey)}${query}`;
  }
}
