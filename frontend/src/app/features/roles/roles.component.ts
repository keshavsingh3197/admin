import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RbacService } from '../../core/services/rbac.service';
import {
  CustomRoleView,
  PermissionCatalogItem,
  UpsertCustomRoleRequest,
  WebsiteAccessOption,
} from '../../core/models/rbac.models';

/**
 * Custom role management (Admin only). A role bundles page/action permissions plus website
 * access; roles are assigned to users directly or via groups. The fixed Admin/Editor/Viewer
 * roles remain the actual API authorization boundary — these roles gate pages/UI on top of that.
 */
@Component({
  selector: 'app-roles',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="wrap">
      <div class="head">
        <h1 class="page-title">Roles &amp; Permissions</h1>
        <button class="btn-primary" type="button" (click)="startCreate()">
          {{ showForm() && !editId() ? 'Cancel' : '+ New role' }}
        </button>
      </div>

      @if (message()) { <div class="banner" [class.ok]="ok()">{{ message() }}</div> }

      @if (showForm()) {
        <form class="card" (ngSubmit)="save()">
          <div class="grid">
            <label class="field"><span>Key (slug)</span>
              <input class="input" type="text" name="fKey" [(ngModel)]="fKey" [disabled]="!!editId()" required /></label>
            <label class="field"><span>Name</span>
              <input class="input" type="text" name="fName" [(ngModel)]="fName" required /></label>
            <label class="field wide"><span>Description</span>
              <input class="input" type="text" name="fDesc" [(ngModel)]="fDesc" /></label>
          </div>

          <div class="section">
            <span class="section-label">Pages</span>
            <div class="chips">
              @for (p of pagePermissions(); track p.key) {
                <label class="chk" [title]="p.description">
                  <input type="checkbox" [checked]="fPermissions.has(p.key)" (change)="togglePermission(p.key)" /> {{ p.label }}
                </label>
              }
            </div>
          </div>

          <div class="section">
            <span class="section-label">Actions</span>
            <div class="chips">
              @for (p of actionPermissions(); track p.key) {
                <label class="chk" [title]="p.description">
                  <input type="checkbox" [checked]="fPermissions.has(p.key)" (change)="togglePermission(p.key)" /> {{ p.label }}
                </label>
              }
            </div>
          </div>

          <div class="section">
            <span class="section-label">Website access</span>
            <div class="chips">
              <label class="chk"><input type="checkbox" [checked]="fAllWebsites()" (change)="toggleAllWebsites()" /> All websites</label>
              @if (!fAllWebsites()) {
                @for (w of websites(); track w.key) {
                  <label class="chk"><input type="checkbox" [checked]="fWebsiteAccess.has(w.key)" (change)="toggleWebsite(w.key)" /> {{ w.name }}</label>
                }
              }
            </div>
          </div>

          <div class="form-actions">
            <button class="btn-primary" type="submit" [disabled]="busy() || !fKey || !fName">
              {{ busy() ? 'Saving…' : (editId() ? 'Save role' : 'Create role') }}
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
              <tr><th>Name</th><th>Key</th><th>Permissions</th><th>Websites</th><th>Updated</th><th></th></tr>
            </thead>
            <tbody>
              @for (r of roles(); track r.id) {
                <tr>
                  <td>{{ r.name }} @if (r.isSystem) { <span class="badge sys">System</span> }</td>
                  <td><code>{{ r.key }}</code></td>
                  <td>{{ r.permissions.length }}</td>
                  <td>{{ r.websiteAccess.includes('*') ? 'All' : r.websiteAccess.length }}</td>
                  <td>{{ r.updatedAt | date:'short' }}</td>
                  <td>
                    @if (!r.isSystem) {
                      <button class="linkish" type="button" (click)="startEdit(r)">Edit</button>
                      <button class="linkish danger" type="button" (click)="remove(r)">Delete</button>
                    }
                  </td>
                </tr>
              }
              @if (!roles().length) { <tr><td colspan="6">No roles.</td></tr> }
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
    .input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 25%, transparent); }
    .section { margin: 1rem 0; }
    .section-label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.4rem; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; }
    .chk { font-size: 0.9rem; color: var(--text); display: inline-flex; align-items: center; gap: 0.3rem; }
    .form-actions { display: flex; gap: 0.6rem; margin-top: 1rem; }
    .btn-primary { padding: 0.5rem 1rem; background: var(--brand); color: var(--brand-text); border: none; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled, .btn-secondary:disabled { opacity: 0.55; cursor: default; }
    .btn-secondary { padding: 0.45rem 0.8rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; }
    .table-scroll { overflow-x: auto; }
    .tbl { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
    .tbl th, .tbl td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; color: var(--text); }
    .tbl th { background: var(--bg); font-weight: 600; }
    .badge.sys { display: inline-block; background: color-mix(in srgb, var(--brand) 18%, var(--surface)); color: var(--brand); border-radius: 10px; padding: 0.1rem 0.5rem; font-size: 0.72rem; margin-left: 0.4rem; }
    .linkish { background: none; border: none; color: var(--brand); cursor: pointer; padding: 0 0.3rem; }
    .linkish.danger { color: #d93025; }
    .banner { background: color-mix(in srgb, #d93025 12%, var(--surface)); color: #c5221f; border: 1px solid color-mix(in srgb, #d93025 30%, var(--border)); border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; }
    .banner.ok { background: color-mix(in srgb, #137333 12%, var(--surface)); color: #137333; border-color: color-mix(in srgb, #137333 30%, var(--border)); }
  `]
})
export class RolesComponent implements OnInit {
  private api = inject(RbacService);

  readonly roles = signal<CustomRoleView[]>([]);
  readonly catalogItems = signal<PermissionCatalogItem[]>([]);
  readonly websites = signal<WebsiteAccessOption[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly ok = signal(false);

  readonly showForm = signal(false);
  readonly editId = signal<string | null>(null);
  fKey = ''; fName = ''; fDesc = '';
  readonly fPermissions = new Set<string>();
  readonly fWebsiteAccess = new Set<string>();

  pagePermissions(): PermissionCatalogItem[] { return this.catalogItems().filter(p => p.category === 'Pages'); }
  actionPermissions(): PermissionCatalogItem[] { return this.catalogItems().filter(p => p.category === 'Actions'); }
  fAllWebsites(): boolean { return this.fWebsiteAccess.has('*'); }

  ngOnInit(): void {
    this.reload();
    this.api.catalog().subscribe({
      next: c => { this.catalogItems.set(c.permissions); this.websites.set(c.websites); },
      error: () => {},
    });
  }

  private reload(): void {
    this.loading.set(true);
    this.api.listRoles().subscribe({
      next: r => { this.roles.set(r); this.loading.set(false); },
      error: (err: HttpErrorResponse) => { this.loading.set(false); this.fail(err, 'Could not load roles.'); },
    });
  }

  togglePermission(key: string): void { this.fPermissions.has(key) ? this.fPermissions.delete(key) : this.fPermissions.add(key); }
  toggleWebsite(key: string): void { this.fWebsiteAccess.has(key) ? this.fWebsiteAccess.delete(key) : this.fWebsiteAccess.add(key); }
  toggleAllWebsites(): void {
    this.fWebsiteAccess.clear();
    if (!this.fAllWebsites()) this.fWebsiteAccess.add('*');
  }

  startCreate(): void {
    if (this.showForm() && !this.editId()) { this.showForm.set(false); return; }
    this.editId.set(null);
    this.fKey = ''; this.fName = ''; this.fDesc = '';
    this.fPermissions.clear(); this.fWebsiteAccess.clear();
    this.showForm.set(true);
  }

  startEdit(r: CustomRoleView): void {
    this.editId.set(r.id);
    this.fKey = r.key; this.fName = r.name; this.fDesc = r.description ?? '';
    this.fPermissions.clear(); r.permissions.forEach(p => this.fPermissions.add(p));
    this.fWebsiteAccess.clear(); r.websiteAccess.forEach(w => this.fWebsiteAccess.add(w));
    this.showForm.set(true);
  }

  cancel(): void { this.showForm.set(false); this.editId.set(null); }

  save(): void {
    if (!this.fKey || !this.fName) return;
    const req: UpsertCustomRoleRequest = {
      key: this.fKey.trim(),
      name: this.fName.trim(),
      description: this.fDesc.trim() || null,
      permissions: [...this.fPermissions],
      websiteAccess: [...this.fWebsiteAccess],
    };
    this.busy.set(true);
    const obs = this.editId() ? this.api.updateRole(this.editId()!, req) : this.api.createRole(req);
    obs.subscribe({
      next: () => { this.busy.set(false); this.showForm.set(false); this.succeed(this.editId() ? 'Role updated.' : 'Role created.'); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not save role.'); },
    });
  }

  remove(r: CustomRoleView): void {
    if (r.isSystem) return;
    this.busy.set(true);
    this.api.deleteRole(r.id).subscribe({
      next: () => { this.busy.set(false); this.succeed('Role deleted.'); this.reload(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not delete role.'); },
    });
  }

  private succeed(msg: string): void { this.ok.set(true); this.message.set(msg); }
  private fail(err: HttpErrorResponse, fallback: string): void {
    this.ok.set(false);
    this.message.set(typeof err.error?.error === 'string' ? err.error.error : fallback);
  }
}
