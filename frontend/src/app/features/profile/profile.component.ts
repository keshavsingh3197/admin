import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AvatarComponent } from '../../shared/avatar.component';

/**
 * The self-service account area: one page instead of three separate nav entries (Profile info,
 * Security & 2FA, Active sessions used to each be their own top-level route). Same shell pattern as
 * Inbox — a segmented switch over the tabs, each tab still its own routed component underneath.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, AvatarComponent],
  template: `
    <div class="profile">
      <header class="head">
        @if (auth.user(); as user) {
          <app-avatar [userId]="user.id" [displayName]="user.displayName" [hasAvatar]="!!user.hasAvatar" [size]="52" />
          <div><h1>{{ user.displayName }}</h1><p class="muted">{{ user.email }}</p></div>
        }
      </header>

      <nav class="tabs" aria-label="Profile sections">
        <a routerLink="info" routerLinkActive="on"><span aria-hidden="true">🙂</span> Profile info</a>
        <a routerLink="security" routerLinkActive="on"><span aria-hidden="true">🔐</span> Security &amp; 2FA</a>
        <a routerLink="sessions" routerLinkActive="on"><span aria-hidden="true">▣</span> Active sessions</a>
      </nav>

      <div class="body"><router-outlet /></div>
    </div>
  `,
  styles: [`
    .profile { padding: 1.25rem 1.5rem; max-width: 900px; margin: 0 auto; }
    .head { display: flex; align-items: center; gap: .9rem; margin-bottom: 1rem; }
    .head h1 { margin: 0; font-size: 1.4rem; }
    .muted { color: var(--muted); margin: .15rem 0 0; font-size: .88rem; }
    .tabs { display: flex; gap: .3rem; flex-wrap: wrap; border-bottom: 1px solid var(--border); padding-bottom: .75rem; margin-bottom: 1.25rem; }
    .tabs a { display: inline-flex; align-items: center; gap: .4rem; text-decoration: none; border: 1px solid var(--border);
      border-radius: 99px; padding: .35rem .85rem; color: var(--muted); background: var(--bg); font-size: .86rem; }
    .tabs a:hover { color: var(--text); }
    .tabs a.on { background: var(--brand); color: var(--brand-text); border-color: transparent; font-weight: 600; }
    @media (max-width: 560px) { .profile { padding: 1rem; } }
  `],
})
export class ProfileComponent {
  protected readonly auth = inject(AuthService);
}
