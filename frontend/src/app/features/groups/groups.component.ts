import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RbacService } from '../../core/services/rbac.service';
import { UsersService } from '../../core/services/users.service';
import {
  CustomRoleView,
  EffectiveAccess,
  GroupView,
  PermissionCatalogItem,
  UpsertGroupRequest,
  WebsiteAccessOption,
} from '../../core/models/rbac.models';
import { UserListItem } from '../../core/models/user.models';

/**
 * User group management (Admin only). A group grants its members every permission and website
 * access carried by its assigned custom roles — an alternative to assigning roles per user.
 */
@Component({
  selector: 'app-groups',
  imports: [FormsModule],
  template: `
    <div class="wrap">
      <div class="head">
        <h1 class="page-title">Groups</h1>
        <button class="btn-primary" type="button" (click)="startCreate()">
          {{ showForm() && !editId() ? 'Cancel' : '+ New group' }}
        </button>
      </div>

      @if (message()) { <div class="banner" [class.ok]="ok()">{{ message() }}</div> }

      @if (showForm()) {
        <form class="card" (ngSubmit)="save()">
          <div class="grid">
            <label class="field"><span>Name</span>
              <input class="input" type="text" name="fName" [(ngModel)]="fName" required /></label>
            <label class="field wide"><span>Description</span>
              <input class="input" type="text" name="fDesc" [(ngModel)]="fDesc" /></label>
          </div>
          <div class="section">
            <span class="section-label">Roles granted to members</span>
            <div class="chips">
              @for (r of roles(); track r.id) {
                <label class="chk"><input type="checkbox" [checked]="fRoleKeys.has(r.key)" (change)="toggleRole(r.key)" /> {{ r.name }}</label>
              }
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" type="submit" [disabled]="busy() || !fName">
              {{ busy() ? 'Saving…' : (editId() ? 'Save group' : 'Create group') }}
            </button>
            <button class="btn-secondary" type="button" (click)="cancel()">Cancel</button>
          </div>
        </form>
      }

      @if (loading()) {
        <p>Loading…</p>
      } @else {
        <div class="table-scroll">
          <table class="tbl">
            <thead>
              <tr><th>Name</th><th>Roles</th><th>Members</th><th></th></tr>
            </thead>
            <tbody>
              @for (g of groups(); track g.id) {
                <tr>
                  <td>{{ g.name }}</td>
                  <td>@for (k of g.roleKeys; track k) { <span class="badge">{{ k }}</span> }</td>
                  <td>{{ g.memberUserIds.length }}</td>
                  <td>
                    <button class="linkish" type="button" (click)="toggleAccess(g)">{{ accessId() === g.id ? 'Hide access' : 'View access' }}</button>
                    <button class="linkish" type="button" (click)="toggleMembers(g)">Members</button>
                    <button class="linkish" type="button" (click)="startEdit(g)">Edit</button>
                    <button class="linkish danger" type="button" (click)="remove(g)">Delete</button>
                  </td>
                </tr>
                @if (accessId() === g.id) {
                  <tr class="view-row"><td colspan="4">
                    <div class="view-panel">
                      @if (previewLoading()) {
                        <span class="muted">Loading access…</span>
                      } @else if (preview()) {
                        <div class="grant-card">
                          <strong>Admin (this app)</strong>
                          <div class="grant-perms">
                            @for (p of preview()!.adminPermissions; track p) { <span class="badge">{{ permissionLabel(p) }}</span> }
                            @if (!preview()!.adminPermissions.length) { <span class="muted">No admin app access.</span> }
                          </div>
                        </div>
                        @for (s of preview()!.siteAccess; track s.websiteKey) {
                          <div class="grant-card">
                            <strong>{{ siteName(s.websiteKey) }}</strong>
                            <div class="grant-perms">
                              @for (p of s.permissions; track p) { <span class="badge">{{ permissionLabel(p) }}</span> }
                            </div>
                          </div>
                        }
                        @if (!preview()!.siteAccess.length) { <span class="muted">No other website access.</span> }
                      }
                    </div>
                  </td></tr>
                }
                @if (membersId() === g.id) {
                  <tr class="edit-row"><td colspan="4">
                    <div class="edit-panel">
                      <div class="chips">
                        @for (uid of g.memberUserIds; track uid) {
                          <span class="badge member">
                            {{ userName(uid) }}
                            <button class="rm" type="button" (click)="removeMember(g, uid)" title="Remove from group">✕</button>
                          </span>
                        }
                        @if (!g.memberUserIds.length) { <span class="muted">No members yet.</span> }
                      </div>
                      <div class="add-member">
                        <select class="input sm" [(ngModel)]="addUserId" name="addUser">
                          <option value="">Add a user…</option>
                          @for (u of availableUsers(g); track u.id) {
                            <option [value]="u.id">{{ u.displayName }} ({{ u.email }})</option>
                          }
                        </select>
                        <button class="btn-secondary" type="button" [disabled]="!addUserId" (click)="addMember(g)">Add</button>
                      </div>
                    </div>
                  </td></tr>
                }
              }
              @if (!groups().length) { <tr><td colspan="4">No groups.</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .wrap { max-width: 1000px; margin: 0 auto; padding: 1rem; }
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
    .page-title { font-size: 1.5rem; margin: 0; color: var(--text); }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; }
    .field.wide { grid-column: 1 / -1; }
    .field span { display: block; margin-bottom: 0.3rem; font-size: 0.8rem; color: var(--muted); }
    .input { width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.95rem; background: var(--bg); color: var(--text); }
    .input.sm { width: auto; display: inline-block; }
    .section { margin: 1rem 0; }
    .section-label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.4rem; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.6rem 0.6rem; }
    .chk { font-size: 0.9rem; color: var(--text); display: inline-flex; align-items: center; gap: 0.3rem; }
    .form-actions { display: flex; gap: 0.6rem; margin-top: 1rem; }
    .btn-primary { padding: 0.5rem 1rem; background: var(--brand); color: var(--brand-text); border: none; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled, .btn-secondary:disabled { opacity: 0.55; cursor: default; }
    .btn-secondary { padding: 0.45rem 0.8rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; }
    .table-scroll { overflow-x: auto; }
    .tbl { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
    .tbl th, .tbl td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; color: var(--text); }
    .tbl th { background: var(--bg); font-weight: 600; }
    .badge { display: inline-block; background: color-mix(in srgb, var(--brand) 14%, var(--surface)); color: var(--brand); border-radius: 10px; padding: 0.1rem 0.55rem; font-size: 0.78rem; margin-right: 0.3rem; }
    .badge.member { display: inline-flex; align-items: center; gap: 0.35rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); }
    .badge.member .rm { background: none; border: none; color: var(--muted); cursor: pointer; padding: 0; font-size: 0.8rem; }
    .linkish { background: none; border: none; color: var(--brand); cursor: pointer; padding: 0 0.3rem; }
    .linkish.danger { color: #d93025; }
    .edit-row td { background: var(--bg); }
    .edit-panel { display: flex; flex-direction: column; gap: 0.75rem; }
    .view-row td { background: var(--bg); }
    .view-panel { display: flex; flex-direction: column; gap: 0.6rem; }
    .grant-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.8rem; }
    .grant-card strong { display: block; color: var(--text); font-size: 0.88rem; margin-bottom: 0.35rem; }
    .grant-perms { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .add-member { display: flex; align-items: center; gap: 0.5rem; }
    .muted { color: var(--muted); font-size: 0.85rem; }
    .banner { background: color-mix(in srgb, #d93025 12%, var(--surface)); color: #c5221f; border: 1px solid color-mix(in srgb, #d93025 30%, var(--border)); border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; }
    .banner.ok { background: color-mix(in srgb, #137333 12%, var(--surface)); color: #137333; border-color: color-mix(in srgb, #137333 30%, var(--border)); }
  `]
})
export class GroupsComponent implements OnInit {
  private api = inject(RbacService);
  private usersApi = inject(UsersService);

