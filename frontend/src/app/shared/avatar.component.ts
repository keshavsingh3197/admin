import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { UsersService } from '../core/services/users.service';

/**
 * A user's profile picture, or their initials on a brand-tinted circle if they have none / it hasn't
 * loaded yet. Avatars are private blobs (`GET /api/users/{id}/avatar`, bearer-authenticated), so this
 * fetches the bytes itself and renders an object URL rather than taking a plain `src` — the same
 * pattern already used for chat attachment previews.
 */
@Component({
  selector: 'app-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl(); as url) {
      <img class="avatar" [style.width.px]="size()" [style.height.px]="size()" [src]="url" [alt]="displayName()" />
    } @else {
      <span class="avatar initials" [style.width.px]="size()" [style.height.px]="size()"
            [style.fontSize.px]="size() / 2.4">{{ initials() }}</span>
    }
  `,
  styles: [`
    .avatar { border-radius: 50%; object-fit: cover; display: inline-flex; flex: none; }
    .initials { align-items: center; justify-content: center; background: var(--brand); color: var(--brand-text); font-weight: 700; }
  `],
})
export class AvatarComponent {
  private users = inject(UsersService);
  private destroyRef = inject(DestroyRef);

  readonly userId = input<string | null | undefined>(null);
  readonly displayName = input('');
  /** Skip the fetch entirely when the caller already knows there's no avatar (e.g. a list row). */
  readonly hasAvatar = input(true);
  readonly size = input(36);

  readonly imageUrl = signal<string | null>(null);
  private objectUrl: string | null = null;

  constructor() {
    effect(() => {
      const id = this.userId();
      const has = this.hasAvatar();
      this.release();
      if (!id || !has) { this.imageUrl.set(null); return; }
      this.users.avatarBlob(id).subscribe({
        next: blob => { this.objectUrl = URL.createObjectURL(blob); this.imageUrl.set(this.objectUrl); },
        error: () => this.imageUrl.set(null),
      });
    });
    this.destroyRef.onDestroy(() => this.release());
  }

  initials(): string {
    const parts = this.displayName().trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return ((parts[0][0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  private release(): void {
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
  }
}
