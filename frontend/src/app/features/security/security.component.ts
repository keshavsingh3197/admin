import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { EnrollStartResponse } from '../../core/models/auth.models';

/**
 * Self-service account security for the signed-in identity: change password and manage the
 * authenticator (TOTP) second factor. Backed by the shared bearer surface (/api/auth/*), which
 * the admin backend already exposes — no new endpoints needed.
 */
@Component({
  selector: 'app-security',
  imports: [FormsModule],
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
  `]
})
export class SecurityComponent {
  private auth = inject(AuthService);

  readonly enabled = computed(() => !!this.auth.user()?.twoFactorEnabled);

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

  private setTwoFaError(err: HttpErrorResponse, fallback: string): void {
    this.twoFaOk.set(false);
    this.twoFaMessage.set(this.messageFrom(err, fallback));
  }

  private messageFrom(err: HttpErrorResponse, fallback: string): string {
    return typeof err.error?.error === 'string' ? err.error.error : fallback;
  }
}
