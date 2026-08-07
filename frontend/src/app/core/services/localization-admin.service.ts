import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ExportFormat,
  ImportMode,
  ImportTranslationsRequest,
  ImportTranslationsResult,
  LocaleView,
  LocalizationCoverage,
  LocalizationManifest,
  TranslationPageView,
  UpsertLocaleRequest,
  UpsertTranslationRequest,
} from '../models/localization.models';

/**
 * Editorial client for the localisation catalogue (`/api/i18n/admin/*`): languages, the translation
 * grid, bulk save, import/export and the cache refresh. Read-side rendering goes through
 * {@link I18nService} instead — this service is only for managing the catalogue.
 */
@Injectable({ providedIn: 'root' })
export class LocalizationAdminService {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/i18n`;

  // ---- Languages ----

  listLocales(): Observable<LocaleView[]> {
    return this.http.get<LocaleView[]>(`${this.base}/admin/locales`);
  }

  upsertLocale(request: UpsertLocaleRequest): Observable<LocaleView> {
    return this.http.put<LocaleView>(`${this.base}/admin/locales`, request);
  }

  deleteLocale(code: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/locales/${encodeURIComponent(code)}`);
  }

  // ---- Translations ----

  /** The raw grid: one row per stored string. */
  listEntries(filter: {
    locale?: string;
    ns?: string;
    search?: string;
    missingOnly?: boolean;
    needsReviewOnly?: boolean;
    skip?: number;
    take?: number;
  }): Observable<TranslationPageView> {
    return this.http.get<TranslationPageView>(`${this.base}/admin/entries`, {
      params: this.params(filter),
    });
  }

  /**
   * The side-by-side editor's rows: every key known in the default locale paired with this locale's
   * value. `notes` on each row carries the source text.
   */
  listForTranslating(
    locale: string,
    filter: { ns?: string; search?: string; missingOnly?: boolean; skip?: number; take?: number },
  ): Observable<TranslationPageView> {
    return this.http.get<TranslationPageView>(`${this.base}/admin/translate/${encodeURIComponent(locale)}`, {
      params: this.params(filter),
    });
  }

  listNamespaces(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/admin/namespaces`);
  }

  coverage(): Observable<LocalizationCoverage[]> {
    return this.http.get<LocalizationCoverage[]>(`${this.base}/admin/coverage`);
  }

  saveEntry(request: UpsertTranslationRequest): Observable<unknown> {
    return this.http.put(`${this.base}/admin/entries`, request);
  }

  /** Saves a page of edits in one round trip. */
  saveEntries(items: UpsertTranslationRequest[]): Observable<ImportTranslationsResult> {
    return this.http.post<ImportTranslationsResult>(`${this.base}/admin/entries/bulk`, { items });
  }

  deleteEntry(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/entries/${encodeURIComponent(id)}`);
  }

  /** Retires a key from every language at once. */
  deleteKey(ns: string, key: string): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(
      `${this.base}/admin/keys/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`,
    );
  }

  // ---- Import / export / refresh ----

  /** A pasted JSON or CSV payload. */
  import(request: ImportTranslationsRequest): Observable<ImportTranslationsResult> {
    return this.http.post<ImportTranslationsResult>(`${this.base}/admin/import`, request);
  }

  /**
   * Uploads a `.json`, `.csv` or `.xlsx` file. The API infers the format from the filename, so a
   * translator's spreadsheet needs no extra choices — this is the only path that can carry `.xlsx`,
   * which is binary and cannot travel in a JSON body.
   */
  importFile(
    file: File,
    options: { locale: string; mode?: ImportMode; namespace?: string; markNeedsReview?: boolean },
  ): Observable<ImportTranslationsResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('locale', options.locale);
    if (options.mode) form.append('mode', options.mode);
    if (options.namespace) form.append('ns', options.namespace);
    form.append('markNeedsReview', String(options.markNeedsReview ?? false));
    // No Content-Type header: the browser must set the multipart boundary itself.
    return this.http.post<ImportTranslationsResult>(`${this.base}/admin/import/file`, form);
  }

  /** Downloads as a blob so the browser can save it with the filename the API sets. */
  export(locale: string, format: ExportFormat, ns?: string): Observable<Blob> {
    const params: Record<string, string> = { locale, format };
    if (ns) params['ns'] = ns;
    return this.http.get(`${this.base}/admin/export`, { params, responseType: 'blob' });
  }

  refresh(): Observable<LocalizationManifest> {
    return this.http.post<LocalizationManifest>(`${this.base}/admin/refresh`, {});
  }

  private params(filter: Record<string, unknown>): Record<string, string> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined || value === null || value === '') continue;
      params[key] = String(value);
    }
    return params;
  }
}
