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
  emailOtpMinutes: number;
  maxFailedLoginAttempts: number;
  lockoutMinutes: number;
  backupCodeCount: number;
  updatedAt: string;
}

export type UpdateSettingsRequest = Partial<Omit<SettingsView, 'updatedAt'>>;
