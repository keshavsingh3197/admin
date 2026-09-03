import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { UserListItem } from '../../core/models/user.models';
import { AvatarComponent } from '../../shared/avatar.component';

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * "Profile info" tab of the Profile page: the picture and the basics (display name, username, phone).
 * Password/2FA and active sessions are their own tabs — this one is just who-you-are, not security.
 */
@Component({
  selector: 'app-profile-info',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AvatarComponent],
  template: `
    <div class="wrap">
      @if (message()) { <div class="banner" [class.ok]="ok()">{{ message() }}</div> }

      @if (me(); as user) {
        <section class="avatar-card">
          <app-avatar [userId]="user.id" [displayName]="user.displayName" [hasAvatar]="user.hasAvatar" [size]="88" />
          <div class="avatar-actions">
            <button class="btn-secondary" type="button" [disabled]="avatarBusy()" (click)="fileInput.click()">
              {{ user.hasAvatar ? 'Change picture' : 'Upload picture' }}
            </button>
            @if (user.hasAvatar) {
              <button class="btn-link-danger" type="button" [disabled]="avatarBusy()" (click)="removeAvatar()">Remove</button>
            }
            <input #fileInput type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden-input"
                   (change)="onFileSelected($event)" />
            <p class="hint">PNG, JPEG, WEBP or GIF, up to 3 MB.</p>
          </div>
        </section>

        <form class="card" (ngSubmit)="save()">
          <label class="field"><span>Display name</span>
            <input class="input" type="text" name="displayName" maxlength="120" required
                   [(ngModel)]="draft.displayName" [disabled]="busy()" /></label>
          <label class="field"><span>Username</span>
            <input class="input" type="text" name="username" maxlength="60" placeholder="(none)"
                   [(ngModel)]="draft.username" [disabled]="busy()" /></label>
          <label class="field"><span>Phone number</span>
            <input class="input" type="tel" name="phone" maxlength="20" placeholder="+15551234567"
                   [(ngModel)]="draft.phoneNumber" [disabled]="busy()" /></label>
          <label class="field"><span>Email</span>
            <input class="input" type="email" [value]="user.email" disabled />
          </label>
          <p class="hint">Email is your sign-in identity and isn't changed here.</p>
          <button class="btn-primary" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save changes' }}</button>
        </form>
      } @else {
        <p class="muted">Loading…</p>
      }
    </div>
  `,
  styles: [`
    .wrap { max-width: 560px; }
    .avatar-card { display: flex; gap: 1.1rem; align-items: center; margin-bottom: 1.5rem; }
    .avatar-actions { display: flex; flex-direction: column; gap: .4rem; align-items: flex-start; }
    .hidden-input { display: none; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; }
    .field { display: block; margin-bottom: .8rem; }
    .field span { display: block; font-size: .82rem; color: var(--muted); margin-bottom: .25rem; }
    .input { width: 100%; box-sizing: border-box; padding: .5rem .65rem; border: 1px solid var(--border);
      border-radius: 7px; background: var(--bg); color: var(--text); font-size: .92rem; font-family: inherit; }
    .input:disabled { opacity: .65; }
    .hint { color: var(--muted); font-size: .78rem; margin: .2rem 0 0; }
    .btn-primary { padding: .55rem 1.1rem; background: var(--brand); color: var(--brand-text); border: none;
      border-radius: 7px; cursor: pointer; font-weight: 600; }
    .btn-primary:disabled { opacity: .6; cursor: default; }
    .btn-secondary { padding: .4rem .85rem; border: 1px solid var(--border); border-radius: 7px; background: var(--bg);
      color: var(--text); cursor: pointer; }
    .btn-link-danger { border: none; background: none; color: var(--danger); cursor: pointer; padding: 0; font-size: .85rem; }
    .banner { padding: .6rem .8rem; border-radius: 7px; margin-bottom: 1rem; background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-border); }
    .banner.ok { background: var(--success-soft); color: var(--success); border-color: var(--success-border); }
    .muted { color: var(--muted); }
  `],
})
export class ProfileInfoComponent implements OnInit {
  private auth = inject(AuthService);
  private users = inject(UsersService);

  readonly me = signal<UserListItem | null>(null);
  readonly busy = signal(false);
  readonly avatarBusy = signal(false);
  readonly message = signal<string | null>(null);
  readonly ok = signal(false);

  draft = { displayName: '', username: '', phoneNumber: '' };

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.users.me().subscribe({
      next: user => {
        this.me.set(user);
        this.draft = { displayName: user.displayName, username: user.username ?? '', phoneNumber: user.phoneNumber ?? '' };
      },
      error: () => this.fail(null, 'Could not load your profile.'),
    });
  }

  save(): void {
    this.busy.set(true);
    this.message.set(null);
    this.users.updateMyProfile({
      displayName: this.draft.displayName.trim(),
      username: this.draft.username.trim() || null,
      phoneNumber: this.draft.phoneNumber.trim() || null,
    }).subscribe({
      next: user => {
        this.busy.set(false);
        this.me.set(user);
        this.auth.applyProfilePatch({ displayName: user.displayName, username: user.username });
        this.ok.set(true);
        this.message.set('Profile saved.');
      },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not save your profile.'); },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (file.size > MAX_AVATAR_BYTES) { this.fail(null, 'Image must be 3 MB or smaller.'); return; }
    if (!ALLOWED_TYPES.has(file.type)) { this.fail(null, 'Image must be PNG, JPEG, WEBP or GIF.'); return; }

    this.avatarBusy.set(true);
    this.message.set(null);
    this.users.uploadMyAvatar(file).subscribe({
      next: user => {
        this.avatarBusy.set(false);
        this.me.set(user);
        this.auth.applyProfilePatch({ hasAvatar: true });
        this.ok.set(true);
        this.message.set('Picture updated.');
      },
      error: (err: HttpErrorResponse) => { this.avatarBusy.set(false); this.fail(err, 'Could not upload that image.'); },
    });
  }

  removeAvatar(): void {
    if (!confirm('Remove your profile picture?')) return;
    this.avatarBusy.set(true);
    this.users.removeMyAvatar().subscribe({
      next: user => {
        this.avatarBusy.set(false);
        this.me.set(user);
        this.auth.applyProfilePatch({ hasAvatar: false });
        this.ok.set(true);
        this.message.set('Picture removed.');
      },
      error: (err: HttpErrorResponse) => { this.avatarBusy.set(false); this.fail(err, 'Could not remove the picture.'); },
    });
  }

  private fail(err: HttpErrorResponse | null, fallback: string): void {
    this.ok.set(false);
    this.message.set(typeof err?.error?.error === 'string' ? err.error.error : fallback);
  }
}
