import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BrandDataTableComponent, BrandModalComponent, BrandTableColumn } from '@keshavsingh3197/web-ui';
import { UsersService } from '../../core/services/users.service';
import { AuthService } from '../../core/services/auth.service';
import { RbacService } from '../../core/services/rbac.service';
import { scopedRoleKeys } from '../../core/services/rbac-scope.util';
import { CreateUserRequest, UserListItem } from '../../core/models/user.models';
import { CustomRoleView, GroupView } from '../../core/models/rbac.models';
import { Role } from '../../core/models/auth.models';

/**
 * User & role management for the identity provider (Admin only). Creating, deactivating,
 * resetting or deleting a user takes effect across every *.keshavsingh.in app, since they all
 * trust the tokens minted here.
 */
@Component({
  selector: 'app-users',
  imports: [FormsModule, DatePipe, RouterLink, BrandDataTableComponent, BrandModalComponent],
  template: `
    <div class="users-wrap">
      <div class="head">
        <h1 class="page-title">Users &amp; Roles</h1>
        <button class="btn-primary" type="button" (click)="showCreate.set(true)">+ New user</button>
      </div>

      @if (appFilter(); as app) {
        <div class="scope-chip">Scoped to website: <strong>{{ app }}</strong>
          <a routerLink="/users">✕ clear</a></div>
      }

      @if (message()) { <div class="banner" [class.ok]="ok()">{{ message() }}</div> }

      <brand-modal [open]="showCreate()" heading="New user" (closed)="showCreate.set(false)">
        <form class="create" (ngSubmit)="create()">
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
      </brand-modal>

      @if (loading()) {
        <p>Loading…</p>
      } @else {
        <brand-data-table [columns]="columns" [rows]="visibleUsers()" [trackBy]="trackById"
                           searchPlaceholder="Search users…">
          <ng-template let-u>
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
                  <div class="roles">
                    <span class="roles-label">Custom roles:</span>
                    @for (r of customRoles(); track r.id) {
                      <label class="chk"><input type="checkbox" [checked]="eCustomRoles.has(r.key)" (change)="toggleCustomRole(r.key)" /> {{ r.name }}</label>
                    }
                    @if (!customRoles().length) { <span class="muted-inline">None defined yet — create one on the Roles page.</span> }
                    <button class="btn-secondary" type="button" [disabled]="busy()" (click)="saveCustomRoles(u)">Save custom roles</button>
                  </div>
                  <div class="roles">
                    <span class="roles-label">Groups:</span>
                    @for (g of groups(); track g.id) {
                      <label class="chk"><input type="checkbox" [checked]="eGroups.has(g.id)" (change)="toggleGroup(u, g)" /> {{ g.name }}</label>
                    }
                    @if (!groups().length) { <span class="muted-inline">None defined yet — create one on the Groups page.</span> }
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
          </ng-template>
          <span table-empty>No users match these filters.</span>
        </brand-data-table>
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
    td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid #eee; font-size: 0.9rem; }
    tr.inactive td { color: #999; }
    .badge { display: inline-block; background: #e8f0fe; color: #1a73e8; border-radius: 10px; padding: 0.1rem 0.55rem; font-size: 0.78rem; margin-right: 0.3rem; }
    .linkish { background: none; border: none; color: #1a73e8; cursor: pointer; }
    .edit-row td { background: #fafafa; }
    .edit-panel { display: flex; flex-direction: column; gap: 0.75rem; }
    .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
    .reset { display: inline-flex; align-items: center; gap: 0.4rem; }
    .banner { background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c3; border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; }
    .banner.ok { background: #e6f4ea; color: #137333; border-color: #b7e1c4; }
    .muted-inline { font-size: 0.85rem; color: #999; }
    .scope-chip { display: flex; align-items: center; gap: 0.5rem; background: color-mix(in srgb, var(--brand, #1a73e8) 10%, #fff); border: 1px solid color-mix(in srgb, var(--brand, #1a73e8) 30%, #e0e0e0); border-radius: 8px; padding: 0.5rem 0.8rem; margin-bottom: 1rem; font-size: 0.86rem; }
    .scope-chip a { color: #1a73e8; text-decoration: none; margin-left: auto; }
  `]
})
export class UsersComponent implements OnInit {
  private api = inject(UsersService);
  private auth = inject(AuthService);
  private rbac = inject(RbacService);
  private route = inject(ActivatedRoute);

