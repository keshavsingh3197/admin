/** Auth-security settings as returned by GET /api/settings. Mirrors the backend SettingsView. */
export interface SettingsView {
  siteTitle: string;
  blogUrl: string;
  blogAdminUrl: string;
  emailTwoFactorEnabled: boolean;
  smsTwoFactorEnabled: boolean;
  whatsAppTwoFactorEnabled: boolean;
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
  storageProvider: string;            // 'Local' | 'S3'
  storageS3ServiceUrl: string;
  storageS3Bucket: string;
  storageS3AccessKeyId: string;
  storageS3SecretAccessKeySet: boolean;
  updatedAt: string;
}

/**
 * The *Set booleans are read-only (server tells us whether a secret is stored); write the secrets
 * via whatsAppAccessToken / storageS3SecretAccessKey instead — a blank value keeps the stored one.
 */
export type UpdateSettingsRequest =
  Partial<Omit<SettingsView, 'updatedAt' | 'whatsAppAccessTokenSet' | 'storageS3SecretAccessKeySet'>>
  & { whatsAppAccessToken?: string; storageS3SecretAccessKey?: string };

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
