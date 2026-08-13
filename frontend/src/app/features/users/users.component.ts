import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BrandDataTableComponent, BrandModalComponent, BrandTableColumn } from '@keshavsingh3197/web-ui';
import { AuthService } from '../../core/services/auth.service';
import { RbacService } from '../../core/services/rbac.service';
import { UsersService } from '../../core/services/users.service';
import { scopedRoleKeys } from '../../core/services/rbac-scope.util';
import { Role } from '../../core/models/auth.models';
import { CustomRoleView, GroupView } from '../../core/models/rbac.models';
import { CreateUserRequest, UpdateUserRequest, UserListItem } from '../../core/models/user.models';

@Component({
  selector: 'app-users',
  imports: [FormsModule, DatePipe, RouterLink, BrandDataTableComponent, BrandModalComponent],
  template: `
    <div class="users-wrap">
      <div class="head"><h1 class="page-title">Users &amp; access</h1><button class="btn-primary" type="button" (click)="openCreate()">+ New user</button></div>
      @if (appFilter(); as app) { <div class="scope-chip">Scoped to website: <strong>{{ app }}</strong><a routerLink="/users">Clear</a></div> }
      @if (message()) { <div class="banner" [class.ok]="ok()">{{ message() }}</div> }

      <brand-modal [open]="showCreate()" heading="New user" (closed)="closeCreate()">
        <form (ngSubmit)="create()">
          <div class="grid">
            <label class="field"><span>Email</span><input class="input" type="email" name="cEmail" [(ngModel)]="cEmail" required /></label>
            <label class="field"><span>Display name</span><input class="input" name="cName" [(ngModel)]="cName" required /></label>
            <label class="field"><span>Username (optional)</span><input class="input" name="cUsername" [(ngModel)]="cUsername" /></label>
            <label class="field"><span>Phone (optional, E.164)</span><input class="input" name="cPhone" [(ngModel)]="cPhone" /></label>
            <label class="field wide"><span>Temporary password (min 12)</span><input class="input" type="password" name="cPassword" [(ngModel)]="cPassword" required /></label>
          </div>
          <div class="roles"><span class="roles-label">System roles:</span>@for (r of allRoles(); track r) { <label class="chk"><input type="checkbox" [checked]="cRoles.has(r)" (change)="toggleRole(cRoles, r)" /> {{ r }}</label> }</div>
          <div class="roles"><span class="roles-label">Custom roles:</span>@for (r of customRoles(); track r.id) { <label class="chk"><input type="checkbox" [checked]="cCustomRoles.has(r.key)" (change)="toggleCustomRole(cCustomRoles, r.key)" /> {{ r.name }}</label> }</div>
          <div class="form-actions"><button class="btn-primary" type="submit" [disabled]="busy() || !cEmail || !cName || cPassword.length < 12">{{ busy() ? 'Creating…' : 'Create user' }}</button><button class="btn-secondary" type="button" (click)="closeCreate()">Cancel</button></div>
        </form>
      </brand-modal>

      @if (loading()) { <p>Loading…</p> } @else {
        <brand-data-table [columns]="columns" [rows]="visibleUsers()" [trackBy]="trackById" defaultSortKey="email" searchPlaceholder="Search users…">
          <ng-template let-u><tr [class.inactive]="!u.isActive"><td>{{ u.email }}</td><td>{{ u.displayName }}</td><td>@for (r of u.roles; track r) { <span class="badge">{{ r }}</span> }</td><td>{{ websitesFor(u) }}</td><td>{{ u.isActive ? 'Active' : 'Disabled' }}</td><td>{{ u.twoFactorEnabled ? 'Enabled' : 'Not enrolled' }}</td><td>{{ u.lastLoginAt ? (u.lastLoginAt | date:'short') : 'Never' }}</td><td><button class="linkish" type="button" (click)="edit(u)">Edit</button></td></tr></ng-template>
          <span table-empty>No users match these filters.</span>
        </brand-data-table>
      }

      <brand-modal [open]="!!editingUser()" heading="Edit user" (closed)="closeEdit()">
        @if (editingUser(); as u) {
          <form (ngSubmit)="saveUser(u)">
            <div class="grid">
              <label class="field"><span>Email</span><input class="input" [value]="u.email" disabled /></label>
              <label class="field"><span>Display name</span><input class="input" name="eName" [(ngModel)]="eName" required /></label>
              <label class="field"><span>Username</span><input class="input" name="eUsername" [(ngModel)]="eUsername" /></label>
              <label class="field"><span>Phone</span><input class="input" name="ePhone" [(ngModel)]="ePhone" /></label>
            </div>
            <div class="roles"><span class="roles-label">System roles:</span>@for (r of allRoles(); track r) { <label class="chk"><input type="checkbox" [checked]="eRoles.has(r)" (change)="toggleRole(eRoles, r)" /> {{ r }}</label> }</div>
            <div class="roles"><span class="roles-label">Custom roles:</span>@for (r of customRoles(); track r.id) { <label class="chk"><input type="checkbox" [checked]="eCustomRoles.has(r.key)" (change)="toggleCustomRole(eCustomRoles, r.key)" /> {{ r.name }}</label> } @if (!customRoles().length) { <span class="muted">No custom roles have been created.</span> }</div>
            <div class="roles"><span class="roles-label">Groups:</span>@for (g of groups(); track g.id) { <label class="chk"><input type="checkbox" [checked]="eGroups.has(g.id)" (change)="toggleGroup(u, g)" /> {{ g.name }}</label> } @if (!groups().length) { <span class="muted">No groups have been created.</span> }</div>
            <div class="form-actions"><button class="btn-primary" type="submit" [disabled]="busy() || !eName">{{ busy() ? 'Saving…' : 'Save changes' }}</button><button class="btn-secondary" type="button" (click)="closeEdit()">Cancel</button></div>
          </form>
          <div class="admin-actions"><button class="btn-secondary" type="button" [disabled]="busy()" (click)="toggleActive(u)">{{ u.isActive ? 'Deactivate user' : 'Activate user' }}</button><span class="reset"><input class="input sm" type="password" placeholder="New password (min 12)" [(ngModel)]="resetPw" name="resetPassword" /><button class="btn-secondary" type="button" [disabled]="busy() || resetPw.length < 12" (click)="reset(u)">Reset password</button></span><button class="btn-danger" type="button" [disabled]="busy() || u.id === selfId()" (click)="remove(u)">Delete user</button></div>
        }
      </brand-modal>
    </div>`,
  styles: [`
    .users-wrap { max-width: 1080px; margin: 0 auto; padding: 1rem; font-family: inherit; }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; gap: 0.75rem; }
    .page-title { margin: 0; color: var(--text); font-size: 1.55rem; line-height: 1.2; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.75rem; }
    .field.wide { grid-column: 1 / -1; }
    .field span, .roles-label { display: block; margin-bottom: 0.35rem; color: var(--muted); font-size: 0.82rem; font-weight: 600; }
    .input { width: 100%; box-sizing: border-box; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font: inherit; }
    .input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 25%, transparent); }
    .input.sm { width: auto; }
    .roles, .admin-actions, .form-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.65rem; margin-top: 1rem; }
    .chk { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--text); font-size: 0.9rem; }
    .btn-primary, .btn-secondary, .btn-danger { padding: 0.55rem 0.9rem; border-radius: 6px; cursor: pointer; font: inherit; }
    .btn-primary { background: var(--brand); color: var(--brand-text); border: 0; }
    .btn-secondary { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
    .btn-danger { background: #d93025; color: #fff; border: 0; }
    button:disabled { opacity: 0.55; cursor: default; }
    .badge { display: inline-block; margin-right: 0.25rem; padding: 0.12rem 0.5rem; border-radius: 10px; font-size: 0.78rem; background: color-mix(in srgb, var(--brand) 14%, var(--surface)); color: var(--brand); }
    .linkish { border: 0; background: none; color: var(--brand); cursor: pointer; font: inherit; }
    .inactive td { opacity: 0.6; }
    .admin-actions { border-top: 1px solid var(--border); padding-top: 1rem; margin-top: 1.25rem; }
    .reset { display: inline-flex; align-items: center; gap: 0.4rem; }
    .banner, .scope-chip { display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.8rem; margin-bottom: 1rem; border: 1px solid var(--border); border-radius: 6px; }
    .banner { color: #c5221f; background: color-mix(in srgb, #d93025 12%, var(--surface)); }
    .banner.ok { color: #137333; background: color-mix(in srgb, #137333 12%, var(--surface)); }
    .scope-chip { background: color-mix(in srgb, var(--brand) 10%, var(--surface)); border-color: color-mix(in srgb, var(--brand) 28%, var(--border)); }
    .scope-chip a { color: var(--brand); text-decoration: none; margin-left: auto; }
    .muted { color: var(--muted); font-size: 0.85rem; }
  `]
})
export class UsersComponent implements OnInit {
  private api = inject(UsersService); private auth = inject(AuthService); private rbac = inject(RbacService); private route = inject(ActivatedRoute);
  readonly users = signal<UserListItem[]>([]); readonly allRoles = signal<Role[]>(['Admin', 'Editor', 'Viewer']); readonly roles = signal<CustomRoleView[]>([]); readonly groups = signal<GroupView[]>([]); readonly appFilter = signal<string | null>(null); readonly loading = signal(true); readonly busy = signal(false); readonly message = signal<string | null>(null); readonly ok = signal(false); readonly showCreate = signal(false); readonly editingUser = signal<UserListItem | null>(null);
  /** Only user-defined roles belong in these pickers: Admin/Editor/Viewer are stored as system roles
   *  in the same collection, and listing them again here duplicates the "System roles" checkboxes. */
  readonly customRoles = computed(() => this.roles().filter(r => !r.isSystem));
  /** Every website any role grants access to — the source of the "Website" column and its filter. */
  readonly websiteNames = computed(() => new Map(this.roles().map(r => [r.key, r.websiteGrants.map(g => g.websiteKey)])));
  readonly visibleUsers = computed(() => { const app = this.appFilter(); if (!app) return this.users(); const keys = scopedRoleKeys(this.roles(), app); const groupIds = new Set(this.groups().filter(g => g.roleKeys.some(k => keys.has(k))).map(g => g.id)); return this.users().filter(u => u.roles.includes('Admin') || u.customRoleKeys.some(k => keys.has(k)) || u.groupIds.some(id => groupIds.has(id))); });
  /** Which websites a user can reach, via their own roles or any group they belong to. "*" (all
   *  websites) and the Admin system role both read as "All" — the same rule the API enforces. */
  websitesFor(u: UserListItem): string { if (u.roles.includes('Admin')) return 'All'; const byKey = this.websiteNames(); const roleKeys = new Set([...u.customRoleKeys, ...this.groups().filter(g => u.groupIds.includes(g.id)).flatMap(g => g.roleKeys)]); const sites = new Set([...roleKeys].flatMap(k => byKey.get(k) ?? [])); return sites.has('*') ? 'All' : [...sites].sort().join(', ') || '—'; }
  cEmail = ''; cName = ''; cUsername = ''; cPhone = ''; cPassword = ''; readonly cRoles = new Set<Role>(['Viewer']); readonly cCustomRoles = new Set<string>();
  eName = ''; eUsername = ''; ePhone = ''; resetPw = ''; readonly eRoles = new Set<Role>(); readonly eCustomRoles = new Set<string>(); readonly eGroups = new Set<string>();
  readonly columns: BrandTableColumn<UserListItem>[] = [{ key:'email',label:'Email',value:u=>u.email },{ key:'displayName',label:'Name',value:u=>u.displayName },{ key:'roles',label:'Roles',value:u=>u.roles.join(', '),filterable:true },{ key:'websites',label:'Websites',value:u=>this.websitesFor(u),filterable:true },{ key:'status',label:'Status',value:u=>u.isActive?'Active':'Disabled',filterable:true },{ key:'twoFactor',label:'2FA',value:u=>u.twoFactorEnabled?'Enabled':'Not enrolled',filterable:true },{ key:'lastLogin',label:'Last login',value:u=>u.lastLoginAt??'' },{ key:'actions',label:'' }];
  trackById = (u: UserListItem) => u.id; selfId(): string | undefined { return this.auth.user()?.id; }
  ngOnInit(): void { this.appFilter.set(this.route.snapshot.queryParamMap.get('app')); this.reload(); this.api.roles().subscribe({next:r=>this.allRoles.set(r)}); this.rbac.listRoles().subscribe({next:r=>this.roles.set(r)}); this.rbac.listGroups().subscribe({next:g=>this.groups.set(g)}); }
  private reload(): void { this.loading.set(true); this.api.list().subscribe({next: list=>{this.users.set(list);this.loading.set(false);},error:e=>{this.loading.set(false);this.fail(e,'Could not load users.');}}); }
  openCreate(): void { this.showCreate.set(true); } closeCreate(): void { this.showCreate.set(false); } closeEdit(): void { this.editingUser.set(null); }
  toggleRole(set: Set<Role>, role: Role): void { set.has(role) ? set.delete(role) : set.add(role); } toggleCustomRole(set: Set<string>, key: string): void { set.has(key) ? set.delete(key) : set.add(key); }
  create(): void { if (!this.cEmail || !this.cName || this.cPassword.length < 12) return; const req: CreateUserRequest={email:this.cEmail.trim(),displayName:this.cName.trim(),username:this.cUsername.trim()||null,phoneNumber:this.cPhone.trim()||null,password:this.cPassword,roles:[...this.cRoles],customRoleKeys:[...this.cCustomRoles]}; this.busy.set(true); this.api.create(req).subscribe({next:()=>{this.busy.set(false);this.closeCreate();this.cEmail=this.cName=this.cUsername=this.cPhone=this.cPassword='';this.cRoles.clear();this.cRoles.add('Viewer');this.cCustomRoles.clear();this.succeed('User created.');this.reload();},error:e=>{this.busy.set(false);this.fail(e,'Could not create user.');}}); }
  edit(u: UserListItem): void { this.eRoles.clear();u.roles.forEach(r=>this.eRoles.add(r));this.eCustomRoles.clear();u.customRoleKeys.forEach(r=>this.eCustomRoles.add(r));this.eGroups.clear();u.groupIds.forEach(g=>this.eGroups.add(g));this.eName=u.displayName;this.eUsername=u.username??'';this.ePhone=u.phoneNumber??'';this.resetPw='';this.editingUser.set(u); }
  saveUser(u: UserListItem): void { if (!this.eName.trim()) return; const req: UpdateUserRequest={displayName:this.eName.trim(),username:this.eUsername.trim()||null,phoneNumber:this.ePhone.trim()||null,roles:[...this.eRoles],customRoleKeys:[...this.eCustomRoles]};this.busy.set(true);this.api.update(u.id,req).subscribe({next:()=>{this.busy.set(false);this.succeed('User details and roles updated.');this.reload();},error:e=>{this.busy.set(false);this.fail(e,'Could not save user changes.');}}); }
  toggleGroup(u: UserListItem,g: GroupView): void { this.busy.set(true);const was=this.eGroups.has(g.id);(was?this.rbac.removeMember(g.id,u.id):this.rbac.addMember(g.id,u.id)).subscribe({next:()=>{this.busy.set(false);was?this.eGroups.delete(g.id):this.eGroups.add(g.id);this.succeed(was?'Removed from group.':'Added to group.');this.rbac.listGroups().subscribe({next:gs=>this.groups.set(gs)});this.reload();},error:e=>{this.busy.set(false);this.fail(e,'Could not update group membership.');}}); }
  toggleActive(u: UserListItem): void { this.busy.set(true);this.api.update(u.id,{isActive:!u.isActive}).subscribe({next:()=>{this.busy.set(false);this.succeed(u.isActive?'User deactivated.':'User activated.');this.reload();},error:e=>{this.busy.set(false);this.fail(e,'Could not update user.');}}); }
  reset(u: UserListItem): void { if(this.resetPw.length<12)return;this.busy.set(true);this.api.resetPassword(u.id,this.resetPw).subscribe({next:()=>{this.busy.set(false);this.resetPw='';this.succeed('Password reset; user must change it on next sign-in.');},error:e=>{this.busy.set(false);this.fail(e,'Could not reset password.');}}); }
  remove(u: UserListItem): void { if(u.id===this.selfId())return;this.busy.set(true);this.api.remove(u.id).subscribe({next:()=>{this.busy.set(false);this.closeEdit();this.succeed('User deleted.');this.reload();},error:e=>{this.busy.set(false);this.fail(e,'Could not delete user.');}}); }
  private succeed(msg:string):void{this.ok.set(true);this.message.set(msg);} private fail(err:HttpErrorResponse,fallback:string):void{this.ok.set(false);this.message.set(typeof err.error?.error==='string'?err.error.error:fallback);}
}
