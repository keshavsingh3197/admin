import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { SsoSessionResponse } from '../models/auth.models';

const SESSION: SsoSessionResponse = {
  accessToken: 'test-access-token',
  accessTokenExpiresAt: '2099-01-01T00:00:00Z',
  user: {
    id: 'test-user', email: 'test@example.invalid', displayName: 'Test',
    roles: ['Viewer'], twoFactorEnabled: false, mustChangePassword: false,
  },
};

describe('SSO session rotation', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let locksDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    locksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    if (locksDescriptor) Object.defineProperty(navigator, 'locks', locksDescriptor);
    else Reflect.deleteProperty(navigator, 'locks');
  });

  it('shares one rotation between simultaneous subscribers', async () => {
    const first = firstValueFrom(auth.session());
    const second = firstValueFrom(auth.session());
    const request = http.expectOne(req => req.url.endsWith('/sso/session'));
    expect(request.request.withCredentials).toBe(true);
    request.flush(SESSION);
    expect(await first).toEqual(SESSION);
    expect(await second).toEqual(SESSION);
    expect(auth.token()).toBe(SESSION.accessToken);
  });

  it('waits for the cross-tab lock before sending the cookie', async () => {
    let run: (() => Promise<unknown>) | undefined;
    let release: ((result: unknown) => void) | undefined;
    let lockName = '';
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (name: string, callback: () => Promise<unknown>) => {
          lockName = name;
          run = callback;
          return new Promise(resolve => { release = resolve; });
        },
      },
    });
    const result = firstValueFrom(auth.session());
    expect(lockName).toBe('admin-sso-refresh');
    http.expectNone(req => req.url.endsWith('/sso/session'));
    if (!run || !release) throw new Error('Expected queued lock callback.');
    const rotation = run();
    http.expectOne(req => req.url.endsWith('/sso/session')).flush(SESSION);
    release(await rotation);
    expect(await result).toEqual(SESSION);
  });

  it('does not automatically retry a failed rotation and permits a later explicit check', async () => {
    const failed = firstValueFrom(auth.session());
    const assertion = expect(failed).rejects.toMatchObject({ status: 503 });
    http.expectOne(req => req.url.endsWith('/sso/session'))
      .flush({ error: 'Unavailable' }, { status: 503, statusText: 'Unavailable' });
    await assertion;
    http.expectNone(req => req.url.endsWith('/sso/session'));
    const later = firstValueFrom(auth.session());
    http.expectOne(req => req.url.endsWith('/sso/session')).flush(SESSION);
    expect(await later).toEqual(SESSION);
  });
});
