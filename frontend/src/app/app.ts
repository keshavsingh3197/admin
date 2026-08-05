import { Component, DestroyRef, HostListener, effect, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from './core/services/auth.service';
import { AnalyticsService } from './core/services/analytics.service';
import { ChatService } from './core/services/chat.service';
import { CallService } from './core/services/call.service';
import { CallOverlayComponent } from './features/messages/call-overlay.component';
import { MeetingReminderComponent } from './features/meetings/meeting-reminder.component';

interface NavLink {
  path: string;
  label: string;
  icon: string;
  exact: boolean;
}

/**
 * Everyday pages stay on the bar; admin pages live behind the Manage menu (see app.html).
 * There is no Dashboard entry — the 🏠 brand on the left is the link home.
 */
const PRIMARY_LINKS: NavLink[] = [
  { path: '/messages', label: 'Messages', icon: '💬', exact: false },
  // Strangers on the public sites, kept apart from Messages (which is people with accounts).
  { path: '/visitor-chat', label: 'Visitors', icon: '🙋', exact: false },
  { path: '/meetings', label: 'Meetings', icon: '📅', exact: false },
  { path: '/notes', label: 'Notes', icon: '📝', exact: false },
  { path: '/files', label: 'Files', icon: '📁', exact: false },
  { path: '/finance', label: 'Finance', icon: '💰', exact: false },
  { path: '/security', label: 'Security', icon: '🔐', exact: false },
];

const ADMIN_LINKS: NavLink[] = [
  { path: '/contact-inbox', label: 'Contact inbox', icon: '✉️', exact: false },
  { path: '/website', label: 'Websites', icon: '🌐', exact: false },
  { path: '/database', label: 'Database', icon: '🗃️', exact: false },
  { path: '/users', label: 'Users', icon: '👤', exact: false },
  { path: '/groups', label: 'Groups', icon: '👪', exact: false },
  { path: '/roles', label: 'Roles', icon: '🎫', exact: false },
  { path: '/messages/moderation', label: 'Chat moderation', icon: '🛡️', exact: false },
  { path: '/analytics', label: 'Analytics', icon: '📊', exact: false },
  { path: '/data-retention', label: 'Data retention', icon: '🗄️', exact: false },
  { path: '/health', label: 'Health', icon: '❤️', exact: false },
  { path: '/settings', label: 'Settings', icon: '⚙️', exact: false },
];

type UiMode = 'modern' | 'basic';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CallOverlayComponent, MeetingReminderComponent],
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

  readonly primaryLinks = PRIMARY_LINKS;
  readonly adminLinks = ADMIN_LINKS;

  readonly routeLoading = signal(false);
  readonly navOpen = signal(false);
  readonly manageOpen = signal(false);
  readonly theme = signal<'light' | 'dark' | 'brand'>(this.detectInitialTheme());
  /** Visual density/styling: "modern" is elevated and rounded, "basic" is flat and compact. */
  readonly uiMode = signal<UiMode>(this.detectInitialUiMode());

  constructor() {
    effect(() => {
      const nextTheme = this.theme();
      document.body.dataset['theme'] = nextTheme;
      localStorage.setItem('admin.theme', nextTheme);
    });

    effect(() => {
      const mode = this.uiMode();
      document.body.dataset['ui'] = mode;
      localStorage.setItem('admin.ui', mode);
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

  toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  closeNav(): void {
    this.navOpen.set(false);
    this.manageOpen.set(false);
  }

  toggleManage(): void {
    this.manageOpen.update((open) => !open);
  }

  /** Clicking anywhere outside the Manage menu closes it, the way a menu is expected to behave. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.manageOpen()) return;
    if (!(event.target as HTMLElement)?.closest('.nav-group')) this.manageOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.manageOpen.set(false);
    this.navOpen.set(false);
  }

  toggleTheme(): void {
    this.theme.update((current) => {
      if (current === 'light') return 'dark';
      if (current === 'dark') return 'brand';
      return 'light';
    });
  }

  toggleUiMode(): void {
    this.uiMode.update((current) => (current === 'modern' ? 'basic' : 'modern'));
  }

  private detectInitialTheme(): 'light' | 'dark' | 'brand' {
    const stored = localStorage.getItem('admin.theme');
    if (stored === 'light' || stored === 'dark' || stored === 'brand') {
      return stored;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private detectInitialUiMode(): UiMode {
    return localStorage.getItem('admin.ui') === 'basic' ? 'basic' : 'modern';
  }
}
