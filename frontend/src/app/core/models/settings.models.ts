export interface AiProviderKeyStatusView {
  providerId: string;
  label: string;
  capability: string;
  hint: string;
  keyUrl: string;
  keySet: boolean;
  maskedKey: string;
}

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
  youTubeApiKeySet: boolean;
  youTubeApiKeyMasked: string;
  googleOAuthClientId: string;
  googleOAuthClientSecretSet: boolean;
  googleOAuthClientSecretMasked: string;
  adSenseClientId: string;
  jamendoClientIdSet: boolean;
  jamendoClientIdMasked: string;
  aiProviderKeys: AiProviderKeyStatusView[];
  updatedAt: string;
}

/**
 * The *Set booleans are read-only (server tells us whether a secret is stored); write the secrets
 * via storageS3SecretAccessKey or the other secret inputs — a blank value keeps the stored one.
 */
export type UpdateSettingsRequest =
  Partial<Omit<SettingsView,
    'updatedAt' | 'oAuthCallbackUrl' | 'storageS3SecretAccessKeySet' | 'gitHubPackagesTokenSet' |
    'gitHubOAuthClientSecretSet' | 'linkedInOAuthClientSecretSet' |
    'youTubeApiKeySet' | 'youTubeApiKeyMasked' | 'googleOAuthClientSecretSet' | 'googleOAuthClientSecretMasked' |
    'jamendoClientIdSet' | 'jamendoClientIdMasked' | 'aiProviderKeys'>>
  & {
    storageS3SecretAccessKey?: string;
    gitHubPackagesToken?: string;
    gitHubOAuthClientSecret?: string;
    linkedInOAuthClientSecret?: string;
    youTubeApiKey?: string;
    clearYouTubeApiKey?: boolean;
    googleOAuthClientId?: string;
    googleOAuthClientSecret?: string;
    clearGoogleOAuthClientSecret?: boolean;
    adSenseClientId?: string;
    jamendoClientId?: string;
    clearJamendoClientId?: boolean;
    aiProviderKeys?: Record<string, string>;
    clearAiProviderIds?: string[];
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
  icon?: string;
  description?: string;
  showInEcosystemBar?: boolean;
}

export interface UpsertWebsiteLinkRequest {
  key: string;
  name: string;
  url: string;
  isEnabled: boolean;
  sortOrder: number;
  icon?: string;
  description?: string;
  showInEcosystemBar?: boolean;
}

export interface ApplicationMetrics {
  userCount: number;
  roleCount: number;
  groupCount: number;
  activeSessionCount: number;
}

export interface CreatorChannelView {
  id: string;
  key: string;
  name: string;
  handle: string;
  platform: string;
  channelId: string;
  url: string;
  niche: string;
  tagline: string;
  description: string;
  engineName: string;
  visualsCredit: string;
  hashtags: string[];
  tags: string[];
  retiredHandles: string[];
  retiredUrls: string[];
  isPrimary: boolean;
  isEnabled: boolean;
  showInAnalytics: boolean;
  showInPanchang: boolean;
  showInStudio: boolean;
  showInFooter: boolean;
  sortOrder: number;
  updatedAt: string;
}

export type UpsertCreatorChannelRequest = Omit<CreatorChannelView, 'id' | 'updatedAt'>;

export interface ResolvedYouTubeChannelResponse {
  channelId: string;
  title: string;
  handle: string;
  url: string;
  description: string;
  feedUrl: string;
}
