import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly auth = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly routeLoading = signal(false);
  readonly theme = signal<'light' | 'dark' | 'brand'>(this.detectInitialTheme());

  constructor() {
    effect(() => {
      const nextTheme = this.theme();
      document.body.dataset['theme'] = nextTheme;
      localStorage.setItem('admin.theme', nextTheme);
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
        }
      });
  }

  logout(): void {
    this.auth.logout().subscribe({ next: () => this.router.navigate(['/login']) });
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
