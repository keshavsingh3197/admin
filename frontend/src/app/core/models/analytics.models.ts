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
}

export interface WebsiteDashboard {
  website: WebsiteOption;
  status: WebsiteStatus;
  metrics: WebsiteMetrics;
}
