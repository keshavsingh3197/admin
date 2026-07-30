export interface WebsiteOption {
  key: string;
  name: string;
  url: string;
}

export interface WebsiteStatus {
  isReachable: boolean;
  statusCode: number | null;
  responseMs: number | null;
  checkedAtUtc: string;
}

export interface WebsiteMetrics {
  totalUsers: number;
  activeUsers: number;
  activeSessions: number;
  totalNotes: number;
  successfulLoginsLast24h: number;
  failedLoginsLast24h: number;
  visitsLast24h: number;
  uniqueVisitorsLast24h: number;
}

export interface CountryMetric {
  country: string;
  visits: number;
}

export interface PageMetric {
  path: string;
  visits: number;
}

export interface VisitDetail {
  path: string;
  country: string;
  referrer: string | null;
  timestamp: string;
  visitorKey: string;
}

export interface WebsiteDetails {
  topCountries: CountryMetric[];
  topPages: PageMetric[];
  recentVisits: VisitDetail[];
}

export interface WebsiteDashboard {
  website: WebsiteOption;
  status: WebsiteStatus;
  metrics: WebsiteMetrics;
  details: WebsiteDetails;
}

export interface TrackVisitRequest {
  websiteKey: string;
  path?: string;
  referrer?: string;
}
