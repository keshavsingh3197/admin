export type HealthStatus = 'ok' | 'warning' | 'error';

export interface HealthCheck {
  key: string;
  category: string;
  label: string;
  status: HealthStatus;
  message: string;
  checkedAtUtc: string;
  durationMs?: number | null;
  actionRoute?: string | null;
}

export interface HealthReport {
  checks: HealthCheck[];
  okCount: number;
  warningCount: number;
  errorCount: number;
  generatedAtUtc: string;
}
