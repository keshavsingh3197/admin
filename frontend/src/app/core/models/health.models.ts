export type HealthStatus = 'ok' | 'warning' | 'error';

export interface HealthCheck {
  key: string;
  category: string;
  label: string;
  status: HealthStatus;
  message: string;
  checkedAtUtc: string;
}

export interface HealthReport {
  checks: HealthCheck[];
  okCount: number;
  warningCount: number;
  errorCount: number;
  generatedAtUtc: string;
}
