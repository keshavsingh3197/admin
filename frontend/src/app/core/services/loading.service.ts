import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';

/**
 * Tracks active foreground HTTP requests and Angular lazy route transitions across
 * the Admin Console. Raises `slow` after 2.2s so cold starts on hosted API/DB
 * services explain what is happening rather than appearing hung.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly httpCount = signal(0);
  private readonly navigating = signal(false);
  private readonly slowTimer = signal<ReturnType<typeof setTimeout> | null>(null);
  private readonly elapsedTimer = signal<ReturnType<typeof setInterval> | null>(null);
  private readonly dismissed = signal(false);
  private startedAt = 0;

  readonly active = computed(() => this.httpCount() > 0 || this.navigating());
  readonly slow = signal(false);
  readonly elapsedSec = signal(0);
  readonly reason = computed<'route' | 'api'>(() =>
    this.navigating() && this.httpCount() === 0 ? 'route' : 'api',
  );

  constructor() {
    const sub = this.router.events.subscribe((ev) => {
      if (ev instanceof NavigationStart) this.setNavigating(true);
      else if (
        ev instanceof NavigationEnd
        || ev instanceof NavigationCancel
        || ev instanceof NavigationError
      ) {
        this.setNavigating(false);
      }
    });

    this.destroyRef.onDestroy(() => {
      sub.unsubscribe();
      this.clearTimers();
    });
  }

  beginHttp(): () => void {
    let closed = false;
    this.httpCount.update((n) => n + 1);
    this.syncTimers();
    return () => {
      if (closed) return;
      closed = true;
      this.httpCount.update((n) => Math.max(0, n - 1));
      this.syncTimers();
    };
  }

  dismissSlow(): void {
    this.dismissed.set(true);
    this.slow.set(false);
  }

  private setNavigating(value: boolean): void {
    this.navigating.set(value);
    this.syncTimers();
  }

  private syncTimers(): void {
    if (!this.active()) {
      this.clearTimers();
      this.slow.set(false);
      this.elapsedSec.set(0);
      this.dismissed.set(false);
      this.startedAt = 0;
      return;
    }

    if (this.startedAt === 0) {
      this.startedAt = Date.now();
    }

    if (!this.slowTimer() && !this.dismissed()) {
      const id = setTimeout(() => {
        if (this.active() && !this.dismissed()) {
          this.slow.set(true);
          this.elapsedSec.set(Math.max(2, Math.floor((Date.now() - this.startedAt) / 1000)));
        }
      }, 2200);
      this.slowTimer.set(id);
    }

    if (!this.elapsedTimer()) {
      const id = setInterval(() => {
        if (!this.active()) return;
        this.elapsedSec.set(Math.floor((Date.now() - this.startedAt) / 1000));
      }, 1000);
      this.elapsedTimer.set(id);
    }
  }

  private clearTimers(): void {
    const st = this.slowTimer();
    if (st) {
      clearTimeout(st);
      this.slowTimer.set(null);
    }
    const et = this.elapsedTimer();
    if (et) {
      clearInterval(et);
      this.elapsedTimer.set(null);
    }
  }
}