  readonly users = signal<UserListItem[]>([]);
  readonly allRoles = signal<Role[]>(['Admin', 'Editor', 'Viewer']);
  readonly customRoles = signal<CustomRoleView[]>([]);
  readonly groups = signal<GroupView[]>([]);
  /** Set from the `?app=` query param when reached via a Websites-page drill-through link. */
  readonly appFilter = signal<string | null>(null);
  readonly visibleUsers = computed(() => {
    const app = this.appFilter();
    if (!app) return this.users();
    const roleKeys = scopedRoleKeys(this.customRoles(), app);
    const groupIds = new Set(this.groups().filter(g => g.roleKeys.some(k => roleKeys.has(k))).map(g => g.id));
    return this.users().filter(u =>
      u.roles.includes('Admin') ||
      u.customRoleKeys.some(k => roleKeys.has(k)) ||
      u.groupIds.some(id => groupIds.has(id)));
  });
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly ok = signal(false);

  readonly showCreate = signal(false);
  cEmail = ''; cName = ''; cUsername = ''; cPhone = ''; cPassword = '';
  readonly cRoles = new Set<Role>(['Viewer']);

  readonly editId = signal<string | null>(null);
  readonly eRoles = new Set<Role>();
  readonly eCustomRoles = new Set<string>();
  readonly eGroups = new Set<string>();
  resetPw = '';

  readonly columns: BrandTableColumn<UserListItem>[] = [
    { key: 'email', label: 'Email', value: u => u.email, sortable: true },
    { key: 'displayName', label: 'Name', value: u => u.displayName, sortable: true },
    { key: 'roles', label: 'Roles', value: u => u.roles.join(', '), filterable: true },
    { key: 'status', label: 'Status', value: u => u.isActive ? 'Active' : 'Disabled', filterable: true },
    { key: 'twoFactor', label: '2FA', value: u => u.twoFactorEnabled ? 'Enabled' : 'Disabled', filterable: true },
    { key: 'lastLogin', label: 'Last login', value: u => u.lastLoginAt ?? '', sortable: true },
    { key: 'actions', label: '' },
  ];

  trackById = (u: UserListItem) => u.id;

  selfId(): string | undefined { return this.auth.user()?.id; }

  ngOnInit(): void {
    this.appFilter.set(this.route.snapshot.queryParamMap.get('app'));
    this.reload();
    this.api.roles().subscribe({ next: r => this.allRoles.set(r), error: () => {} });
    this.rbac.listRoles().subscribe({ next: r => this.customRoles.set(r), error: () => {} });
    this.rbac.listGroups().subscribe({ next: g => this.groups.set(g), error: () => {} });
  }

  private reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: list => { this.users.set(list); this.loading.set(false); },
      error: (err: HttpErrorResponse) => { this.loading.set(false); this.fail(err, 'Could not load users.'); },
    });
  }

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
    this.eCustomRoles.clear();
    u.customRoleKeys.forEach(k => this.eCustomRoles.add(k));
    this.eGroups.clear();
    u.groupIds.forEach(id => this.eGroups.add(id));
    this.resetPw = '';
    this.editId.set(u.id);
  }

  toggleCustomRole(key: string): void {
    this.eCustomRoles.has(key) ? this.eCustomRoles.delete(key) : this.eCustomRoles.add(key);
  }

  saveCustomRoles(u: UserListItem): void {
    this.busy.set(true);
    this.api.update(u.id, { customRoleKeys: [...this.eCustomRoles] }).subscribe({
      next: () => { this.busy.set(false); this.succeed('Custom roles updated.'); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not update custom roles.'); },
    });
  }

  toggleGroup(u: UserListItem, g: GroupView): void {
    this.busy.set(true);
    const wasMember = this.eGroups.has(g.id);
    const obs = wasMember ? this.rbac.removeMember(g.id, u.id) : this.rbac.addMember(g.id, u.id);
    obs.subscribe({
      next: () => {
        this.busy.set(false);
        wasMember ? this.eGroups.delete(g.id) : this.eGroups.add(g.id);
        this.succeed(wasMember ? 'Removed from group.' : 'Added to group.');
        this.rbac.listGroups().subscribe({ next: gs => this.groups.set(gs), error: () => {} });
        this.reload();
      },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not update group membership.'); },
    });
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
