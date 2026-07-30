import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  EnrollStartResponse, Role, SsoLoginResponse, SsoSessionResponse,
  TwoFactorMethod, UserProfile,
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

  login(email: string, password: string): Observable<SsoLoginResponse> {
    return this.http
      .post<SsoLoginResponse>(`${this.base}/sso/login`, { email, password }, { withCredentials: true })
      .pipe(tap(res => { if (res.session) this.setSession(res.session); }));
  }

  verifyTwoFactor(twoFactorToken: string, code: string, method: TwoFactorMethod): Observable<SsoSessionResponse> {
    return this.http
      .post<SsoSessionResponse>(`${this.base}/sso/2fa/verify`, { twoFactorToken, code, method }, { withCredentials: true })
      .pipe(tap(session => this.setSession(session)));
  }

  sendEmailOtp(twoFactorToken: string): Observable<void> {
    return this.http.post<void>(`${this.base}/sso/2fa/email/send`, { twoFactorToken }, { withCredentials: true });
  }

  sendSmsOtp(twoFactorToken: string): Observable<void> {
    return this.http.post<void>(`${this.base}/sso/2fa/sms/send`, { twoFactorToken }, { withCredentials: true });
  }

  // ---- Session (silent SSO) ----

  /** Exchange the shared SSO cookie for a fresh access token. 401 => no active session. */
  session(): Observable<SsoSessionResponse> {
    return this.http
      .post<SsoSessionResponse>(`${this.base}/sso/session`, {}, { withCredentials: true })
      .pipe(tap(session => this.setSession(session)));
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

  private patchUser(patch: Partial<UserProfile>): void {
    const u = this.user();
    if (u) this.user.set({ ...u, ...patch });
  }
}
