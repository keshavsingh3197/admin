/** A purgeable time-series data domain, as returned by GET /api/data-retention/overview. */
export interface DataDomainOverview {
  key: string;
  label: string;
  description: string;
  totalCount: number;
  oldestUtc: string | null;
  newestUtc: string | null;
  retentionDays: number;
}

export interface PurgeRangeRequest {
  domain: string;
  fromUtc: string;
  toUtc: string;
}

export interface PurgeResult {
  deletedCount: number;
}
