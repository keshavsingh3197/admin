import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { EnrollStartResponse, PasskeyListItem } from '../../core/models/auth.models';
import { createPasskey, createPasskeyErrorMessage, isPasskeySupported, ServerCredentialOptions } from '../../core/services/webauthn';

/**
 * Self-service account security for the signed-in identity: change password and manage the
 * authenticator (TOTP) second factor. Backed by the shared bearer surface (/api/auth/*), which
 * the admin backend already exposes — no new endpoints needed.
 */
@Component({
  selector: 'app-security',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="sec-wrap">
      <h1 class="page-title">Security &amp; 2FA</h1>

      <!-- Change password -->
      <section class="card">
        <h2>Change password</h2>
        @if (pwMessage()) { <div class="banner" [class.ok]="pwOk()">{{ pwMessage() }}</div> }
        <form (ngSubmit)="changePassword()">
          <label class="field"><span>Current password</span>
            <input class="input" type="password" name="cur" autocomplete="current-password"
                   [(ngModel)]="currentPassword" [disabled]="pwLoading()" required /></label>
          <label class="field"><span>New password (min 12 chars)</span>
            <input class="input" type="password" name="new" autocomplete="new-password"
                   [(ngModel)]="newPassword" [disabled]="pwLoading()" required /></label>
          <label class="field"><span>Confirm new password</span>
            <input class="input" type="password" name="conf" autocomplete="new-password"
                   [(ngModel)]="confirmPassword" [disabled]="pwLoading()" required /></label>
          <button class="btn-primary" type="submit"
                  [disabled]="pwLoading() || !currentPassword || newPassword.length < 12 || newPassword !== confirmPassword">
            {{ pwLoading() ? 'Saving…' : 'Update password' }}
          </button>
        </form>
      </section>

      <!-- Two-factor -->
      <section class="card">
        <h2>Two-factor authentication</h2>
        @if (twoFaMessage()) { <div class="banner" [class.ok]="twoFaOk()">{{ twoFaMessage() }}</div> }

        @if (backupCodes(); as codes) {
          <p class="ok-text">✅ Two-factor is enabled. Save these one-time backup codes now — they are shown once:</p>
          <ul class="codes">@for (c of codes; track c) { <li>{{ c }}</li> }</ul>
          <div class="code-actions">
            <button class="btn-secondary" type="button" (click)="copyCodes(codes)">
              {{ copied() ? 'Copied ✓' : 'Copy codes' }}
            </button>
            <button class="btn-secondary" type="button" (click)="downloadCodes(codes)">Download .txt</button>
          </div>
          <p class="hint">Store them in a password manager or print them. Each code works once if you lose your authenticator.</p>
        } @else if (enabled()) {
          <p>Authenticator app is <strong>enabled</strong> on your account.</p>
          <label class="field"><span>Confirm password to disable</span>
            <input class="input" type="password" name="dpw" autocomplete="current-password"
                   [(ngModel)]="disablePassword" [disabled]="twoFaLoading()" /></label>
          <button class="btn-danger" type="button" [disabled]="twoFaLoading() || !disablePassword" (click)="disable()">
            {{ twoFaLoading() ? 'Disabling…' : 'Disable 2FA' }}
          </button>
        } @else if (enroll(); as data) {
          <p>Scan this QR in your authenticator app, then enter the 6-digit code to confirm.</p>
          <img class="qr" [src]="data.qrCodePngDataUrl" alt="Authenticator QR code" />
          <p class="secret">Or enter the key manually: <code>{{ data.secret }}</code></p>
          <label class="field"><span>6-digit code</span>
            <input class="input" type="text" name="code" inputmode="numeric" autocomplete="one-time-code"
                   [(ngModel)]="enrollCode" [disabled]="twoFaLoading()" /></label>
          <button class="btn-primary" type="button" [disabled]="twoFaLoading() || !enrollCode" (click)="confirmEnroll()">
            {{ twoFaLoading() ? 'Confirming…' : 'Confirm &amp; enable' }}
          </button>
        } @else {
          <p>Add an authenticator app (TOTP) as a second factor for your account.</p>
          <button class="btn-primary" type="button" [disabled]="twoFaLoading()" (click)="startEnroll()">
            {{ twoFaLoading() ? 'Starting…' : 'Set up authenticator' }}
          </button>
        }
      </section>

      <!-- Passkeys -->
      <section class="card">
        <h2>Passkeys</h2>
        <p class="muted">Sign in with your fingerprint, face, or device PIN — no password or code to type.
          A passkey is tied to this device (or synced by your password manager) and can't be phished.</p>

        @if (passkeyMessage()) { <div class="banner" [class.ok]="passkeyOk()">{{ passkeyMessage() }}</div> }

        @if (passkeys().length) {
          <ul class="pk-list">
            @for (pk of passkeys(); track pk.id) {
              <li class="pk-row">
                <span class="pk-icon">🔑</span>
                <span class="pk-meta">
                  <strong>{{ pk.name || 'Passkey' }}</strong>
                  <small>Added {{ pk.createdAt | date:'mediumDate' }}@if (pk.lastUsedAt) { · last used {{ pk.lastUsedAt | date:'mediumDate' }} }@if (pk.isBackedUp) { · synced }</small>
                </span>
                @if (removingId() !== pk.id) {
                  <button class="btn-link" type="button" (click)="toggleDetails(pk)">
                    {{ expandedId() === pk.id ? 'Hide' : 'Details' }}
                  </button>
                  <button class="btn-link-danger" type="button" [disabled]="passkeyBusy()" (click)="startRemove(pk)">Remove</button>
                }
                @if (expandedId() === pk.id && removingId() !== pk.id) {
                  <dl class="pk-details">
                    <dt>Type</dt><dd>{{ deviceType(pk) }}</dd>
                    <dt>Sign-in sync</dt><dd>{{ pk.isBackedUp ? 'Synced across your devices' : 'This device only' }}</dd>
                    <dt>Transports</dt><dd>{{ pk.transports.length ? pk.transports.join(', ') : '—' }}</dd>
                    <dt>Added</dt><dd>{{ pk.createdAt | date:'medium' }}</dd>
                    <dt>Last used</dt><dd>{{ pk.lastUsedAt ? (pk.lastUsedAt | date:'medium') : 'Never' }}</dd>
                    <dt>Credential</dt><dd class="mono">{{ pk.id.slice(0, 10) }}…</dd>
                  </dl>
                }
                @if (removingId() === pk.id) {
                  <div class="pk-confirm">
                    <input class="input" type="password" name="rmpw" autocomplete="current-password"
                           placeholder="Confirm your password" [ngModelOptions]="{ standalone: true }"
                           [(ngModel)]="removePassword" [disabled]="passkeyBusy()" />
                    <button class="btn-danger-sm" type="button" [disabled]="passkeyBusy() || !removePassword" (click)="confirmRemove(pk)">
                      {{ passkeyBusy() ? 'Removing…' : 'Remove' }}
                    </button>
                    <button class="btn-link" type="button" [disabled]="passkeyBusy()" (click)="cancelRemove()">Cancel</button>
                  </div>
                }
              </li>
            }
          </ul>
        } @else if (passkeysLoaded()) {
          <p class="muted">No passkeys yet.</p>
        }

        @if (passkeySupported) {
          @if (passkeys().length >= maxPasskeys) {
            <p class="muted">You’ve reached the limit of {{ maxPasskeys }} passkeys. Remove one to add another.</p>
          } @else {
            <label class="field"><span>Name for this device (optional)</span>
              <input class="input" type="text" name="pkname" maxlength="60" placeholder="e.g. MacBook Touch ID"
                     [(ngModel)]="newPasskeyName" [disabled]="passkeyBusy()" /></label>
            <button class="btn-primary" type="button" [disabled]="passkeyBusy()" (click)="addPasskey()">
              {{ passkeyBusy() ? 'Waiting for device…' : 'Add a passkey' }}
            </button>
          }
        } @else {
          <p class="muted">This browser doesn’t support passkeys.</p>
        }
      </section>
    </div>
  `,
  styles: [`
    .sec-wrap { max-width: 560px; margin: 0 auto; padding: 1rem; }
    .page-title { font-size: 1.5rem; margin: 0 0 1rem; }
    .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.25rem; }
    .card h2 { font-size: 1.1rem; margin: 0 0 1rem; }
    .field { display: block; margin-bottom: 1rem; }
    .field span { display: block; margin-bottom: 0.35rem; font-size: 0.85rem; color: #444; }
    .input { width: 100%; padding: 0.6rem 0.75rem; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; }
    .input:focus { outline: none; border-color: #1a73e8; box-shadow: 0 0 0 2px #e8f0fe; }
    .btn-primary { padding: 0.6rem 1.1rem; background: #1a73e8; color: #fff; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
    .btn-primary:hover:not(:disabled) { background: #1663c7; }
    .btn-primary:disabled, .btn-danger:disabled { opacity: 0.6; cursor: default; }
    .btn-danger { padding: 0.6rem 1.1rem; background: #d93025; color: #fff; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
    .btn-danger:hover:not(:disabled) { background: #b3271d; }
    .banner { background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c3; border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; font-size: 0.9rem; }
    .banner.ok { background: #e6f4ea; color: #137333; border-color: #b7e1c4; }
    .ok-text { color: #137333; }
    .qr { display: block; width: 200px; height: 200px; margin: 0.5rem 0; border: 1px solid #eee; border-radius: 6px; }
    .secret code { background: #f1f3f4; padding: 0.15rem 0.4rem; border-radius: 4px; }
    .codes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem; list-style: none; padding: 0; margin: 0.75rem 0; }
    .codes li { font-family: monospace; background: #f1f3f4; padding: 0.4rem 0.6rem; border-radius: 4px; text-align: center; }
    .code-actions { display: flex; gap: 0.5rem; margin: 0.75rem 0 0.5rem; }
    .btn-secondary { padding: 0.5rem 0.9rem; background: #fff; color: #1a73e8; border: 1px solid #1a73e8; border-radius: 6px; font-size: 0.9rem; cursor: pointer; }
    .btn-secondary:hover { background: #e8f0fe; }
    .hint { font-size: 0.8rem; color: #666; margin: 0.25rem 0 0; }
    .muted { color: #666; font-size: 0.9rem; }
    .pk-list { list-style: none; padding: 0; margin: 0 0 1rem; }
    .pk-row { display: flex; align-items: center; flex-wrap: wrap; gap: 0.6rem; padding: 0.6rem 0; border-bottom: 1px solid #f0f0f0; }
    .pk-icon { font-size: 1.2rem; }
    .pk-meta { display: flex; flex-direction: column; flex: 1; }
    .pk-meta small { color: #777; font-size: 0.78rem; }
    .btn-link-danger { background: none; border: none; color: #d93025; cursor: pointer; font-size: 0.85rem; padding: 0.25rem 0.4rem; }
    .btn-link-danger:hover:not(:disabled) { text-decoration: underline; }
    .btn-link-danger:disabled { opacity: 0.5; cursor: default; }
    .pk-confirm { flex-basis: 100%; display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
    .pk-confirm .input { flex: 1; padding: 0.45rem 0.6rem; font-size: 0.9rem; }
    .btn-danger-sm { padding: 0.45rem 0.8rem; background: #d93025; color: #fff; border: none; border-radius: 6px; font-size: 0.85rem; cursor: pointer; white-space: nowrap; }
    .btn-danger-sm:hover:not(:disabled) { background: #b3271d; }
    .btn-danger-sm:disabled { opacity: 0.6; cursor: default; }
    .btn-link { background: none; border: none; color: #666; cursor: pointer; font-size: 0.85rem; padding: 0.25rem 0.4rem; }
    .btn-link:hover:not(:disabled) { text-decoration: underline; }
    .pk-details { flex-basis: 100%; display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem;
      margin: 0.5rem 0 0.25rem; padding: 0.6rem 0.75rem; background: #f8f9fa; border-radius: 6px; }
    .pk-details dt { color: #777; font-size: 0.78rem; }
    .pk-details dd { margin: 0; font-size: 0.82rem; color: #333; }
    .pk-details dd.mono { font-family: monospace; }
  `]
})
export class SecurityComponent implements OnInit {
  private auth = inject(AuthService);

  readonly enabled = computed(() => !!this.auth.user()?.twoFactorEnabled);

  ngOnInit(): void {
    this.loadPasskeys();
  }

  // Change password
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  readonly pwLoading = signal(false);
  readonly pwMessage = signal<string | null>(null);
  readonly pwOk = signal(false);

  // Two-factor
  readonly enroll = signal<EnrollStartResponse | null>(null);
  enrollCode = '';
  disablePassword = '';
  readonly backupCodes = signal<string[] | null>(null);
  readonly copied = signal(false);
  readonly twoFaLoading = signal(false);
  readonly twoFaMessage = signal<string | null>(null);
  readonly twoFaOk = signal(false);

  changePassword(): void {
    if (this.newPassword !== this.confirmPassword || this.newPassword.length < 12) return;
    this.pwLoading.set(true);
    this.pwMessage.set(null);
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.pwLoading.set(false);
        this.pwOk.set(true);
        this.pwMessage.set('Password updated.');
        this.currentPassword = this.newPassword = this.confirmPassword = '';
      },
      error: (err: HttpErrorResponse) => {
        this.pwLoading.set(false);
        this.pwOk.set(false);
        this.pwMessage.set(this.messageFrom(err, 'Could not change password.'));
      },
    });
  }

  startEnroll(): void {
    this.twoFaLoading.set(true);
    this.twoFaMessage.set(null);
    this.auth.enrollStart().subscribe({
      next: data => { this.twoFaLoading.set(false); this.enroll.set(data); },
      error: (err: HttpErrorResponse) => { this.twoFaLoading.set(false); this.setTwoFaError(err, 'Could not start enrollment.'); },
    });
  }

  confirmEnroll(): void {
    if (!this.enrollCode) return;
    this.twoFaLoading.set(true);
    this.twoFaMessage.set(null);
    this.auth.enrollConfirm(this.enrollCode.trim()).subscribe({
      next: res => {
        this.twoFaLoading.set(false);
        this.enroll.set(null);
        this.enrollCode = '';
        this.backupCodes.set(res.backupCodes);
        this.twoFaOk.set(true);
        this.twoFaMessage.set('Two-factor enabled.');
      },
      error: (err: HttpErrorResponse) => { this.twoFaLoading.set(false); this.setTwoFaError(err, 'The code did not match.'); },
    });
  }

  disable(): void {
    if (!this.disablePassword) return;
    this.twoFaLoading.set(true);
    this.twoFaMessage.set(null);
    this.auth.disableTwoFactor(this.disablePassword).subscribe({
      next: () => {
        this.twoFaLoading.set(false);
        this.disablePassword = '';
        this.backupCodes.set(null);
        this.twoFaOk.set(true);
        this.twoFaMessage.set('Two-factor disabled.');
      },
      error: (err: HttpErrorResponse) => { this.twoFaLoading.set(false); this.setTwoFaError(err, 'Could not disable 2FA.'); },
    });
  }

  /** Copy the one-time backup codes to the clipboard, newline-separated. */
  copyCodes(codes: string[]): void {
    navigator.clipboard?.writeText(codes.join('\n')).then(
      () => { this.copied.set(true); setTimeout(() => this.copied.set(false), 2000); },
      () => { this.copied.set(false); },
    );
  }

  /** Download the backup codes as a plain-text file the user keeps offline. */
  downloadCodes(codes: string[]): void {
    const account = this.auth.user()?.email ?? this.auth.user()?.username ?? 'your account';
    const body = `Two-factor backup codes for ${account}\n`
      + `Each code can be used once if you lose access to your authenticator app.\n\n`
      + codes.join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'keshavsingh-2fa-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  private setTwoFaError(err: HttpErrorResponse, fallback: string): void {
    this.twoFaOk.set(false);
    this.twoFaMessage.set(this.messageFrom(err, fallback));
  }

  // ---- Passkeys ----

  readonly passkeySupported = isPasskeySupported();
  /** UX gate only — the backend (WebAuthn:MaxCredentialsPerUser) is the real limit. */
  readonly maxPasskeys = 5;
  readonly passkeys = signal<PasskeyListItem[]>([]);
  readonly passkeysLoaded = signal(false);
  readonly passkeyBusy = signal(false);
  readonly passkeyMessage = signal<string | null>(null);
  readonly passkeyOk = signal(false);
  newPasskeyName = '';
  /** Id of the passkey currently awaiting a step-up password confirmation, if any. */
  readonly removingId = signal<string | null>(null);
  removePassword = '';
  /** Id of the passkey whose details are expanded, if any. */
  readonly expandedId = signal<string | null>(null);

  toggleDetails(pk: PasskeyListItem): void {
    this.expandedId.update(id => (id === pk.id ? null : pk.id));
  }

  /** A friendly device label derived from the credential's transports. */
  deviceType(pk: PasskeyListItem): string {
    const t = pk.transports ?? [];
    if (t.includes('internal')) return 'This device (fingerprint / face / PIN)';
    if (t.includes('hybrid')) return 'Phone or tablet';
    if (t.includes('usb') || t.includes('nfc') || t.includes('ble')) return 'Security key';
    return 'Passkey';
  }

  loadPasskeys(): void {
    this.auth.passkeyList().subscribe({
      next: list => { this.passkeys.set(list); this.passkeysLoaded.set(true); },
      error: () => this.passkeysLoaded.set(true),
    });
  }

  /** Registers a new passkey on this device via a WebAuthn create() ceremony. */
  async addPasskey(): Promise<void> {
    this.passkeyBusy.set(true);
    this.passkeyMessage.set(null);
    try {
      const begin = await firstValueFrom(this.auth.passkeyRegisterBegin());
      const attestation = await createPasskey(begin.options as unknown as ServerCredentialOptions);
      const created = await firstValueFrom(
        this.auth.passkeyRegisterComplete(begin.handle, this.newPasskeyName.trim() || null, attestation));
      this.passkeys.update(list => [created, ...list]);
      this.newPasskeyName = '';
      this.passkeyOk.set(true);
      this.passkeyMessage.set('Passkey added.');
    } catch (err) {
      this.passkeyOk.set(false);
      this.passkeyMessage.set(err instanceof HttpErrorResponse
        ? this.messageFrom(err, 'Could not add the passkey.')
        : createPasskeyErrorMessage(err, 'Could not add the passkey.'));
    } finally {
      this.passkeyBusy.set(false);
    }
  }

  /** Reveals the step-up password prompt for one passkey. */
  startRemove(pk: PasskeyListItem): void {
    this.removingId.set(pk.id);
    this.removePassword = '';
    this.passkeyMessage.set(null);
  }

  cancelRemove(): void {
    this.removingId.set(null);
    this.removePassword = '';
  }

  /** Removes a passkey after re-confirming the account password (step-up re-authentication). */
  confirmRemove(pk: PasskeyListItem): void {
    if (!this.removePassword) return;
    this.passkeyBusy.set(true);
    this.passkeyMessage.set(null);
    this.auth.passkeyRemove(pk.id, this.removePassword).subscribe({
      next: () => {
        this.passkeyBusy.set(false);
        this.passkeys.update(list => list.filter(p => p.id !== pk.id));
        this.cancelRemove();
        this.passkeyOk.set(true);
        this.passkeyMessage.set('Passkey removed.');
      },
      error: (err: HttpErrorResponse) => {
        this.passkeyBusy.set(false);
        this.passkeyOk.set(false);
        this.passkeyMessage.set(this.messageFrom(err, 'Could not remove the passkey.'));
      },
    });
  }

  private messageFrom(err: HttpErrorResponse, fallback: string): string {
    return typeof err.error?.error === 'string' ? err.error.error : fallback;
  }
}
