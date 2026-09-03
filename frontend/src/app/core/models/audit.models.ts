/** One row of the audit trail. Mirrors `Admin.Api.Dtos.AuditEntryView`. */
export interface AuditEntry {
  id: string;
  event: string;
  success: boolean;
  /** The acting operator's email, or "(anonymous)" for a pre-login event. */
  actor: string;
  actorUserId?: string | null;
  /** What was acted on, when that differs from the actor. Null for authentication events. */
  target?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp: string;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  skip: number;
  take: number;
}

export interface AuditQuery {
  event?: string;
  q?: string;
  success?: boolean;
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
}
