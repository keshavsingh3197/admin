/** Mirrors Admin.Api WebsiteContentDtos. */

export interface WebsiteContentView {
  id: string;
  siteKey: string;
  contentKey: string;
  /** Content is one row per language for the same site + key. */
  locale: string;
  payloadJson: string;
  isPublished: boolean;
  version: number;
  updatedAt: string;
}

export interface UpsertWebsiteContentRequest {
  siteKey: string;
  contentKey: string;
  payloadJson: string;
  isPublished: boolean;
  /** Omit for the default language — the API resolves it, so this stays valid if the default changes. */
  locale?: string;
}
