import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FamilyDeviceService } from '../../core/services/family-device.service';
import { FamDevice, FamLocation, FamAuditLog, FamQrSession, MobileUserAccount } from '../../core/models/family-device.models';

@Component({
  selector: 'app-family-devices',
  imports: [FormsModule, DatePipe, DecimalPipe],
  templateUrl: './family-devices.component.html',
  styleUrl: './family-devices.component.css'
})
export class FamilyDevicesComponent implements OnInit {
  private readonly deviceService = inject(FamilyDeviceService);

  readonly devices = signal<FamDevice[]>([]);
  readonly selectedDevice = signal<FamDevice | null>(null);
  readonly locationHistory = signal<FamLocation[]>([]);
  readonly auditLogs = signal<FamAuditLog[]>([]);
  readonly activeTab = signal<'fleet' | 'history' | 'logs' | 'qr' | 'accounts'>('fleet');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Mobile account provisioning state (database-backed, zero hardcoded credentials)
  readonly mobileUsers = signal<MobileUserAccount[]>([]);
  readonly mobileUsersLoading = signal(false);
  newEmail = '';
  newUsername = '';
  newDisplayName = 'Google Play Reviewer';
  newPassword = '';
  readonly provisioningUser = signal(false);

  // Lost mode modal state
  readonly lostModalOpen = signal(false);
  readonly targetDeviceForLost = signal<FamDevice | null>(null);
  lostMessageInput = 'This phone belongs to our family. Please call the owner immediately!';

  // QR modal / state
  readonly generatedQr = signal<FamQrSession | null>(null);
  qrPayloadType = 'DevicePairing';
  qrExpirationMinutes = 30;

  readonly totalDevicesCount = computed(() => this.devices().length);
  readonly lostDevicesCount = computed(() => this.devices().filter(d => d.isLost).length);
  readonly onlineDevicesCount = computed(() => {
    const threshold = Date.now() - 15 * 60 * 1000; // 15 min
    return this.devices().filter(d => new Date(d.lastActiveAt).getTime() > threshold).length;
  });

  ngOnInit(): void {
    this.refreshAll();
  }

  refreshAll(): void {
    this.loading.set(true);
    this.error.set(null);

    this.deviceService.getDevices().subscribe({
      next: devs => {
        this.devices.set(devs);
        this.loading.set(false);
        if (!this.selectedDevice() && devs.length > 0) {
          this.selectDevice(devs[0]);
        }
      },
      error: err => {
        this.error.set('Failed to load family devices. ' + (err.error?.message || err.message));
        this.loading.set(false);
      }
    });

    this.deviceService.getAuditLogs(100).subscribe({
      next: logs => this.auditLogs.set(logs),
      error: () => {}
    });

    this.loadMobileUsers();
  }

  selectDevice(dev: FamDevice): void {
    this.selectedDevice.set(dev);
    this.loadHistory(dev.deviceId);
  }

  loadHistory(deviceId: string): void {
    this.deviceService.getDeviceHistory(deviceId, 48).subscribe({
      next: history => this.locationHistory.set(history),
      error: () => {}
    });
  }

  openLostModal(dev: FamDevice): void {
    this.targetDeviceForLost.set(dev);
    this.lostMessageInput = dev.lostMessage || 'This phone is reported LOST. Please call our family.';
    this.lostModalOpen.set(true);
  }

  closeLostModal(): void {
    this.lostModalOpen.set(false);
    this.targetDeviceForLost.set(null);
  }

  confirmLostMode(isLost: boolean): void {
    const dev = this.targetDeviceForLost();
    if (!dev) return;

    this.deviceService.setLostMode(dev.deviceId, {
      isLost,
      lostMessage: isLost ? this.lostMessageInput : undefined
    }).subscribe({
      next: updated => {
        this.devices.update(list => list.map(d => d.deviceId === updated.deviceId ? updated : d));
        if (this.selectedDevice()?.deviceId === updated.deviceId) {
          this.selectedDevice.set(updated);
        }
        this.closeLostModal();
        this.successMessage.set(isLost ? `Lost Mode activated for ${updated.deviceName}` : `Device ${updated.deviceName} marked found.`);
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: err => {
        this.error.set('Failed to update Lost Mode: ' + (err.error?.message || err.message));
      }
    });
  }

  generateQr(): void {
    this.deviceService.createQrSession({
      payloadType: this.qrPayloadType,
      payloadData: JSON.stringify({
        familyScope: 'FamilyCircle',
        timestamp: new Date().toISOString()
      }),
      expirationMinutes: this.qrExpirationMinutes
    }).subscribe({
      next: session => {
        this.generatedQr.set(session);
        this.activeTab.set('qr');
      },
      error: err => {
        this.error.set('Failed to create QR code: ' + (err.error?.message || err.message));
      }
    });
  }

  getGoogleMapsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  getOpenStreetMapUrl(lat: number, lng: number): string {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  }

  isRecentlyActive(lastActiveAt: string): boolean {
    const diffMs = Date.now() - new Date(lastActiveAt).getTime();
    return diffMs < 15 * 60 * 1000;
  }

  loadMobileUsers(): void {
    this.mobileUsersLoading.set(true);
    this.deviceService.getMobileUsers().subscribe({
      next: users => {
        this.mobileUsers.set(users);
        this.mobileUsersLoading.set(false);
      },
      error: err => {
        this.mobileUsersLoading.set(false);
      }
    });
  }

  provisionUser(): void {
    if (!this.newEmail || !this.newPassword) return;
    this.provisioningUser.set(true);
    this.error.set(null);
    this.deviceService.provisionMobileUser({
      email: this.newEmail.trim(),
      username: this.newUsername.trim() || undefined,
      displayName: this.newDisplayName.trim() || 'Mobile User',
      password: this.newPassword
    }).subscribe({
      next: user => {
        this.mobileUsers.update(list => [user, ...list]);
        this.provisioningUser.set(false);
        this.successMessage.set(`Mobile user ${user.email} provisioned in database with mobile-only privileges.`);
        this.newEmail = '';
        this.newUsername = '';
        this.newPassword = '';
        setTimeout(() => this.successMessage.set(null), 5000);
      },
      error: err => {
        this.error.set('Failed to provision mobile user: ' + (err.error?.error || err.message));
        this.provisioningUser.set(false);
      }
    });
  }

  deleteUser(user: MobileUserAccount): void {
    if (!confirm(`Are you sure you want to delete mobile account "${user.email}"? This will revoke mobile app access immediately.`)) {
      return;
    }
    this.deviceService.deleteMobileUser(user.id).subscribe({
      next: () => {
        this.mobileUsers.update(list => list.filter(u => u.id !== user.id));
        this.successMessage.set(`Account ${user.email} deleted and sessions revoked.`);
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: err => {
        this.error.set('Failed to delete mobile user: ' + (err.error?.error || err.message));
      }
    });
  }
}

