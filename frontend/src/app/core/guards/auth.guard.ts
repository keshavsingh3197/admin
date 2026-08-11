import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { RbacService } from '../services/rbac.service';
import { EffectiveAccess } from '../models/rbac.models';
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

/**
 * Session-aware Admin gate: resumes the SSO session first (so it works on a cold page load),
 * then requires the Admin role. Non-admins go to the launcher; unauthenticated users to /login.
 */
export const adminGuard: CanActivateFn = (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const decide = () => (auth.hasRole('Admin') ? true : router.createUrlTree(['/']));

  if (auth.isAuthenticated()) return of(decide());

  return auth.session().pipe(
    map(() => decide()),
    catchError(() => {
      auth.forceClear();
      return of(router.createUrlTree(['/login'], { queryParams: { return: state.url } }));
    })
  );
};

/**
 * Same-website, granular gate: a signed-in non-Admin only gets past this if a custom role/group
 * grants the given `PermissionCatalog` `page.*` key (see `RequirePagePermissionAttribute` server-side —
 * this is the frontend half of the same check, so a denied user is told before the page even
 * renders instead of discovering it one broken API call at a time). Denials go home with
 * `?denied=<key>` so the shell can show a plain-language reason instead of a silent redirect.
 */
export const pagePermissionGuard = (permissionKey: string): CanActivateFn =>
  (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
    const auth = inject(AuthService);
    const rbac = inject(RbacService);
    const router = inject(Router);

    const decide = (access: EffectiveAccess) =>
      auth.hasRole('Admin') || access.adminPermissions.includes(permissionKey)
        ? true
        : router.createUrlTree(['/'], { queryParams: { denied: permissionKey } });

    const checkPermission = () =>
      rbac.me().pipe(
        map(decide),
        catchError(() => of(router.createUrlTree(['/'], { queryParams: { denied: permissionKey } }))),
      );

    if (auth.isAuthenticated()) return checkPermission();

    return auth.session().pipe(
      switchMap(() => checkPermission()),
      catchError(() => {
        auth.forceClear();
        return of(router.createUrlTree(['/login'], { queryParams: { return: state.url } }));
      })
    );
  };
