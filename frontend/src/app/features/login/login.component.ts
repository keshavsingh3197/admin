import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { SessionConflictInfo, TwoFactorMethod } from '../../core/models/auth.models';
import { createPasskeyErrorMessage, getPasskeyAssertion, isPasskeySupported, ServerCredentialOptions } from '../../core/services/webauthn';

/**
 * Central sign-in for the identity provider. Step 1 is email + password; if the account has
 * two-factor enabled, step 2 collects a TOTP / backup code (with email or SMS fallback when the
 * server offers it). On success the SSO cookie is set and the user is returned to ?return= or the
 * launcher.
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule, CommonModule],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <h1 class="login-title">🛡️ Sign in</h1>
        <p class="login-sub">One sign-in for every keshavsingh.in app.</p>

        @if (checking()) {
          <p class="login-sub">Signing you in…</p>
        } @else {

        @if (errorMessage()) {
          <div class="error-banner">{{ errorMessage() }}</div>
        }

        @if (removedSessionCount() !== null) {
          <div class="info-banner">
            Deleted {{ removedSessionCount() }} previous session{{ removedSessionCount() === 1 ? '' : 's' }} for this app. This is now the only active session.
            <button type="button" class="btn-primary" style="margin-top: 0.75rem;" (click)="finish()">Continue</button>
          </div>
        } @else if (sessionConflict()) {
          <div class="conflict-panel">
            <p class="login-sub">This app allows one active session. Continuing will delete the previous session{{ sessionConflict()!.sessions.length === 1 ? '' : 's' }} listed below.</p>
            <ul class="session-list">
              @for (s of sessionConflict()!.sessions; track s.id) {
                <li class="session-row">
                  <span class="session-info">
                    <strong>{{ s.deviceLabel || 'Unknown device' }}</strong>
                    <small>Signed in {{ s.createdAt | date: 'medium' }}</small>
                  </span>
                </li>
              }
            </ul>
            <button class="btn-primary" type="button" [disabled]="loading()" (click)="confirmSessionRemoval()">
              {{ loading() ? 'Replacing session…' : 'Delete previous & sign in' }}
            </button>
            <button type="button" class="linkish back" (click)="cancelSessionConflict()">← Cancel</button>
          </div>
        } @else if (step() === 'credentials') {
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

          @if (passkeySupported) {
            <div class="or-divider"><span>or</span></div>
            <button class="btn-passkey" type="button" [disabled]="loading() || passkeyLoading()"
                    (click)="signInWithPasskey()">
              🔑 {{ passkeyLoading() ? 'Waiting for passkey…' : 'Sign in with a passkey' }}
            </button>
          }
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
              @if (whatsAppFallback()) {
                <button type="button" class="linkish" (click)="sendWhatsApp()">WhatsApp me a code</button>
              }
            </div>
            <button type="button" class="linkish back" (click)="reset()">← Start over</button>
          </form>
        }

        }
      </div>
    </div>
  `,
  styles: [`
    .login-wrap { display: flex; justify-content: center; padding: 3rem 1rem; }
    .login-card {
      width: 100%; max-width: 380px; background: var(--surface); color: var(--text);
      border: 1px solid var(--border); border-radius: 8px; padding: 2rem; box-shadow: var(--shadow-sm);
    }
    .login-title { margin: 0 0 0.25rem; font-size: 1.5rem; }
    .login-sub { margin: 0 0 1.5rem; color: var(--muted); font-size: 0.9rem; }
    .field { display: block; margin-bottom: 1rem; }
    .field span { display: block; margin-bottom: 0.35rem; font-size: 0.85rem; color: var(--muted); }
    .input {
      width: 100%; padding: 0.6rem 0.75rem; border: 1px solid var(--border); border-radius: 6px;
      font-size: 1rem; background: var(--surface); color: var(--text);
    }
    .input:focus {
      outline: none; border-color: var(--brand);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 20%, transparent);
    }
    .btn-primary {
      width: 100%; padding: 0.65rem 1rem; background: var(--brand); color: var(--brand-text); border: none;
      border-radius: 6px; font-size: 1rem; cursor: pointer; transition: filter 0.2s;
    }
    .btn-primary:hover:not(:disabled) { filter: brightness(0.92); }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }
    .error-banner {
      background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c3;
      border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; font-size: 0.9rem;
    }
    .alt-methods { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
    .linkish {
      background: none; border: none; color: var(--brand); cursor: pointer; padding: 0;
      font-size: 0.85rem;
    }
    .linkish:hover { text-decoration: underline; }
    .back { margin-top: 1rem; color: var(--muted); }
    .or-divider { display: flex; align-items: center; text-align: center; color: var(--muted); font-size: 0.8rem; margin: 1.1rem 0; }
    .or-divider::before, .or-divider::after { content: ''; flex: 1; border-bottom: 1px solid var(--border); }
    .or-divider span { padding: 0 0.75rem; }
    .btn-passkey {
      width: 100%; padding: 0.65rem 1rem; background: var(--surface); color: var(--brand); border: 1px solid var(--brand);
      border-radius: 6px; font-size: 1rem; cursor: pointer; transition: background 0.2s;
    }
    .btn-passkey:hover:not(:disabled) { background: color-mix(in srgb, var(--brand) 12%, var(--surface)); }
    .btn-passkey:disabled { opacity: 0.6; cursor: default; }
    .info-banner {
      background: #e6f4ea; color: #137333; border: 1px solid #ceead6;
      border-radius: 6px; padding: 0.75rem; margin-bottom: 1rem; font-size: 0.9rem;
    }
    .conflict-panel .btn-primary { margin-top: 0.5rem; }
    .session-list { list-style: none; margin: 0 0 1rem; padding: 0; }
    .session-row {
      display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
      padding: 0.6rem 0; border-bottom: 1px solid var(--border);
    }
    .session-info { display: flex; flex-direction: column; font-size: 0.85rem; }
    .session-info small { color: var(--muted); }
  `]
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly step = signal<'credentials' | 'twofactor'>('credentials');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** True while we silently test the shared SSO cookie; avoids flashing the form for signed-in users. */
  readonly checking = signal(true);

  ngOnInit(): void {
    // Already signed in on another *.keshavsingh.in app? Resume silently and bounce straight
    // to ?return= — no second prompt. A 401 just means "not signed in": show the form.
    this.auth.session().subscribe({
      next: () => this.finish(),
      error: () => this.checking.set(false),
    });
  }

  readonly method = signal<TwoFactorMethod>('Totp');
  readonly emailFallback = signal(false);
  readonly smsFallback = signal(false);
  readonly whatsAppFallback = signal(false);

  /** Whether this browser can do WebAuthn at all — gates the passkey button. */
  readonly passkeySupported = isPasskeySupported();
  readonly passkeyLoading = signal(false);

  email = '';
  password = '';
  code = '';
  private twoFactorToken = '';

  /** Which site is signing in ("admin", "content-blog", "ghar-ledger", ...), from ?app= — sibling
   *  apps append this when redirecting here. Defaults to "admin" for this app's own panel. */
  private appKey(): string {
    return this.route.snapshot.queryParamMap.get('app') || 'admin';
  }

  readonly sessionConflict = signal<{ ticket: string; sessions: SessionConflictInfo[] } | null>(null);
  readonly removedSessionCount = signal<number | null>(null);

  confirmSessionRemoval(): void {
    const conflict = this.sessionConflict();
    if (!conflict) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.auth.confirmSession(conflict.ticket, { revokeAllOthers: true }).subscribe({
      next: () => {
        this.loading.set(false);
        this.sessionConflict.set(null);
        this.removedSessionCount.set(conflict.sessions.length);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(this.messageFrom(err, 'That session prompt expired. Please sign in again.'));
        this.sessionConflict.set(null);
      },
    });
  }

  cancelSessionConflict(): void {
    this.sessionConflict.set(null);
    this.loading.set(false);
  }

  methodLabel(): string {
    switch (this.method()) {
      case 'BackupCode': return 'Backup code';
      case 'Email': return 'Emailed code';
      case 'Sms': return 'Texted code';
      case 'WhatsApp': return 'WhatsApp code';
      default: return 'Authenticator code';
    }
  }

  submitCredentials(): void {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.auth.login(this.email, this.password, this.appKey()).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.requiresSessionConfirmation && res.sessionConfirmationTicket) {
          this.sessionConflict.set({ ticket: res.sessionConfirmationTicket, sessions: res.conflictingSessions ?? [] });
        } else if (res.twoFactorRequired && res.twoFactorToken) {
          this.twoFactorToken = res.twoFactorToken;
          this.emailFallback.set(res.emailFallbackAvailable);
          this.smsFallback.set(res.smsFallbackAvailable);
          this.whatsAppFallback.set(res.whatsAppFallbackAvailable);
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
      next: res => {
        this.loading.set(false);
        if (res.requiresSessionConfirmation && res.sessionConfirmationTicket) {
          this.sessionConflict.set({ ticket: res.sessionConfirmationTicket, sessions: res.conflictingSessions ?? [] });
        } else {
          this.finish();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(this.messageFrom(err, 'Invalid or expired code.'));
      },
    });
  }

  /**
   * Usernameless passkey sign-in: ask the server for assertion options, run the WebAuthn ceremony,
   * then hand the signed assertion back. On success the SSO cookie is set and we finish like any
   * other login. Cancellations surface as a gentle message, not an error.
   */
  async signInWithPasskey(): Promise<void> {
    this.passkeyLoading.set(true);
    this.errorMessage.set(null);
    try {
      const begin = await firstValueFrom(this.auth.passkeyLoginBegin());
      const assertion = await getPasskeyAssertion(begin.options as unknown as ServerCredentialOptions);
      await firstValueFrom(this.auth.passkeyLoginComplete(begin.handle, assertion));
      this.finish();
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        this.errorMessage.set(this.messageFrom(err, 'Passkey sign-in failed.'));
      } else {
        this.errorMessage.set(createPasskeyErrorMessage(err, 'Passkey sign-in failed.'));
      }
    } finally {
      this.passkeyLoading.set(false);
    }
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

  sendWhatsApp(): void {
    this.auth.sendWhatsAppOtp(this.twoFactorToken).subscribe({
      next: () => { this.useMethod('WhatsApp'); this.errorMessage.set(null); },
      error: () => this.errorMessage.set('Could not send the WhatsApp code.'),
    });
  }

  reset(): void {
    this.step.set('credentials');
    this.code = '';
    this.twoFactorToken = '';
    this.errorMessage.set(null);
  }

  finish(): void {
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
