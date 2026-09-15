
export interface FamDeviceCapabilities {
  locationTrackingEnabled: boolean;
  callShieldEnabled: boolean;
  smsSyncEnabled: boolean;
  contactsSyncEnabled: boolean;
}

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
  capabilities?: FamDeviceCapabilities;
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

export interface FamContact {
  id: string;
  userId: string;
  familyId: string;
  name: string;
  phoneNumber: string;
  email?: string;
  notes?: string;
  isFavorite?: boolean;
  syncedAt: string;
}

export interface FamCallRecord {
  id: string;
  userId: string;
  familyId: string;
  participantName: string;
  participantNumber: string;
  callType: 'Audio' | 'Video';
  direction: 'Incoming' | 'Outgoing' | 'Missed';
  durationSeconds: number;
  startedAt: string;
}

export interface FamChatMessage {
  id: string;
  userId: string;
  familyId: string;
  senderName: string;
  content: string;
  sentAt: string;
}

export interface FamAppVersionConfig {
  id?: string;
  latestVersion: string;
  latestVersionCode: number;
  minSupportedVersionCode: number;
  isUpdateMandatory: boolean;
  releaseNotes: string;
  playStoreUrl: string;
  updatedAt: string;
}

export interface UpdateAppVersionConfigRequest {
  latestVersion: string;
  latestVersionCode: number;
  minSupportedVersionCode: number;
  isUpdateMandatory: boolean;
  releaseNotes: string;
  playStoreUrl: string;
}


