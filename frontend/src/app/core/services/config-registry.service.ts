import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ConfigEntryView,
  ConfigImportResult,
  ConfigMeta,
  UpsertConfigEntryRequest,
} from '../models/config-registry.models';

/**
 * Admin client for the runtime config registry (`/api/app-config`) — the typed key/value store that
 * keeps URLs, icons, labels, limits and feature flags out of every app's build.
 *
 * Secret entries come back with `value: null` and only an `isSet` flag: the API never returns a
 * stored secret. Sending a non-empty value replaces it; sending nothing leaves it alone.
 */
@Injectable({ providedIn: 'root' })
export class ConfigRegistryService {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/app-config`;

  list(group?: string, search?: string): Observable<ConfigEntryView[]> {
    const params: Record<string, string> = {};
    if (group) params['group'] = group;
    if (search) params['search'] = search;
    return this.http.get<ConfigEntryView[]>(`${this.base}/entries`, { params });
  }

  groups(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/groups`);
  }

  /** The allow-lists the API enforces, so the UI's dropdowns aren't a second hard-coded copy. */
  meta(): Observable<ConfigMeta> {
    return this.http.get<ConfigMeta>(`${this.base}/meta`);
  }

  upsert(request: UpsertConfigEntryRequest): Observable<ConfigEntryView> {
    return this.http.put<ConfigEntryView>(`${this.base}/entries`, request);
  }

  bulkUpsert(items: UpsertConfigEntryRequest[]): Observable<ConfigImportResult> {
    return this.http.post<ConfigImportResult>(`${this.base}/entries/bulk`, { items });
  }

  remove(key: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/entries/${encodeURIComponent(key)}`);
  }

  export(): Observable<Blob> {
    return this.http.get(`${this.base}/export`, { responseType: 'blob' });
  }

  import(payload: unknown): Observable<ConfigImportResult> {
    return this.http.post<ConfigImportResult>(`${this.base}/import`, payload);
  }

  refresh(): Observable<{ version: string }> {
    return this.http.post<{ version: string }>(`${this.base}/refresh`, {});
  }
}
