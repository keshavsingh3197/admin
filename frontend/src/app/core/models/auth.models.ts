// Auth types for the admin identity-provider UI. These mirror the /api/sso/* DTOs.

export type Role = 'Admin' | 'Editor' | 'Viewer';

export interface UserProfile {
  id: string;
  email: string;
  username?: string | null;
  displayName: string;
  roles: Role[];
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
}

/** Body returned once a session is established — the refresh token lives only in the SSO cookie. */
export interface SsoSessionResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: UserProfile;
}

/** Result of the password step: either a 2FA challenge or an established session. */
export interface SsoLoginResponse {
  twoFactorRequired: boolean;
  twoFactorToken?: string;
  emailFallbackAvailable: boolean;
  smsFallbackAvailable: boolean;
  session?: SsoSessionResponse;
}

export type TwoFactorMethod = 'Totp' | 'Email' | 'BackupCode' | 'Sms';

export interface EnrollStartResponse {
  secret: string;
  otpAuthUri: string;
  qrCodePngDataUrl: string;
}
