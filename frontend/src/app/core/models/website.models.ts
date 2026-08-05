/** Mirrors Admin.Api WebsiteContentDtos. */

export interface WebsiteContentView {
  id: string;
  siteKey: string;
  contentKey: string;
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
}
