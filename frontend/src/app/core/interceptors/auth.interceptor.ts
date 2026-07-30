import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

/**
 * Attaches the bearer access token to same-origin API calls only (never to the external
 * launcher links), and on a single 401 tries one silent SSO {@link AuthService.session}
 * refresh before replaying the request. The /sso/* endpoints are never refreshed, to avoid
 * loops. Any unrecoverable 401 fails closed: clear state and route to /login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const base = environment.apiUrl;

  const isApi = req.url.startsWith(base);
  const isSsoRoute = req.url.includes('/sso/');

  const token = auth.token();
  const authed = isApi && token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authed).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || !isApi || isSsoRoute) {
        return throwError(() => err);
      }
      // One silent-session attempt, then replay the original request with the new token.
      return auth.session().pipe(
        switchMap(session => next(req.clone({
          setHeaders: { Authorization: `Bearer ${session.accessToken}` },
        }))),
        catchError(refreshErr => {
          auth.forceClear();
          router.navigate(['/login']);
          return throwError(() => refreshErr);
        })
      );
    })
  );
};
