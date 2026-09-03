import { Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
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
import { RbacService } from './core/services/rbac.service';
import { CONFIG_KEYS } from './core/models/config.models';
import { CallOverlayComponent } from './features/messages/call-overlay.component';
import { MeetingReminderComponent } from './features/meetings/meeting-reminder.component';
import { AvatarComponent } from './shared/avatar.component';
import { CommandPaletteComponent } from './shared/command-palette.component';
import { NAV_GROUPS, NavGroup, NavLink } from './core/models/navigation';

/**
 * The application shell: a grouped sidebar, a context topbar, and the routed page.
 *
 * <para>It was a horizontal header until the app outgrew it. With 27 feature areas, six fitted on
 * the bar and the other twelve lived behind a single "Manage" dropdown — so over half the product
 * was two clicks deep and invisible until you went looking. A vertical sidebar has room to show
 * every page the user can reach, grouped by what it is for, and {@link NAV_GROUPS} is the one place
 * that grouping is declared.</para>
 */
@Component({
  selector: 'app-root',
  // FormsModule: the language picker in the topbar is an ngModel-bound <select>.
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, FormsModule,
    CallOverlayComponent, MeetingReminderComponent, AvatarComponent, CommandPaletteComponent,
  ],
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
  private rbac = inject(RbacService);
  protected readonly keys = CONFIG_KEYS;

  /** This user's `page.*` grants (see PermissionCatalog) — Admin role sees everything regardless. */
  readonly pagePermissions = signal<string[]>([]);
  /** True once the permissions fetch for the current identity has settled (success or failure) — so
   *  the "no access to this app" screen never flashes for a legitimate user still loading. */
  readonly permissionsLoaded = signal(false);
  /** Set from `?denied=<page.key>`, left by `pagePermissionGuard` when it turns back a nav attempt. */
  readonly accessDeniedMessage = signal<string | null>(null);
  /** Current URL, tracked so the topbar can name the page and the palette can highlight it. */
  private readonly currentUrl = signal('/');

  /**
   * A signed-in identity with the Admin role, or at least one granted `page.*` key, has SOME reason to
   * be in this app. Everyone else — someone who only has a role/grant on another *.keshavsingh.in site
   * — is signed in (SSO is shared by design) but has no business inside the admin console itself, so
   * they see a plain "no access" screen instead of a launcher with every link hidden.
   */
  readonly hasAppAccess = computed(() =>
    this.auth.hasRole('Admin') || this.pagePermissions().length > 0);

  /**
   * The nav, filtered to what this identity can actually open, with any group left empty dropped.
   * Filtering here (rather than rendering a link that 403s) is the same rule the route guards apply
   * server-side — this is presentation of that decision, never the decision itself.
   */
  readonly visibleGroups = computed<NavGroup[]>(() => {
    const isAdmin = this.auth.hasRole('Admin');
    const granted = this.pagePermissions();
    // Both gates, in the order the router applies them: an Admin-only route is Admin-only whatever
    // page grants the identity holds, and a granted route needs its key. A link with neither is
    // open to anyone signed in.
    const allowed = (link: NavLink) =>
      isAdmin || (!link.adminOnly && (!link.permissionKey || granted.includes(link.permissionKey)));
    return NAV_GROUPS
      .map(group => ({ ...group, links: group.links.filter(allowed) }))
      .filter(group => group.links.length > 0);
  });

  /** Flattened, for the command palette and for naming the current page. */
  readonly visibleLinks = computed<NavLink[]>(() => this.visibleGroups().flatMap(g => g.links));

  /** The active page's label, shown in the topbar so the page always announces itself. */
  readonly currentPageLabel = computed(() => {
    const url = this.currentUrl().split('?')[0];
    // Longest matching path wins, so /finance/accounts resolves to Finance and not to /.
    const match = this.visibleLinks()
      .filter(link => url === link.path || url.startsWith(link.path + '/'))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return match ? this.i18n.t(match.labelKey) : this.i18n.t('admin.nav.dashboard');
  });

  readonly routeLoading = signal(false);
  /** Mobile drawer. Distinct from `sidebarCollapsed`, which is the desktop rail. */
  readonly navOpen = signal(false);
  readonly accountOpen = signal(false);
  readonly paletteOpen = signal(false);
  readonly sidebarCollapsed = signal(localStorage.getItem('admin.sidebar') === 'collapsed');
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

    effect(() => {
      localStorage.setItem('admin.sidebar', this.sidebarCollapsed() ? 'collapsed' : 'expanded');
    });

    // Hold the chat hub open for the whole session (not just the Messages page) so incoming
    // messages, calls and meeting reminders arrive wherever the user is. Both calls are idempotent.
    effect(() => {
      if (this.auth.isAuthenticated()) void this.chat.connect();
      else void this.chat.disconnect();
    });

    // Which nav items to show — hides a page a non-Admin has no grant for, rather than showing a
    // link that 403s. Re-fetched whenever the signed-in identity changes (login/logout/switch).
    effect(() => {
      if (!this.auth.isAuthenticated()) { this.pagePermissions.set([]); this.permissionsLoaded.set(false); return; }
      this.rbac.me().subscribe({
        next: access => { this.pagePermissions.set(access.adminPermissions); this.permissionsLoaded.set(true); },
        error: () => { this.pagePermissions.set([]); this.permissionsLoaded.set(true); },
      });
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
          this.accountOpen.set(false);
        }

        // Track this admin app itself as a website in Analytics, same as the external sites.
        if (event instanceof NavigationEnd) {
          this.currentUrl.set(event.urlAfterRedirects);
          this.analytics
            .trackVisit({ websiteKey: 'admin', path: event.urlAfterRedirects })
            .subscribe({ error: () => {} });

          const denied = this.router.parseUrl(event.urlAfterRedirects).queryParamMap.get('denied');
          this.accessDeniedMessage.set(denied ? this.labelForPermission(denied) : null);
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

  /**
   * A section heading, falling back to the compiled-in English. `I18nService.t` returns the KEY when
   * a string is missing, which would print "admin.nav.group.workspace" in the sidebar before the
   * catalogue loads — so an unresolved key is treated as no translation at all.
   */
  groupLabel(group: NavGroup): string {
    const text = this.i18n.t(group.labelKey);
    return text === group.labelKey ? group.fallback : text;
  }

  /** A human label for a denied `page.*` key, for the access-denied banner — falls back to the raw key. */
  private labelForPermission(permissionKey: string): string {
    const link = NAV_GROUPS.flatMap(g => g.links).find(l => l.permissionKey === permissionKey);
    return link ? this.i18n.t(link.labelKey) : permissionKey;
  }

  dismissAccessDenied(): void {
    this.accessDeniedMessage.set(null);
  }

  switchLanguage(code: string): void {
    this.i18n.use(code);
  }

  toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  closeNav(): void {
    this.navOpen.set(false);
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  toggleAccount(): void {
    this.accountOpen.update((open) => !open);
  }

  openPalette(): void {
    this.paletteOpen.set(true);
  }

  /**
   * Ctrl/Cmd-K opens the command palette from anywhere. Bound on the document rather than the shell
   * element so it still fires while focus is inside a routed page.
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.auth.isAuthenticated() && this.hasAppAccess()) this.paletteOpen.set(true);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.accountOpen() && !target?.closest('.account-menu')) this.accountOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
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

    // Guarded: `matchMedia` is absent in a test DOM and in any non-browser render, and a missing
    // OS preference is not a reason for the shell to fail to construct.
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
