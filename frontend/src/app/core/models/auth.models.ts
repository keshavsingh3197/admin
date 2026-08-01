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
  whatsAppFallbackAvailable: boolean;
  session?: SsoSessionResponse;
}

export type TwoFactorMethod = 'Totp' | 'Email' | 'BackupCode' | 'Sms' | 'WhatsApp';

export interface EnrollStartResponse {
  secret: string;
  otpAuthUri: string;
  qrCodePngDataUrl: string;
}

/** A registered passkey as shown on the security screen. No key material is exposed. */
export interface PasskeyListItem {
  id: string;
  name?: string | null;
  isBackedUp: boolean;
  transports: string[];
  createdAt: string;
  lastUsedAt?: string | null;
  createdFromOrigin?: string | null;
  createdFromDevice?: string | null;
}

export interface PasskeyCapabilities {
  maxDevices: number;
  registeredDevices: number;
}

export interface TwoFactorDevice {
  id: string;
  name: string;
  deviceType: string;
  createdFromOrigin?: string | null;
  createdFromDevice?: string | null;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface TwoFactorDeviceCapabilities {
  maxDevices: number;
  registeredDevices: number;
  twoFactorEnabled: boolean;
}

export interface StartTwoFactorDeviceEnrollmentResponse {
  secret: string;
  otpAuthUri: string;
  qrCodePngDataUrl: string;
  alreadyEnabled: boolean;
}

export interface ConfirmTwoFactorDeviceEnrollmentResponse {
  device: TwoFactorDevice;
  backupCodes?: string[] | null;
  twoFactorEnabled: boolean;
}

/** Begin-ceremony envelope: an opaque handle plus the raw WebAuthn options for the browser. */
export interface PasskeyBeginResponse {
  handle: string;
  options: Record<string, unknown>;
}
