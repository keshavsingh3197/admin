import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  FamDevice,
  FamLocation,
  FamAuditLog,
  FamQrSession,
  FamLostModeRequest,
  FamCreateQrRequest,
  FamQrVerifyResult,
  MobileUserAccount,
  ProvisionMobileUserRequest,
  FamContact,
  FamCallRecord,
  FamChatMessage,
  FamAppVersionConfig,
  UpdateAppVersionConfigRequest
} from '../models/family-device.models';

@Injectable({ providedIn: 'root' })
export class FamilyDeviceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/family`;

  getDevices(): Observable<FamDevice[]> {
    return this.http.get<FamDevice[]>(`${this.baseUrl}/device/list`);
  }

  getDeviceHistory(deviceId: string, hours = 24): Observable<FamLocation[]> {
    return this.http.get<FamLocation[]>(`${this.baseUrl}/device/${encodeURIComponent(deviceId)}/history?hours=${hours}`);
  }

  setLostMode(deviceId: string, req: FamLostModeRequest): Observable<FamDevice> {
    return this.http.post<FamDevice>(`${this.baseUrl}/device/${encodeURIComponent(deviceId)}/lost-mode`, req);
  }

  getAuditLogs(limit = 50): Observable<FamAuditLog[]> {
    return this.http.get<FamAuditLog[]>(`${this.baseUrl}/device/audit-logs?limit=${limit}`);
  }

  createQrSession(req: FamCreateQrRequest): Observable<FamQrSession> {
    return this.http.post<FamQrSession>(`${this.baseUrl}/qr/create`, req);
  }

  getMobileUsers(): Observable<MobileUserAccount[]> {
    return this.http.get<MobileUserAccount[]>(`${this.baseUrl}/admin/mobile-users`);
  }

  provisionMobileUser(req: ProvisionMobileUserRequest): Observable<MobileUserAccount> {
    return this.http.post<MobileUserAccount>(`${this.baseUrl}/admin/provision-mobile-user`, req);
  }

  deleteMobileUser(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/admin/mobile-users/${encodeURIComponent(userId)}`);
  }

  getContacts(): Observable<FamContact[]> {
    return this.http.get<FamContact[]>(`${this.baseUrl}/contacts/list`);
  }

  getCalls(limit = 50): Observable<FamCallRecord[]> {
    return this.http.get<FamCallRecord[]>(`${this.baseUrl}/calls/history?limit=${limit}`);
  }

  getChatMessages(limit = 50): Observable<FamChatMessage[]> {
    return this.http.get<FamChatMessage[]>(`${this.baseUrl}/chat/messages?limit=${limit}`);
  }

  getAppVersionConfig(): Observable<FamAppVersionConfig> {
    return this.http.get<FamAppVersionConfig>(`${this.baseUrl}/admin/app-version`);
  }

  updateAppVersionConfig(req: UpdateAppVersionConfigRequest): Observable<FamAppVersionConfig> {
    return this.http.post<FamAppVersionConfig>(`${this.baseUrl}/admin/app-version`, req);
  }
}

