import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from './core/services/auth.service';
import { AnalyticsService } from './core/services/analytics.service';
import { ChatService } from './core/services/chat.service';
import { CallService } from './core/services/call.service';
import { CallOverlayComponent } from './features/messages/call-overlay.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CallOverlayComponent],
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

  readonly routeLoading = signal(false);
  readonly navOpen = signal(false);
  readonly theme = signal<'light' | 'dark' | 'brand'>(this.detectInitialTheme());

  constructor() {
    effect(() => {
      const nextTheme = this.theme();
      document.body.dataset['theme'] = nextTheme;
      localStorage.setItem('admin.theme', nextTheme);
    });

    // Hold the chat hub open for the whole session (not just the Messages page) so incoming
    // messages and calls arrive wherever the user is. Both calls are idempotent.
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
