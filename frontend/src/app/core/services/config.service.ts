import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CONFIG_KEYS, JsonTransport, RuntimeConfig, RuntimeConfigClient } from '@keshavsingh3197/web-config';
import { environment } from '../../../environments/environment';

/**
 * The Angular adapter over {@link RuntimeConfigClient} — the central runtime config (`GET /api/config`):
 * launcher URLs, branding, icons, feature flags, limits and the list of languages, all of which used to
 * be duplicated in each app's environment file or hard-coded in a component.
 *
 * The fetching, typed parsing and branding application all live in `@keshavsingh3197/web-config`, shared
 * with the blog and the portfolio. This class exists only to expose it as a signal and to route
 * requests through Angular's `HttpClient` so the auth interceptor applies — which is what lets an
 * admin see the config entries scoped `authenticated`.
 *
 * Read config through the accessors, never `config()!.values`: they handle the missing-key case and the
 * declared type. A `fallback` argument is what to render before the API answers — never a second source
 * of truth.
 *
 * `apiUrl` stays in the environment: it is the one bootstrap value needed to reach this endpoint.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private http = inject(HttpClient);

  /**
   * Angular's HttpClient as the transport, so the auth interceptor (and anything else in the chain)
   * applies. Contractually it must never throw — a config outage has to degrade, not break the app.
   */
  private readonly transport: JsonTransport = {
    getJson: <T>(url: string) =>
      new Promise<T | null>((resolve) => {
        this.http
          .get<T>(url)
          .pipe(catchError(() => of(null)))
          .subscribe((value) => resolve(value ?? null));
      }),
  };

  private readonly client = new RuntimeConfigClient({
    apiBase: environment.apiUrl,
    transport: this.transport,
  });

  /** The loaded config, or null before the first successful load. */
  readonly config = signal<RuntimeConfig | null>(null);
  readonly loaded = computed(() => this.config() !== null);
  readonly keys = CONFIG_KEYS;

  constructor() {
    const off = this.client.onChange((value) => this.config.set(value));
    inject(DestroyRef).onDestroy(off);
  }

  /** Fetches the central config and caches it. Errors are non-fatal by design. */
  load(): Observable<RuntimeConfig | null> {
    return from(this.client.load());
  }

  /** Re-fetches in the background (e.g. after a settings or config edit). */
  refresh(): void {
    this.load().subscribe();
  }

  // ---------------------------------------------------------------------------------------------
  // Typed accessors. Each reads the `config` signal, so templates using them re-render on a change.
  // ---------------------------------------------------------------------------------------------

  text(key: string, fallback = ''): string {
    this.config();
    return this.client.text(key, fallback);
  }

  bool(key: string, fallback = false): boolean {
    this.config();
    return this.client.bool(key, fallback);
  }

  num(key: string, fallback = 0): number {
    this.config();
    return this.client.num(key, fallback);
  }

  icon(key: string, fallback = ''): string {
    this.config();
    return this.client.icon(key, fallback);
  }

  url(key: string, fallback = ''): string {
    this.config();
    return this.client.url(key, fallback);
  }

  json<T>(key: string, fallback: T): T {
    this.config();
    return this.client.json(key, fallback);
  }

  /** True when the stored value is a translation key rather than a literal. */
  isLocalized(key: string): boolean {
    this.config();
    return this.client.isLocalized(key);
  }

  /** The underlying client, for {@link I18nService} to share. */
  get runtime(): RuntimeConfigClient {
    return this.client;
  }
}
