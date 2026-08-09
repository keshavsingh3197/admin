import { Component, DestroyRef, HostListener, effect, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AuthService } from './core/services/auth.service';
import { AnalyticsService } from './core/services/analytics.service';
import { ChatService } from './core/services/chat.service';
import { CallService } from './core/services/call.service';
import { ConfigService } from './core/services/config.service';
import { I18nService } from './core/services/i18n.service';
import { CONFIG_KEYS } from './core/models/config.models';
import { CallOverlayComponent } from './features/messages/call-overlay.component';
import { MeetingReminderComponent } from './features/meetings/meeting-reminder.component';

interface NavLink {
  path: string;
  /**
   * Translation key resolved through {@link I18nService}, so the nav follows the chosen language.
   * The English text lives in the catalogue (namespace `admin`), not here.
   */
  labelKey: string;
  icon: string;
  exact: boolean;
}

/**
 * Everyday pages stay on the bar; admin pages live behind the Manage menu (see app.html).
 * There is no Dashboard entry — the brand on the left is the link home.
 *
 * Icons are the fallback glyph only: the live one comes from the config registry (`ui.icon.*`) when
 * an admin has configured it — see {@link App.icon}.
 */
const PRIMARY_LINKS: NavLink[] = [
  // One entry for every conversation — team chat, visitors and the contact form are tabs inside it.
  { path: '/inbox', labelKey: 'admin.nav.inbox', icon: '💬', exact: false },
  { path: '/meetings', labelKey: 'admin.nav.meetings', icon: '📅', exact: false },
  { path: '/notes', labelKey: 'admin.nav.notes', icon: '📝', exact: false },
  { path: '/files', labelKey: 'admin.nav.files', icon: '📁', exact: false },
  { path: '/short-links', labelKey: 'admin.nav.shortLinks', icon: '🔗', exact: false },
  { path: '/finance', labelKey: 'admin.nav.finance', icon: '💰', exact: false },
];

const ADMIN_LINKS: NavLink[] = [
  { path: '/localization', labelKey: 'admin.nav.localization', icon: '🌍', exact: false },
  { path: '/website', labelKey: 'admin.nav.websites', icon: '🌐', exact: false },
  { path: '/database', labelKey: 'admin.nav.database', icon: '🗃️', exact: false },
  { path: '/users', labelKey: 'admin.nav.users', icon: '👤', exact: false },
  { path: '/groups', labelKey: 'admin.nav.groups', icon: '👪', exact: false },
  { path: '/roles', labelKey: 'admin.nav.roles', icon: '🎫', exact: false },
  { path: '/messages/moderation', labelKey: 'admin.nav.moderation', icon: '🛡️', exact: false },
  { path: '/analytics', labelKey: 'admin.nav.analytics', icon: '📊', exact: false },
  { path: '/data-retention', labelKey: 'admin.nav.dataRetention', icon: '🗄️', exact: false },
  { path: '/health', labelKey: 'admin.nav.health', icon: '❤️', exact: false },
  { path: '/settings', labelKey: 'admin.nav.settings', icon: '⚙️', exact: false },
];

@Component({
  selector: 'app-root',
  // FormsModule: the language picker in the header is an ngModel-bound <select>.
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, CallOverlayComponent, MeetingReminderComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly auth = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private analytics = inject(AnalyticsService);
  private chat = inject(ChatService);
  // Injected so the call service is alive shell-wide and can ring on any page, not just Messages.
  private calls = inject(CallService);
  protected readonly config = inject(ConfigService);
  protected readonly i18n = inject(I18nService);
  protected readonly keys = CONFIG_KEYS;

  readonly primaryLinks = PRIMARY_LINKS;
  readonly adminLinks = ADMIN_LINKS;

  readonly routeLoading = signal(false);
  readonly navOpen = signal(false);
  readonly manageOpen = signal(false);
  readonly accountOpen = signal(false);
  readonly theme = signal<'light' | 'dark' | 'brand'>(this.detectInitialTheme());

  constructor() {
    // Central config first (it holds the i18n persistence key and poll interval), then the strings.
    // Both fail soft: a config outage leaves the shell rendering its fallback glyphs and key names
    // rather than a blank page.
    this.config.load().subscribe(() => this.i18n.init(['common', 'admin', 'brand']).subscribe());

    effect(() => {
      const nextTheme = this.theme();
      document.body.dataset['theme'] = nextTheme;
      localStorage.setItem('admin.theme', nextTheme);
    });

    // Hold the chat hub open for the whole session (not just the Messages page) so incoming
    // messages, calls and meeting reminders arrive wherever the user is. Both calls are idempotent.
    effect(() => {
      if (this.auth.isAuthenticated()) void this.chat.connect();
      else void this.chat.disconnect();
    });

    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.routeLoading.set(true);
        }

        if (
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError
        ) {
          this.routeLoading.set(false);
          this.navOpen.set(false);
          this.manageOpen.set(false);
          this.accountOpen.set(false);
        }

        // Track this admin app itself as a website in Analytics, same as the external sites.
        if (event instanceof NavigationEnd) {
          this.analytics
            .trackVisit({ websiteKey: 'admin', path: event.urlAfterRedirects })
            .subscribe({ error: () => {} });
        }
      });
  }

  logout(): void {
    this.auth.logout().subscribe({ next: () => this.router.navigate(['/login']) });
  }

  /**
   * The configured glyph for a UI slot, falling back to the one compiled in. Icons live in the config
   * registry so they can be changed at runtime; `fallback` is only what shows before the config
   * arrives (or if it never does).
   */
  icon(key: string, fallback: string): string {
    return this.config.icon(key, fallback);
  }

  /** The brand label — a configured value that is itself a translation key. */
  brandName(): string {
    return this.i18n.configText(CONFIG_KEYS.brandName, 'Admin');
  }

  switchLanguage(code: string): void {
    this.i18n.use(code);
  }

  toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  closeNav(): void {
    this.navOpen.set(false);
    this.manageOpen.set(false);
  }

  toggleManage(): void {
    this.manageOpen.update((open) => !open);
    this.accountOpen.set(false);
  }

  toggleAccount(): void {
    this.accountOpen.update((open) => !open);
    this.manageOpen.set(false);
  }

  /** Clicking anywhere outside the Manage menu closes it, the way a menu is expected to behave. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.manageOpen() && !target?.closest('.nav-group')) this.manageOpen.set(false);
    if (this.accountOpen() && !target?.closest('.account-menu')) this.accountOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.manageOpen.set(false);
    this.accountOpen.set(false);
    this.navOpen.set(false);
  }

  toggleTheme(): void {
    this.theme.update((current) => {
      if (current === 'light') return 'dark';
      if (current === 'dark') return 'brand';
      return 'light';
    });
  }

  private detectInitialTheme(): 'light' | 'dark' | 'brand' {
    const stored = localStorage.getItem('admin.theme');
    if (stored === 'light' || stored === 'dark' || stored === 'brand') {
      return stored;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
