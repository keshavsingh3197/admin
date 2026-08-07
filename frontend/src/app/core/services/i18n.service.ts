import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, from } from 'rxjs';
import {
  CONFIG_KEYS,
  LocalizationClient,
  PublicLocale,
  TranslationBundle,
} from '@keshavsingh3197/web-config';
import { environment } from '../../../environments/environment';
import { ConfigService } from './config.service';

/**
 * The Angular adapter over {@link LocalizationClient}. Every user-facing string comes from the API
 * (`GET /api/i18n/bundle/{locale}`) rather than the build, so adding a language or fixing a wording is
 * a database edit.
 *
 * In a template: `{{ i18n.t('common.actions.save') }}` or the `t` pipe. `t()` reads a signal, so
 * switching language re-renders every string in place — no reload, no page state lost.
 *
 * All the actual logic (language resolution, fallbacks, interpolation, ETag/version polling,
 * persistence) lives in `@keshavsingh3197/web-config`, shared with the blog and the portfolio.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private config = inject(ConfigService);

  /** `admin` is this app's own strings; `common` and `brand` are shared with every other app. */
  private client = new LocalizationClient({
    apiBase: environment.apiUrl,
    namespaces: ['common', 'admin', 'brand'],
    config: this.config.runtime,
  });

  private readonly bundle = signal<TranslationBundle | null>(null);

  readonly locale = computed(() => this.bundle()?.locale ?? '');
  readonly direction = computed<'ltr' | 'rtl'>(() => this.bundle()?.direction ?? 'ltr');
  readonly ready = computed(() => this.bundle() !== null);

  /** The enabled languages. Tracks the config signal so it appears as soon as either source loads. */
  readonly locales = computed<PublicLocale[]>(() => {
    this.config.config();
    this.bundle();
    return this.client.locales;
  });

  /** Rendered only when an admin has enabled the picker and there is more than one language. */
  readonly showPicker = computed(() => {
    this.config.config();
    this.bundle();
    return this.client.showPicker;
  });

  constructor() {
    const off = this.client.onChange((value) => this.bundle.set(value));
    inject(DestroyRef).onDestroy(() => {
      off();
      this.client.dispose();
    });
  }

  /**
   * Loads the manifest and the resolved language's bundle, then starts polling for editor changes.
   * Call once at startup, after the central config has loaded.
   *
   * @param namespaces Overrides the bundles this app asks for. Rarely needed.
   */
  init(namespaces?: string[]): Observable<TranslationBundle | null> {
    if (namespaces?.length) {
      this.client.dispose();
      this.client = new LocalizationClient({
        apiBase: environment.apiUrl,
        namespaces,
        config: this.config.runtime,
      });
      this.client.onChange((value) => this.bundle.set(value));
    }
    return from(this.client.init());
  }

  /** Switches language: persists the choice, re-fetches, updates `lang`/`dir`. */
  use(code: string): void {
    void this.client.use(code);
  }

  /** Re-fetches the current language, so an editor's save shows without waiting for the next poll. */
  reload(): void {
    void this.client.reload();
  }

  /**
   * Translates a key, interpolating `{name}` placeholders. A missing key renders as the key itself —
   * visible on the page, which is what gets a gap noticed instead of shipping a blank label.
   */
  t(key: string, params?: Record<string, string | number>): string {
    this.bundle();
    return this.client.t(key, params);
  }

  /**
   * Resolves a config entry that holds a translation key to text in the current language; a plain entry
   * is returned as-is. This is how a configured label — a brand name, a tagline — is both editable and
   * translatable.
   */
  configText(key: string, fallback = ''): string {
    this.bundle();
    this.config.config();
    return this.client.configText(key, fallback);
  }

  /** Formats a date in the current language. */
  formatDate(value: string | Date | null | undefined): string {
    this.bundle();
    return this.client.formatDate(value);
  }

  readonly keys = CONFIG_KEYS;
}
