/** Auth-security settings as returned by GET /api/settings. Mirrors the backend SettingsView. */
export interface SettingsView {
  siteTitle: string;
  blogUrl: string;
  blogAdminUrl: string;
  emailTwoFactorEnabled: boolean;
  smsTwoFactorEnabled: boolean;
  accessTokenMinutes: number;
  refreshTokenDays: number;
  twoFactorTokenMinutes: number;
  enforceSingleSessionPerUser: boolean;
  refreshTokenRetentionDays: number;
  analyticsRetentionDays: number;
  loginAuditRetentionDays: number;
  emailOtpMinutes: number;
  maxFailedLoginAttempts: number;
  lockoutMinutes: number;
  backupCodeCount: number;
  whatsAppAlertsEnabled: boolean;
  whatsAppAccessTokenSet: boolean;
  whatsAppPhoneNumberId: string;
  whatsAppAlertToNumber: string;
  updatedAt: string;
}

/** whatsAppAccessTokenSet is read-only (server tells us if a token is stored); write via whatsAppAccessToken instead. */
export type UpdateSettingsRequest = Partial<Omit<SettingsView, 'updatedAt' | 'whatsAppAccessTokenSet'>> & { whatsAppAccessToken?: string };

export interface WebsiteLinkView {
  id: string;
  key: string;
  name: string;
  url: string;
  isEnabled: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface UpsertWebsiteLinkRequest {
  key: string;
  name: string;
  url: string;
  isEnabled: boolean;
  sortOrder: number;
}
