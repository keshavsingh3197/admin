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
  FamQrVerifyResult
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
}

