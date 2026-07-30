import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PublicConfig } from '../models/config.models';

/**
 * Reads the identity provider's central, non-secret app config (GET /api/config) — launcher URLs
 * and branding that used to be duplicated in every app's environment file. The result is cached in
 * the {@link config} signal; call {@link refresh} to re-fetch after an admin edits it.
 *
 * `apiUrl` itself stays in the environment: it's the one bootstrap value needed to reach this
 * endpoint in the first place. Everything else can live centrally.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  readonly config = signal<PublicConfig | null>(null);

  /** Fetches the central config and caches it. */
  load(): Observable<PublicConfig> {
    return this.http.get<PublicConfig>(`${this.base}/config`).pipe(tap(c => this.config.set(c)));
  }

  /** Re-fetches in the background (e.g. after settings change). Errors are non-fatal. */
  refresh(): void {
    this.load().subscribe({ error: () => { /* keep the last good config */ } });
  }
}
