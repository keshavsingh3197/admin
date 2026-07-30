import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UsersService } from '../../core/services/users.service';
import { AuthService } from '../../core/services/auth.service';
import { CreateUserRequest, UserListItem } from '../../core/models/user.models';
import { Role } from '../../core/models/auth.models';

/**
 * User & role management for the identity provider (Admin only). Creating, deactivating,
 * resetting or deleting a user takes effect across every *.keshavsingh.in app, since they all
 * trust the tokens minted here.
 */
@Component({
  selector: 'app-users',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="users-wrap">
      <div class="head">
        <h1 class="page-title">Users &amp; Roles</h1>
        <button class="btn-primary" type="button" (click)="toggleCreate()">
          {{ showCreate() ? 'Cancel' : '+ New user' }}
        </button>
      </div>

      @if (message()) { <div class="banner" [class.ok]="ok()">{{ message() }}</div> }

      @if (showCreate()) {
        <form class="card create" (ngSubmit)="create()">
          <div class="grid">
            <label class="field"><span>Email</span>
              <input class="input" type="email" name="cEmail" [(ngModel)]="cEmail" required /></label>
            <label class="field"><span>Display name</span>
              <input class="input" type="text" name="cName" [(ngModel)]="cName" required /></label>
            <label class="field"><span>Username (optional)</span>
              <input class="input" type="text" name="cUser" [(ngModel)]="cUsername" /></label>
            <label class="field"><span>Phone (optional, E.164)</span>
              <input class="input" type="text" name="cPhone" [(ngModel)]="cPhone" /></label>
            <label class="field"><span>Temporary password (min 12)</span>
              <input class="input" type="text" name="cPw" [(ngModel)]="cPassword" required /></label>
          </div>
          <div class="roles">
            <span class="roles-label">Roles:</span>
            @for (r of allRoles(); track r) {
              <label class="chk"><input type="checkbox" [checked]="cRoles.has(r)" (change)="toggleRole(cRoles, r)" /> {{ r }}</label>
            }
          </div>
          <button class="btn-primary" type="submit" [disabled]="busy() || !cEmail || !cName || cPassword.length < 12">
            {{ busy() ? 'Creating…' : 'Create user' }}
          </button>
        </form>
      }

      @if (loading()) {
        <p>Loading…</p>
      } @else {
        <div class="table-scroll">
          <table class="tbl">
            <thead>
              <tr><th>Email</th><th>Name</th><th>Roles</th><th>Status</th><th>2FA</th><th>Last login</th><th></th></tr>
            </thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr [class.inactive]="!u.isActive">
                  <td>{{ u.email }}</td>
                  <td>{{ u.displayName }}</td>
                  <td>@for (r of u.roles; track r) { <span class="badge">{{ r }}</span> }</td>
                  <td>{{ u.isActive ? 'Active' : 'Disabled' }}</td>
                  <td>{{ u.twoFactorEnabled ? '✓' : '—' }}</td>
                  <td>{{ u.lastLoginAt ? (u.lastLoginAt | date:'short') : 'never' }}</td>
                  <td><button class="linkish" type="button" (click)="edit(u)">Edit</button></td>
                </tr>

                @if (editId() === u.id) {
                  <tr class="edit-row"><td colspan="7">
                    <div class="edit-panel">
                      <div class="roles">
                        <span class="roles-label">Roles:</span>
                        @for (r of allRoles(); track r) {
                          <label class="chk"><input type="checkbox" [checked]="eRoles.has(r)" (change)="toggleRole(eRoles, r)" /> {{ r }}</label>
                        }
                        <button class="btn-secondary" type="button" [disabled]="busy()" (click)="saveRoles(u)">Save roles</button>
                      </div>
                      <div class="actions">
                        <button class="btn-secondary" type="button" [disabled]="busy()" (click)="toggleActive(u)">
                          {{ u.isActive ? 'Deactivate' : 'Activate' }}
                        </button>
                        <span class="reset">
                          <input class="input sm" type="text" placeholder="New password (min 12)" [(ngModel)]="resetPw" name="rpw" />
                          <button class="btn-secondary" type="button" [disabled]="busy() || resetPw.length < 12" (click)="reset(u)">Reset password</button>
                        </span>
                        <button class="btn-danger" type="button" [disabled]="busy() || u.id === selfId()" (click)="remove(u)">Delete</button>
                      </div>
                    </div>
                  </td></tr>
                }
              }
              @if (!users().length) { <tr><td colspan="7">No users.</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .users-wrap { max-width: 960px; margin: 0 auto; padding: 1rem; }
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
    .page-title { font-size: 1.5rem; margin: 0; }
    .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; }
    .field span { display: block; margin-bottom: 0.3rem; font-size: 0.8rem; color: #444; }
    .input { width: 100%; padding: 0.5rem 0.6rem; border: 1px solid #ccc; border-radius: 6px; font-size: 0.95rem; }
    .input.sm { width: auto; display: inline-block; }
    .input:focus { outline: none; border-color: #1a73e8; box-shadow: 0 0 0 2px #e8f0fe; }
    .roles { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin: 0.9rem 0; }
    .roles-label { font-size: 0.85rem; color: #444; }
    .chk { font-size: 0.9rem; }
    .btn-primary { padding: 0.5rem 1rem; background: #1a73e8; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled, .btn-secondary:disabled, .btn-danger:disabled { opacity: 0.55; cursor: default; }
    .btn-secondary { padding: 0.45rem 0.8rem; background: #f1f3f4; color: #202124; border: 1px solid #dadce0; border-radius: 6px; cursor: pointer; }
    .btn-danger { padding: 0.45rem 0.8rem; background: #d93025; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
    .table-scroll { overflow-x: auto; }
    .tbl { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; }
    .tbl th, .tbl td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid #eee; font-size: 0.9rem; }
    .tbl th { background: #f8f9fa; font-weight: 600; }
    tr.inactive td { color: #999; }
    .badge { display: inline-block; background: #e8f0fe; color: #1a73e8; border-radius: 10px; padding: 0.1rem 0.55rem; font-size: 0.78rem; margin-right: 0.3rem; }
    .linkish { background: none; border: none; color: #1a73e8; cursor: pointer; }
    .edit-row td { background: #fafafa; }
    .edit-panel { display: flex; flex-direction: column; gap: 0.75rem; }
    .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
    .reset { display: inline-flex; align-items: center; gap: 0.4rem; }
    .banner { background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c3; border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; }
    .banner.ok { background: #e6f4ea; color: #137333; border-color: #b7e1c4; }
  `]
})
export class UsersComponent implements OnInit {
  private api = inject(UsersService);
  private auth = inject(AuthService);

  readonly users = signal<UserListItem[]>([]);
  readonly allRoles = signal<Role[]>(['Admin', 'Editor', 'Viewer']);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly ok = signal(false);

  readonly showCreate = signal(false);
  cEmail = ''; cName = ''; cUsername = ''; cPhone = ''; cPassword = '';
  readonly cRoles = new Set<Role>(['Viewer']);

  readonly editId = signal<string | null>(null);
  readonly eRoles = new Set<Role>();
  resetPw = '';

  selfId(): string | undefined { return this.auth.user()?.id; }

  ngOnInit(): void {
    this.reload();
    this.api.roles().subscribe({ next: r => this.allRoles.set(r), error: () => {} });
  }

  private reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: list => { this.users.set(list); this.loading.set(false); },
      error: (err: HttpErrorResponse) => { this.loading.set(false); this.fail(err, 'Could not load users.'); },
    });
  }

  toggleCreate(): void { this.showCreate.update(v => !v); }

  toggleRole(set: Set<Role>, role: Role): void {
    set.has(role) ? set.delete(role) : set.add(role);
  }

  create(): void {
    if (!this.cEmail || !this.cName || this.cPassword.length < 12) return;
    const req: CreateUserRequest = {
      email: this.cEmail.trim(),
      displayName: this.cName.trim(),
      username: this.cUsername.trim() || null,
      phoneNumber: this.cPhone.trim() || null,
      password: this.cPassword,
      roles: [...this.cRoles],
    };
    this.busy.set(true);
    this.api.create(req).subscribe({
      next: () => {
        this.busy.set(false);
        this.showCreate.set(false);
        this.cEmail = this.cName = this.cUsername = this.cPhone = this.cPassword = '';
        this.cRoles.clear(); this.cRoles.add('Viewer');
        this.succeed('User created.');
        this.reload();
      },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not create user.'); },
    });
  }

  edit(u: UserListItem): void {
    if (this.editId() === u.id) { this.editId.set(null); return; }
    this.eRoles.clear();
    u.roles.forEach(r => this.eRoles.add(r));
    this.resetPw = '';
    this.editId.set(u.id);
  }

  saveRoles(u: UserListItem): void {
    this.busy.set(true);
    this.api.update(u.id, { roles: [...this.eRoles] }).subscribe({
      next: () => { this.busy.set(false); this.succeed('Roles updated.'); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not update roles.'); },
    });
  }

  toggleActive(u: UserListItem): void {
    this.busy.set(true);
    this.api.update(u.id, { isActive: !u.isActive }).subscribe({
      next: () => { this.busy.set(false); this.succeed(u.isActive ? 'User deactivated.' : 'User activated.'); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not update user.'); },
    });
  }

  reset(u: UserListItem): void {
    if (this.resetPw.length < 12) return;
    this.busy.set(true);
    this.api.resetPassword(u.id, this.resetPw).subscribe({
      next: () => { this.busy.set(false); this.resetPw = ''; this.succeed('Password reset; user must change it at next sign-in.'); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not reset password.'); },
    });
  }

  remove(u: UserListItem): void {
    if (u.id === this.selfId()) return;
    this.busy.set(true);
    this.api.remove(u.id).subscribe({
      next: () => { this.busy.set(false); this.editId.set(null); this.succeed('User deleted.'); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not delete user.'); },
    });
  }

  private succeed(msg: string): void { this.ok.set(true); this.message.set(msg); }
  private fail(err: HttpErrorResponse, fallback: string): void {
    this.ok.set(false);
    this.message.set(typeof err.error?.error === 'string' ? err.error.error : fallback);
  }
}
