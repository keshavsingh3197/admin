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

export interface WebsiteTrafficRank {
  websiteKey: string;
  name: string;
  url: string;
  visits24h: number;
  uniqueVisitors24h: number;
  visits7d: number;
  uniqueVisitors7d: number;
}

export interface EcosystemPageMetric {
  websiteKey: string;
  path: string;
  visits: number;
}

export interface DailyTrafficPoint {
  date: string;
  visits: number;
  uniqueVisitors: number;
}

export interface EcosystemOverview {
  totalVisits24h: number;
  uniqueVisitors24h: number;
  totalVisits7d: number;
  uniqueVisitors7d: number;
  topWebsiteKey: string | null;
  topWebsiteName: string | null;
  websites: WebsiteTrafficRank[];
  topPages: EcosystemPageMetric[];
  topCountries: CountryMetric[];
  dailyTrend: DailyTrafficPoint[];
  generatedAtUtc: string;
}

export interface ServiceStatusItem {
  key: string;
  name: string;
  category: 'backend' | 'frontend';
  url: string;
  probeUrl: string;
  status: 'operational' | 'degraded' | 'down';
  httpStatus: number | null;
  latencyMs: number | null;
  note: string | null;
}

export interface EcosystemStatusReport {
  overallStatus: 'operational' | 'degraded' | 'outage';
  healthyCount: number;
  degradedCount: number;
  downCount: number;
  totalCount: number;
  checkedAtUtc: string;
  services: ServiceStatusItem[];
}
