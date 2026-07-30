import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SettingsService } from '../../core/services/settings.service';
import { SettingsView } from '../../core/models/settings.models';

/**
 * Runtime auth-security settings for the identity provider (Admin only). Changes are stored in the
 * database and read live by the shared auth engine — no redeploy needed.
 */
@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    <div class="set-wrap">
      <h1 class="page-title">Settings</h1>
      @if (message()) { <div class="banner" [class.ok]="ok()">{{ message() }}</div> }

      @if (loading()) {
        <p>Loading…</p>
      } @else if (model(); as m) {
        <form class="card" (ngSubmit)="save()">
          <h2>General</h2>
          <label class="field"><span>Site title</span>
            <input class="input" type="text" name="title" [(ngModel)]="m.siteTitle" /></label>

          <h2>Sign-in security</h2>
          <div class="grid">
            <label class="field"><span>Max failed attempts before lockout</span>
              <input class="input" type="number" min="1" max="20" name="mfa" [(ngModel)]="m.maxFailedLoginAttempts" /></label>
            <label class="field"><span>Lockout duration (minutes)</span>
              <input class="input" type="number" min="1" max="1440" name="lm" [(ngModel)]="m.lockoutMinutes" /></label>
            <label class="field"><span>Email OTP validity (minutes)</span>
              <input class="input" type="number" min="1" max="60" name="eo" [(ngModel)]="m.emailOtpMinutes" /></label>
            <label class="field"><span>Backup codes generated on enrol</span>
              <input class="input" type="number" min="5" max="20" name="bc" [(ngModel)]="m.backupCodeCount" /></label>
          </div>

          <h2>Two-factor fallback</h2>
          <p class="hint">Authenticator (TOTP) 2FA always works. Email/SMS fallback only delivers once real
             email/SMS senders are configured for this service.</p>
          <label class="chk"><input type="checkbox" name="e2fa" [(ngModel)]="m.emailTwoFactorEnabled" /> Allow email code fallback</label>
          <label class="chk"><input type="checkbox" name="s2fa" [(ngModel)]="m.smsTwoFactorEnabled" /> Allow SMS code fallback</label>

          <div class="foot">
            <button class="btn-primary" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save settings' }}</button>
            <span class="updated">Last updated {{ m.updatedAt }}</span>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .set-wrap { max-width: 640px; margin: 0 auto; padding: 1rem; }
    .page-title { font-size: 1.5rem; margin: 0 0 1rem; }
    .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 1.5rem; }
    .card h2 { font-size: 1.05rem; margin: 1.25rem 0 0.75rem; }
    .card h2:first-of-type { margin-top: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; }
    .field span { display: block; margin-bottom: 0.3rem; font-size: 0.82rem; color: #444; }
    .input { width: 100%; padding: 0.55rem 0.7rem; border: 1px solid #ccc; border-radius: 6px; font-size: 0.95rem; }
    .input:focus { outline: none; border-color: #1a73e8; box-shadow: 0 0 0 2px #e8f0fe; }
    .hint { color: #666; font-size: 0.85rem; margin: 0 0 0.6rem; }
    .chk { display: block; margin-bottom: 0.5rem; font-size: 0.92rem; }
    .foot { display: flex; align-items: center; gap: 1rem; margin-top: 1.5rem; }
    .btn-primary { padding: 0.6rem 1.2rem; background: #1a73e8; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }
    .updated { color: #888; font-size: 0.8rem; }
    .banner { background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c3; border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; }
    .banner.ok { background: #e6f4ea; color: #137333; border-color: #b7e1c4; }
  `]
})
export class SettingsComponent implements OnInit {
  private api = inject(SettingsService);

  readonly model = signal<SettingsView | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly ok = signal(false);

  ngOnInit(): void {
    this.api.get().subscribe({
      next: s => { this.model.set(s); this.loading.set(false); },
      error: (err: HttpErrorResponse) => { this.loading.set(false); this.fail(err, 'Could not load settings.'); },
    });
  }

  save(): void {
    const m = this.model();
    if (!m) return;
    this.busy.set(true);
    this.message.set(null);
    this.api.update({
      siteTitle: m.siteTitle,
      emailTwoFactorEnabled: m.emailTwoFactorEnabled,
      smsTwoFactorEnabled: m.smsTwoFactorEnabled,
      emailOtpMinutes: Number(m.emailOtpMinutes),
      maxFailedLoginAttempts: Number(m.maxFailedLoginAttempts),
      lockoutMinutes: Number(m.lockoutMinutes),
      backupCodeCount: Number(m.backupCodeCount),
    }).subscribe({
      next: s => { this.busy.set(false); this.model.set(s); this.ok.set(true); this.message.set('Settings saved.'); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not save settings.'); },
    });
  }

  private fail(err: HttpErrorResponse, fallback: string): void {
    this.ok.set(false);
    this.message.set(typeof err.error?.error === 'string' ? err.error.error : fallback);
  }
}
