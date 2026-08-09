import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ConfirmTwoFactorDeviceEnrollmentResponse,
  EnrollStartResponse,
  PasskeyBeginResponse,
  PasskeyCapabilities,
  PasskeyListItem,
  Role,
  SsoLoginResponse,
  StartTwoFactorDeviceEnrollmentResponse,
  SsoSessionResponse, TwoFactorMethod, UserProfile,
  TwoFactorDevice,
  TwoFactorDeviceCapabilities,
} from '../models/auth.models';

/**
 * The identity-provider client. This app IS the SSO identity provider for *.keshavsingh.in.
 *
 * The rotating refresh token never touches JavaScript — it lives only in the HttpOnly SSO
 * cookie set by the API. The short-lived access token is held in memory (a signal), never in
 * localStorage, to limit XSS exposure. On load, {@link session} silently exchanges the shared
 * cookie for a fresh access token; a 401 there simply means "not signed in".
 *
 * Every request that must carry the cookie uses `withCredentials: true`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private accessToken = signal<string | null>(null);
  readonly user = signal<UserProfile | null>(null);
  readonly isAuthenticated = computed(() => !!this.user() && !!this.accessToken());

  token(): string | null {
    return this.accessToken();
  }

  hasRole(...roles: Role[]): boolean {
    const u = this.user();
    return !!u && roles.some(r => u.roles.includes(r));
  }

  // ---- Login flow ----

  login(email: string, password: string, appKey: string): Observable<SsoLoginResponse> {
    return this.http
      .post<SsoLoginResponse>(`${this.base}/sso/login`, { email, password, appKey }, { withCredentials: true })
      .pipe(tap(res => { if (res.session) this.setSession(res.session); }));
  }

  verifyTwoFactor(twoFactorToken: string, code: string, method: TwoFactorMethod): Observable<SsoLoginResponse> {
    return this.http
      .post<SsoLoginResponse>(`${this.base}/sso/2fa/verify`, { twoFactorToken, code, method }, { withCredentials: true })
      .pipe(tap(res => { if (res.session) this.setSession(res.session); }));
  }

  /** Answers a session-conflict prompt: which other sessions (if any) to remove before finishing. */
  confirmSession(sessionConfirmationTicket: string, opts: { revokeSessionIds?: string[]; revokeAllOthers?: boolean }): Observable<SsoSessionResponse> {
    return this.http
      .post<SsoSessionResponse>(`${this.base}/sso/session/confirm`, {
        sessionConfirmationTicket,
        revokeSessionIds: opts.revokeSessionIds ?? null,
        revokeAllOthers: opts.revokeAllOthers ?? false,
      }, { withCredentials: true })
      .pipe(tap(session => this.setSession(session)));
  }

  sendEmailOtp(twoFactorToken: string): Observable<void> {
    return this.http.post<void>(`${this.base}/sso/2fa/email/send`, { twoFactorToken }, { withCredentials: true });
  }

  sendSmsOtp(twoFactorToken: string): Observable<void> {
    return this.http.post<void>(`${this.base}/sso/2fa/sms/send`, { twoFactorToken }, { withCredentials: true });
  }

  sendWhatsAppOtp(twoFactorToken: string): Observable<void> {
    return this.http.post<void>(`${this.base}/sso/2fa/whatsapp/send`, { twoFactorToken }, { withCredentials: true });
  }

  // ---- Session (silent SSO) ----

  /** Shared in-flight session check: a route guard and the login page's own resume check can both
   *  fire on the same navigation (e.g. a guard redirects to /login, which immediately re-checks);
   *  without this they'd double up as two identical /sso/session calls on every cold load. */
  private sessionCheck$: Observable<SsoSessionResponse> | null = null;

  /** Exchange the shared SSO cookie for a fresh access token. 401 => no active session. */
  session(): Observable<SsoSessionResponse> {
    if (!this.sessionCheck$) {
      this.sessionCheck$ = this.http
        .post<SsoSessionResponse>(`${this.base}/sso/session`, {}, { withCredentials: true })
        .pipe(
          tap(session => this.setSession(session)),
          finalize(() => { this.sessionCheck$ = null; }),
          shareReplay(1),
        );
    }
    return this.sessionCheck$;
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.base}/sso/logout`, {}, { withCredentials: true })
      .pipe(tap({ next: () => this.clearSession(), error: () => this.clearSession() }));
  }

  /** Drop in-memory auth state without a server round-trip (used on unrecoverable 401s). */
  forceClear(): void {
    this.clearSession();
  }

  private setSession(session: SsoSessionResponse): void {
    this.accessToken.set(session.accessToken);
    this.user.set(session.user);
  }

  private clearSession(): void {
    this.accessToken.set(null);
    this.user.set(null);
  }

  // ---- Self-service (bearer-based /api/auth/*, requires a live session) ----

  enrollStart(): Observable<EnrollStartResponse> {
    return this.http.post<EnrollStartResponse>(`${this.base}/auth/2fa/enroll/start`, {});
  }

  enrollConfirm(code: string): Observable<{ backupCodes: string[] }> {
    return this.http.post<{ backupCodes: string[] }>(`${this.base}/auth/2fa/enroll/confirm`, { code })
      .pipe(tap(() => this.patchUser({ twoFactorEnabled: true })));
  }

  disableTwoFactor(password: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/2fa/disable`, { password })
      .pipe(tap(() => this.patchUser({ twoFactorEnabled: false })));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/change-password`, { currentPassword, newPassword })
      .pipe(tap(() => this.patchUser({ mustChangePassword: false })));
  }

  // ---- Authenticator devices (TOTP registry) ----

  twoFactorDeviceList(): Observable<TwoFactorDevice[]> {
    return this.http.get<TwoFactorDevice[]>(`${this.base}/auth/2fa/devices`);
  }

  twoFactorDeviceCapabilities(): Observable<TwoFactorDeviceCapabilities> {
    return this.http.get<TwoFactorDeviceCapabilities>(`${this.base}/auth/2fa/devices/capabilities`);
  }

  twoFactorDeviceEnrollStart(): Observable<StartTwoFactorDeviceEnrollmentResponse> {
    return this.http.post<StartTwoFactorDeviceEnrollmentResponse>(`${this.base}/auth/2fa/devices/enroll/start`, {});
  }

  twoFactorDeviceEnrollConfirm(code: string, name: string | null, deviceType: string | null): Observable<ConfirmTwoFactorDeviceEnrollmentResponse> {
    return this.http.post<ConfirmTwoFactorDeviceEnrollmentResponse>(`${this.base}/auth/2fa/devices/enroll/confirm`, { code, name, deviceType })
      .pipe(tap(() => this.patchUser({ twoFactorEnabled: true })));
  }

  twoFactorDeviceRemove(id: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/2fa/devices/${encodeURIComponent(id)}/remove`, { password });
  }

  // ---- Passkeys (WebAuthn) ----

  /** Authenticated: registration ceremonies + management. */
  passkeyRegisterBegin(): Observable<PasskeyBeginResponse> {
    return this.http.post<PasskeyBeginResponse>(`${this.base}/passkeys/register/begin`, {});
  }

  passkeyRegisterComplete(handle: string, name: string | null, response: unknown): Observable<PasskeyListItem> {
    return this.http.post<PasskeyListItem>(`${this.base}/passkeys/register/complete`, { handle, name, response });
  }

  passkeyList(): Observable<PasskeyListItem[]> {
    return this.http.get<PasskeyListItem[]>(`${this.base}/passkeys`);
  }

  passkeyCapabilities(): Observable<PasskeyCapabilities> {
    return this.http.get<PasskeyCapabilities>(`${this.base}/passkeys/capabilities`);
  }

  /** Step-up: removing a passkey re-verifies the account password server-side. */
  passkeyRemove(id: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.base}/passkeys/${id}/remove`, { password });
  }

  /** Anonymous, usernameless sign-in. The complete call sets the SSO cookie (withCredentials). */
  passkeyLoginBegin(): Observable<PasskeyBeginResponse> {
    return this.http.post<PasskeyBeginResponse>(`${this.base}/passkeys/login/begin`, {}, { withCredentials: true });
  }

  passkeyLoginComplete(handle: string, response: unknown): Observable<SsoSessionResponse> {
    return this.http
      .post<SsoSessionResponse>(`${this.base}/passkeys/login/complete`, { handle, response }, { withCredentials: true })
      .pipe(tap(session => this.setSession(session)));
  }

  private patchUser(patch: Partial<UserProfile>): void {
    const u = this.user();
    if (u) this.user.set({ ...u, ...patch });
  }
}
