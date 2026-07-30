import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Role } from '../models/auth.models';

/**
 * Blocks a route unless a session is active. If the in-memory session is empty (e.g. after a
 * full page reload), it tries a single silent SSO exchange of the shared cookie first, so a
 * user who is already signed in at any *.keshavsingh.in site lands here without a second login.
 * Failure redirects to /login, preserving the attempted URL as ?return=.
 */
export const authGuard: CanActivateFn = (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return of(true);

  return auth.session().pipe(
    map(() => true),
    catchError(() => {
      auth.forceClear();
      return of(router.createUrlTree(['/login'], { queryParams: { return: state.url } }));
    })
  );
};

/** Default-deny role gate. Sends authenticated-but-unauthorised users back to the launcher. */
export const roleGuard = (...roles: Role[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.hasRole(...roles) ? true : router.createUrlTree(['/']);
};
