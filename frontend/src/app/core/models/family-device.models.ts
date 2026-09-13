export interface FamLocationSnapshot {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  address?: string;
  recordedAt: string;
}

export interface FamDevice {
  id: string;
  deviceId: string;
  familyId: string;
  userId: string;
  deviceName: string;
  brand: string;
  model: string;
  osName: string;
  osVersion: string;
  appVersion: string;
  batteryLevel: number;
  isCharging: boolean;
  isLost: boolean;
  lostMessage?: string;
  registeredAt: string;
  lastActiveAt: string;
  lastLocation?: FamLocationSnapshot;
}

export interface FamLocation {
  id: string;
  deviceId: string;
  familyId: string;
  userId: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  batteryLevel?: number;
  address?: string;
  isLostPing: boolean;
  recordedAt: string;
}

export interface FamAuditLog {
  id: string;
  deviceId?: string;
  familyId: string;
  userId: string;
  eventType: string;
  severity: 'Info' | 'Warning' | 'Critical';
  details: string;
  ipAddress?: string;
  timestamp: string;
}

export interface FamQrSession {
  id: string;
  sessionCode: string;
  payloadType: string;
  payloadData: string;
  familyId: string;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  isUsed: boolean;
  usedByDeviceId?: string;
}

export interface FamLostModeRequest {
  isLost: boolean;
  lostMessage?: string;
}

export interface FamCreateQrRequest {
  payloadType: string;
  payloadData: string;
  expirationMinutes?: number;
}

export interface FamQrVerifyResult {
  success: boolean;
  message: string;
  payloadType?: string;
  payloadData?: string;
}

export interface MobileUserAccount {
  id: string;
  email: string;
  username?: string;
  displayName: string;
  roles: string[];
  isActive: boolean;
  createdAt: string;
}

export interface ProvisionMobileUserRequest {
  email: string;
  username?: string;
  displayName: string;
  password: string;
}

