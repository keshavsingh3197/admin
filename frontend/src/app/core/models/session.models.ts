export interface UserSession {
  id: string;
  appKey: string;
  deviceLabel?: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}