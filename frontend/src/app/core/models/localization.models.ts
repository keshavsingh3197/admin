/**
 * The editorial (admin-only) shapes of KeshavSingh.Localization's `/api/i18n/admin/**` surface.
 *
 * The PUBLIC wire shapes — `PublicLocale`, `TranslationBundle`, `LocalizationManifest` — live in
 * `@keshavsingh3197/web-config`, shared with the blog and the portfolio so the three cannot drift, and are
 * re-exported here because that is where this app looks for them.
 */
export type { LocalizationManifest, PublicLocale, TranslationBundle } from '@keshavsingh3197/web-config';

/** Admin view of a language, including the fields a visitor never sees. */
export interface LocaleView {
  code: string;
  englishName: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  icon: string;
  isDefault: boolean;
  isEnabled: boolean;
  fallbackCode: string;
  sortOrder: number;
  dateFormat: string;
  numberFormat: string;
  currencyCode: string;
  translatedCount: number;
  updatedAt: string;
}

export interface UpsertLocaleRequest {
  code: string;
  englishName: string;
  nativeName: string;
  direction?: string;
  icon?: string;
  isDefault?: boolean;
  isEnabled?: boolean;
  fallbackCode?: string;
  sortOrder?: number;
  dateFormat?: string;
  numberFormat?: string;
  currencyCode?: string;
}

export interface TranslationView {
  id: string;
  locale: string;
  namespace: string;
  key: string;
  value: string;
  /** On the side-by-side editor rows this carries the DEFAULT locale's text (the source). */
  notes: string;
  needsReview: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface TranslationPageView {
  items: TranslationView[];
  total: number;
  skip: number;
  take: number;
}

export interface UpsertTranslationRequest {
  locale: string;
  namespace: string;
  key: string;
  value: string;
  notes?: string;
  needsReview?: boolean;
}

export interface LocalizationCoverage {
  locale: string;
  totalKeys: number;
  translatedKeys: number;
  missingKeys: number;
  needsReviewKeys: number;
}

/** `nested` is export-only: on import the JSON parser accepts flat or nested alike. */
export type ImportFormat = 'json' | 'csv' | 'xlsx';
export type ImportMode = 'merge' | 'replace';
export type ExportFormat = 'json' | 'nested' | 'csv' | 'xlsx';

/** For a pasted JSON/CSV payload. A spreadsheet goes through the file-upload endpoint instead. */
export interface ImportTranslationsRequest {
  locale: string;
  format?: ImportFormat;
  mode?: ImportMode;
  namespace?: string;
  markNeedsReview?: boolean;
  payload: string;
}

export interface ImportTranslationsResult {
  locale: string;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
  version: string;
}