  readonly groups = signal<GroupView[]>([]);
  readonly roles = signal<CustomRoleView[]>([]);
  readonly users = signal<UserListItem[]>([]);
  readonly adminPermItems = signal<PermissionCatalogItem[]>([]);
  readonly siteActionItems = signal<PermissionCatalogItem[]>([]);
  readonly websites = signal<WebsiteAccessOption[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly ok = signal(false);

  readonly showForm = signal(false);
  readonly editId = signal<string | null>(null);
  readonly membersId = signal<string | null>(null);
  readonly accessId = signal<string | null>(null);
  readonly preview = signal<EffectiveAccess | null>(null);
  readonly previewLoading = signal(false);
  addUserId = '';
  fName = ''; fDesc = '';
  readonly fRoleKeys = new Set<string>();

  ngOnInit(): void {
    this.reload();
    this.api.listRoles().subscribe({ next: r => this.roles.set(r), error: () => {} });
    this.usersApi.list().subscribe({ next: u => this.users.set(u), error: () => {} });
    this.api.catalog().subscribe({
      next: c => { this.adminPermItems.set(c.adminPermissions); this.siteActionItems.set(c.siteActions); this.websites.set(c.websites); },
      error: () => {},
    });
  }

  private reload(): void {
    this.loading.set(true);
    this.api.listGroups().subscribe({
      next: g => { this.groups.set(g); this.loading.set(false); },
      error: (err: HttpErrorResponse) => { this.loading.set(false); this.fail(err, 'Could not load groups.'); },
    });
  }

  userName(id: string): string {
    return this.users().find(u => u.id === id)?.displayName ?? id;
  }

  siteName(key: string): string {
    return this.websites().find(w => w.key === key)?.name ?? key;
  }

  permissionLabel(key: string): string {
    return this.adminPermItems().find(p => p.key === key)?.label
      ?? this.siteActionItems().find(p => p.key === key)?.label
      ?? key;
  }

  toggleAccess(g: GroupView): void {
    if (this.accessId() === g.id) { this.accessId.set(null); return; }
    this.accessId.set(g.id);
    this.preview.set(null);
    this.previewLoading.set(true);
    this.api.previewAccess(g.roleKeys).subscribe({
      next: p => { this.previewLoading.set(false); this.preview.set(p); },
      error: () => { this.previewLoading.set(false); },
    });
  }

  availableUsers(g: GroupView): UserListItem[] {
    return this.users().filter(u => !g.memberUserIds.includes(u.id));
  }

  toggleRole(key: string): void { this.fRoleKeys.has(key) ? this.fRoleKeys.delete(key) : this.fRoleKeys.add(key); }

  startCreate(): void {
    if (this.showForm() && !this.editId()) { this.showForm.set(false); return; }
    this.editId.set(null);
    this.fName = ''; this.fDesc = ''; this.fRoleKeys.clear();
    this.showForm.set(true);
  }

  startEdit(g: GroupView): void {
    this.editId.set(g.id);
    this.fName = g.name; this.fDesc = g.description ?? '';
    this.fRoleKeys.clear(); g.roleKeys.forEach(k => this.fRoleKeys.add(k));
    this.showForm.set(true);
  }

  cancel(): void { this.showForm.set(false); this.editId.set(null); }

  save(): void {
    if (!this.fName) return;
    const req: UpsertGroupRequest = {
      name: this.fName.trim(),
      description: this.fDesc.trim() || null,
      roleKeys: [...this.fRoleKeys],
    };
    this.busy.set(true);
    const obs = this.editId() ? this.api.updateGroup(this.editId()!, req) : this.api.createGroup(req);
    obs.subscribe({
      next: () => { this.busy.set(false); this.showForm.set(false); this.succeed(this.editId() ? 'Group updated.' : 'Group created.'); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not save group.'); },
    });
  }

  remove(g: GroupView): void {
    this.busy.set(true);
    this.api.deleteGroup(g.id).subscribe({
      next: () => { this.busy.set(false); this.succeed('Group deleted.'); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not delete group.'); },
    });
  }

  toggleMembers(g: GroupView): void {
    this.membersId.set(this.membersId() === g.id ? null : g.id);
    this.addUserId = '';
  }

  addMember(g: GroupView): void {
    if (!this.addUserId) return;
    this.busy.set(true);
    this.api.addMember(g.id, this.addUserId).subscribe({
      next: () => { this.busy.set(false); this.addUserId = ''; this.succeed('Member added.'); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not add member.'); },
    });
  }

  removeMember(g: GroupView, userId: string): void {
    this.busy.set(true);
    this.api.removeMember(g.id, userId).subscribe({
      next: () => { this.busy.set(false); this.succeed('Member removed.'); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not remove member.'); },
    });
  }

  private succeed(msg: string): void { this.ok.set(true); this.message.set(msg); }
  private fail(err: HttpErrorResponse, fallback: string): void {
    this.ok.set(false);
    this.message.set(typeof err.error?.error === 'string' ? err.error.error : fallback);
  }
}
