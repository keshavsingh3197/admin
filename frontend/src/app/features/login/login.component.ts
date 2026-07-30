import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { TwoFactorMethod } from '../../core/models/auth.models';

/**
 * Central sign-in for the identity provider. Step 1 is email + password; if the account has
 * two-factor enabled, step 2 collects a TOTP / backup code (with email or SMS fallback when the
 * server offers it). On success the SSO cookie is set and the user is returned to ?return= or the
 * launcher.
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <h1 class="login-title">🛡️ Sign in</h1>
        <p class="login-sub">One sign-in for every keshavsingh.in app.</p>

        @if (errorMessage()) {
          <div class="error-banner">{{ errorMessage() }}</div>
        }

        @if (step() === 'credentials') {
          <form (ngSubmit)="submitCredentials()">
            <label class="field">
              <span>Email or username</span>
              <input class="input" type="text" name="email" autocomplete="username"
                     [(ngModel)]="email" [disabled]="loading()" required autofocus />
            </label>
            <label class="field">
              <span>Password</span>
              <input class="input" type="password" name="password" autocomplete="current-password"
                     [(ngModel)]="password" [disabled]="loading()" required />
            </label>
            <button class="btn-primary" type="submit" [disabled]="loading() || !email || !password">
              {{ loading() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>
        } @else {
          <form (ngSubmit)="submitTwoFactor()">
            <label class="field">
              <span>{{ methodLabel() }}</span>
              <input class="input" type="text" name="code" inputmode="numeric" autocomplete="one-time-code"
                     [(ngModel)]="code" [disabled]="loading()" required autofocus />
            </label>

            <button class="btn-primary" type="submit" [disabled]="loading() || !code">
              {{ loading() ? 'Verifying…' : 'Verify' }}
            </button>

            <div class="alt-methods">
              @if (method() !== 'BackupCode') {
                <button type="button" class="linkish" (click)="useMethod('BackupCode')">Use a backup code</button>
              }
              @if (method() !== 'Totp') {
                <button type="button" class="linkish" (click)="useMethod('Totp')">Use authenticator</button>
              }
              @if (emailFallback()) {
                <button type="button" class="linkish" (click)="sendEmail()">Email me a code</button>
              }
              @if (smsFallback()) {
                <button type="button" class="linkish" (click)="sendSms()">Text me a code</button>
              }
            </div>
            <button type="button" class="linkish back" (click)="reset()">← Start over</button>
          </form>
        }
      </div>
    </div>
  `,
  styles: [`
    .login-wrap { display: flex; justify-content: center; padding: 3rem 1rem; }
    .login-card {
      width: 100%; max-width: 380px; background: #fff; border: 1px solid #e0e0e0;
      border-radius: 8px; padding: 2rem; box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .login-title { margin: 0 0 0.25rem; font-size: 1.5rem; }
    .login-sub { margin: 0 0 1.5rem; color: #666; font-size: 0.9rem; }
    .field { display: block; margin-bottom: 1rem; }
    .field span { display: block; margin-bottom: 0.35rem; font-size: 0.85rem; color: #444; }
    .input {
      width: 100%; padding: 0.6rem 0.75rem; border: 1px solid #ccc; border-radius: 6px;
      font-size: 1rem;
    }
    .input:focus { outline: none; border-color: #1a73e8; box-shadow: 0 0 0 2px #e8f0fe; }
    .btn-primary {
      width: 100%; padding: 0.65rem 1rem; background: #1a73e8; color: #fff; border: none;
      border-radius: 6px; font-size: 1rem; cursor: pointer; transition: background 0.2s;
    }
    .btn-primary:hover:not(:disabled) { background: #1663c7; }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }
    .error-banner {
      background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c3;
      border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; font-size: 0.9rem;
    }
    .alt-methods { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
    .linkish {
      background: none; border: none; color: #1a73e8; cursor: pointer; padding: 0;
      font-size: 0.85rem;
    }
    .linkish:hover { text-decoration: underline; }
    .back { margin-top: 1rem; color: #666; }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly step = signal<'credentials' | 'twofactor'>('credentials');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly method = signal<TwoFactorMethod>('Totp');
  readonly emailFallback = signal(false);
  readonly smsFallback = signal(false);

  email = '';
  password = '';
  code = '';
  private twoFactorToken = '';

  methodLabel(): string {
    switch (this.method()) {
      case 'BackupCode': return 'Backup code';
      case 'Email': return 'Emailed code';
      case 'Sms': return 'Texted code';
      default: return 'Authenticator code';
    }
  }

  submitCredentials(): void {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.auth.login(this.email, this.password).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.twoFactorRequired && res.twoFactorToken) {
          this.twoFactorToken = res.twoFactorToken;
          this.emailFallback.set(res.emailFallbackAvailable);
          this.smsFallback.set(res.smsFallbackAvailable);
          this.method.set('Totp');
          this.step.set('twofactor');
        } else if (res.session) {
          this.finish();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(this.messageFrom(err, 'Invalid credentials.'));
      },
    });
  }

  submitTwoFactor(): void {
    if (!this.code) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.auth.verifyTwoFactor(this.twoFactorToken, this.code.trim(), this.method()).subscribe({
      next: () => { this.loading.set(false); this.finish(); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(this.messageFrom(err, 'Invalid or expired code.'));
      },
    });
  }

  useMethod(method: TwoFactorMethod): void {
    this.method.set(method);
    this.code = '';
    this.errorMessage.set(null);
  }

  sendEmail(): void {
    this.auth.sendEmailOtp(this.twoFactorToken).subscribe({
      next: () => { this.useMethod('Email'); this.errorMessage.set(null); },
      error: () => this.errorMessage.set('Could not send the email code.'),
    });
  }

  sendSms(): void {
    this.auth.sendSmsOtp(this.twoFactorToken).subscribe({
      next: () => { this.useMethod('Sms'); this.errorMessage.set(null); },
      error: () => this.errorMessage.set('Could not send the SMS code.'),
    });
  }

  reset(): void {
    this.step.set('credentials');
    this.code = '';
    this.twoFactorToken = '';
    this.errorMessage.set(null);
  }

  private finish(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('return');
    if (returnUrl) {
      // Internal path — stay in this SPA. Reject protocol-relative ("//host") values.
      if (returnUrl.startsWith('/') && !returnUrl.startsWith('//')) { this.router.navigateByUrl(returnUrl); return; }
      // Cross-app return — only to an allowlisted keshavsingh.in origin (open-redirect guard).
      if (this.isAllowedExternal(returnUrl)) { window.location.href = returnUrl; return; }
    }
    this.router.navigateByUrl('/');
  }

  /** Allowlist: same host (dev) or any keshavsingh.in subdomain. Never an arbitrary origin. */
  private isAllowedExternal(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
      const host = u.hostname;
      return host === window.location.hostname
        || host === 'keshavsingh.in'
        || host.endsWith('.keshavsingh.in');
    } catch {
      return false;
    }
  }

  private messageFrom(err: HttpErrorResponse, fallback: string): string {
    return typeof err.error?.error === 'string' ? err.error.error : fallback;
  }
}
