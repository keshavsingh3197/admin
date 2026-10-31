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
  adminAuditRetentionDays: number;
  emailOtpMinutes: number;
  maxFailedLoginAttempts: number;
  lockoutMinutes: number;
  backupCodeCount: number;
  storageProvider: string;            // 'Local' | 'S3'
  storageS3ServiceUrl: string;
  storageS3Bucket: string;
  storageS3AccessKeyId: string;
  storageS3SecretAccessKeySet: boolean;
  gitHubPackagesTokenSet: boolean;
  /** Canonical origin every OAuth provider redirects back to; blank = use this request's own host. */
  oAuthCallbackBaseUrl: string;
  /** Read-only: the exact URL to register with GitHub/LinkedIn (blank until the base URL is set). */
  oAuthCallbackUrl: string;
  gitHubOAuthClientId: string;
  gitHubOAuthClientSecretSet: boolean;
  gitHubSocialLoginEnabled: boolean;
  linkedInSocialLoginEnabled: boolean;
  linkedInOAuthClientId: string;
  linkedInOAuthClientSecretSet: boolean;
  /** The only repositories the Packages screen scans — chosen here, stored server-side. */
  packageInventoryRepositories: string[];
  /** Exact browser origins permitted to complete passkey ceremonies. */
  webAuthnOrigins: string[];
  /** The WebAuthn RP ID loaded when the identity provider started. */
  webAuthnRelyingPartyId: string;
  /** True when the saved origins differ from the allow-list active in this process. */
  webAuthnOriginsPendingRestart: boolean;
  updatedAt: string;
}

/**
 * The *Set booleans are read-only (server tells us whether a secret is stored); write the secrets
 * via storageS3SecretAccessKey or the other secret inputs — a blank value keeps the stored one.
 */
export type UpdateSettingsRequest =
  Partial<Omit<SettingsView, 'updatedAt' | 'oAuthCallbackUrl' | 'storageS3SecretAccessKeySet' | 'gitHubPackagesTokenSet' | 'gitHubOAuthClientSecretSet' | 'linkedInOAuthClientSecretSet'>>
  & {
    storageS3SecretAccessKey?: string;
    gitHubPackagesToken?: string;
    gitHubOAuthClientSecret?: string;
    linkedInOAuthClientSecret?: string;
  };

export interface GitHubOAuthStartResponse {
  authorizeUrl: string;
}

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

export interface ApplicationMetrics {
  userCount: number;
  roleCount: number;
  groupCount: number;
  activeSessionCount: number;
}
