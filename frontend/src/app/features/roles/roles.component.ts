import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BrandDataTableComponent, BrandModalComponent, BrandTableColumn } from '@keshavsingh3197/web-ui';
import { RbacService } from '../../core/services/rbac.service';
import { scopedRoleKeys } from '../../core/services/rbac-scope.util';
import {
  CustomRoleView,
  PermissionCatalogItem,
  UpsertCustomRoleRequest,
  WebsiteAccessOption,
  WebsiteGrant,
} from '../../core/models/rbac.models';

const ALL_WEBSITES_KEY = '*';
const ADMIN_WEBSITE_KEY = 'admin';

/**
 * Custom role management (Admin only). Every website — including this admin app itself — gets
 * its own configurable set of pages/actions: pick a site, choose what it grants, add it to the
 * role. The fixed Admin/Editor/Viewer roles remain the actual API authorization boundary; these
 * roles gate pages/UI and per-site access on top of that.
 */
@Component({
  selector: 'app-roles',
  imports: [FormsModule, DatePipe, RouterLink, BrandDataTableComponent, BrandModalComponent],
  template: `
    <div class="wrap">
      <div class="head">
        <h1 class="page-title">Roles &amp; Permissions</h1>
        <button class="btn-primary" type="button" (click)="startCreate()">
          {{ showForm() && !editId() ? 'Cancel' : '+ New role' }}
        </button>
      </div>

      @if (appFilter(); as app) {
        <div class="scope-chip">Scoped to website: <strong>{{ app }}</strong>
          <a routerLink="/roles">✕ clear</a></div>
      }

      @if (message()) { <div class="banner" [class.ok]="ok()">{{ message() }}</div> }

      <brand-modal [open]="showForm()" [heading]="editId() ? 'Edit role' : 'New role'" (closed)="cancel()">
        <form (ngSubmit)="save()">
          <div class="grid">
            <label class="field"><span>Key (slug)</span>
              <input class="input" type="text" name="fKey" [(ngModel)]="fKey" [disabled]="!!editId()" required /></label>
            <label class="field"><span>Name</span>
              <input class="input" type="text" name="fName" [(ngModel)]="fName" required /></label>
            <label class="field wide"><span>Description</span>
              <input class="input" type="text" name="fDesc" [(ngModel)]="fDesc" /></label>
          </div>

          <div class="configurator">
            <span class="section-label">Configure a website</span>
            <div class="picker">
              <select class="input" name="siteKey" [(ngModel)]="pickedSite" (ngModelChange)="onPickSite($event)">
                <option value="">Search &amp; select a website…</option>
                @for (w of websiteOptions(); track w.key) {
                  <option [value]="w.key">{{ w.name }}</option>
                }
              </select>
            </div>

            @if (pickedSite) {
              <div class="site-perms">
                @if (pickedSite === adminKey) {
                  <div class="chips">
                    <span class="mini-label">Pages</span>
                    @for (p of adminPages(); track p.key) {
                      <label class="chk" [title]="p.description">
                        <input type="checkbox" [checked]="pickedPermissions.has(p.key)" (change)="togglePermission(p.key)" /> {{ p.label }}
                      </label>
                    }
                  </div>
                  <div class="chips">
                    <span class="mini-label">Actions</span>
                    @for (p of adminActions(); track p.key) {
                      <label class="chk" [title]="p.description">
                        <input type="checkbox" [checked]="pickedPermissions.has(p.key)" (change)="togglePermission(p.key)" /> {{ p.label }}
                      </label>
                    }
                  </div>
                } @else {
                  <div class="chips">
                    @for (p of siteActions(); track p.key) {
                      <label class="chk" [title]="p.description">
                        <input type="checkbox" [checked]="pickedPermissions.has(p.key)" (change)="togglePermission(p.key)" /> {{ p.label }}
                      </label>
                    }
                  </div>
                }
                <button class="btn-secondary" type="button" [disabled]="!pickedPermissions.size" (click)="addGrant()">
                  {{ fGrants.has(pickedSite) ? 'Update this site' : 'Add this site' }}
                </button>
              </div>
            }
          </div>

          <div class="section">
            <span class="section-label">Configured websites</span>
            <div class="grant-list">
              @for (g of fGrantList(); track g.websiteKey) {
                <div class="grant-card">
                  <div class="grant-head">
                    <strong>{{ siteName(g.websiteKey) }}</strong>
                    <button class="linkish" type="button" (click)="editGrant(g)">Edit</button>
                    <button class="linkish danger" type="button" (click)="removeGrant(g.websiteKey)">Remove</button>
                  </div>
                  <div class="grant-perms">
                    @for (p of g.permissions; track p) { <span class="badge">{{ permissionLabel(p) }}</span> }
                  </div>
                </div>
              }
              @if (!fGrantList().length) { <span class="muted-inline">No websites configured yet — pick one above.</span> }
            </div>
          </div>

          <div class="form-actions">
            <button class="btn-primary" type="submit" [disabled]="busy() || !fKey || !fName">
              {{ busy() ? 'Saving…' : (editId() ? 'Save role' : 'Create role') }}
            </button>
            <button class="btn-secondary" type="button" (click)="cancel()">Cancel</button>
          </div>
        </form>
      </brand-modal>

      @if (loading()) {
        <p>Loading…</p>
      } @else {
        <brand-data-table [columns]="columns" [rows]="visibleRoles()" [trackBy]="trackById"
                           searchPlaceholder="Search roles…">
          <ng-template let-r>
            <tr>
              <td>{{ r.name }} @if (r.isSystem) { <span class="badge sys">System</span> }</td>
              <td><code>{{ r.key }}</code></td>
              <td>{{ r.websiteGrants.length }}</td>
              <td>{{ r.updatedAt | date:'short' }}</td>
              <td>
                <button class="linkish" type="button" (click)="toggleView(r)">{{ viewId() === r.id ? 'Hide' : 'View' }}</button>
                @if (!r.isSystem) {
                  <button class="linkish" type="button" (click)="startEdit(r)">Edit</button>
                  <button class="linkish danger" type="button" (click)="remove(r)">Delete</button>
                }
              </td>
            </tr>
            @if (viewId() === r.id) {
              <tr class="view-row"><td colspan="5">
                <div class="view-panel">
                  @for (g of r.websiteGrants; track g.websiteKey) {
                    <div class="grant-card">
                      <strong>{{ siteName(g.websiteKey) }}</strong>
                      <div class="grant-perms">
                        @for (p of g.permissions; track p) { <span class="badge">{{ permissionLabel(p) }}</span> }
                      </div>
                    </div>
                  }
                  @if (!r.websiteGrants.length) { <span class="muted-inline">No website access configured.</span> }
                </div>
              </td></tr>
            }
          </ng-template>
          <span table-empty>No roles match these filters.</span>
        </brand-data-table>
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
    .configurator { margin: 1.1rem 0; padding: 0.9rem; border: 1px dashed var(--border); border-radius: 8px; background: var(--bg); }
    .picker { max-width: 360px; }
    .site-perms { margin-top: 0.9rem; display: flex; flex-direction: column; gap: 0.7rem; }
    .mini-label { display: block; font-size: 0.75rem; color: var(--muted); margin-bottom: 0.3rem; width: 100%; }
    .section { margin: 1rem 0; }
    .section-label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.5rem; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; align-items: center; }
    .chk { font-size: 0.9rem; color: var(--text); display: inline-flex; align-items: center; gap: 0.3rem; }
    .grant-list { display: flex; flex-direction: column; gap: 0.6rem; }
    .grant-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.8rem; }
    .grant-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; }
    .grant-head strong { color: var(--text); font-size: 0.92rem; }
    .grant-perms { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .form-actions { display: flex; gap: 0.6rem; margin-top: 1rem; }
    .btn-primary { padding: 0.5rem 1rem; background: var(--brand); color: var(--brand-text); border: none; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled, .btn-secondary:disabled { opacity: 0.55; cursor: default; }
    .btn-secondary { padding: 0.45rem 0.8rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; }
    .table-scroll { overflow-x: auto; }
    td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; color: var(--text); }
    .badge { display: inline-block; background: color-mix(in srgb, var(--brand) 14%, var(--surface)); color: var(--brand); border-radius: 10px; padding: 0.1rem 0.55rem; font-size: 0.78rem; }
    .badge.sys { background: color-mix(in srgb, var(--brand) 18%, var(--surface)); color: var(--brand); margin-left: 0.4rem; font-size: 0.72rem; }
    .scope-chip { display: flex; align-items: center; gap: 0.5rem; background: color-mix(in srgb, var(--brand) 10%, var(--surface)); border: 1px solid color-mix(in srgb, var(--brand) 30%, var(--border)); border-radius: 8px; padding: 0.5rem 0.8rem; margin-bottom: 1rem; font-size: 0.86rem; }
    .scope-chip a { color: var(--brand); text-decoration: none; margin-left: auto; }
    .linkish { background: none; border: none; color: var(--brand); cursor: pointer; padding: 0 0.3rem; }
    .linkish.danger { color: #d93025; }
    .view-row td { background: var(--bg); }
    .view-panel { display: flex; flex-direction: column; gap: 0.6rem; }
    .muted-inline { font-size: 0.85rem; color: var(--muted); }
    .banner { background: color-mix(in srgb, #d93025 12%, var(--surface)); color: #c5221f; border: 1px solid color-mix(in srgb, #d93025 30%, var(--border)); border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; }
    .banner.ok { background: color-mix(in srgb, #137333 12%, var(--surface)); color: #137333; border-color: color-mix(in srgb, #137333 30%, var(--border)); }
  `]
})
export class RolesComponent implements OnInit {
  private api = inject(RbacService);
  private route = inject(ActivatedRoute);
  readonly adminKey = ADMIN_WEBSITE_KEY;

  readonly roles = signal<CustomRoleView[]>([]);
  /** Set from the `?app=` query param when reached via a Websites-page drill-through link. */
  readonly appFilter = signal<string | null>(null);
  readonly visibleRoles = computed(() => {
    const app = this.appFilter();
    if (!app) return this.roles();
    const keys = scopedRoleKeys(this.roles(), app);
    return this.roles().filter(r => keys.has(r.key));
  });
  readonly adminPermItems = signal<PermissionCatalogItem[]>([]);
  readonly siteActionItems = signal<PermissionCatalogItem[]>([]);
  readonly websites = signal<WebsiteAccessOption[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly ok = signal(false);
  readonly viewId = signal<string | null>(null);

  readonly showForm = signal(false);
  readonly editId = signal<string | null>(null);
  fKey = ''; fName = ''; fDesc = '';
  /** Working set of website grants being built up for the form, keyed by website key. */
  fGrants = new Map<string, WebsiteGrant>();

  pickedSite = '';
  readonly pickedPermissions = new Set<string>();

  readonly columns: BrandTableColumn<CustomRoleView>[] = [
    { key: 'name', label: 'Name', value: r => r.name, sortable: true },
    { key: 'key', label: 'Key', value: r => r.key, sortable: true },
    { key: 'websites', label: 'Websites configured', value: r => r.websiteGrants.length, sortable: true },
    { key: 'updated', label: 'Updated', value: r => r.updatedAt, sortable: true },
    { key: 'actions', label: '' },
  ];

  trackById = (r: CustomRoleView) => r.id;

  adminPages(): PermissionCatalogItem[] { return this.adminPermItems().filter(p => p.category === 'Pages'); }
  adminActions(): PermissionCatalogItem[] { return this.adminPermItems().filter(p => p.category === 'Actions'); }
  siteActions(): PermissionCatalogItem[] { return this.siteActionItems(); }

  websiteOptions(): WebsiteAccessOption[] {
    return [{ key: ALL_WEBSITES_KEY, name: 'All other websites' }, ...this.websites()];
  }

  fGrantList(): WebsiteGrant[] { return [...this.fGrants.values()]; }

  ngOnInit(): void {
    this.appFilter.set(this.route.snapshot.queryParamMap.get('app'));
    this.reload();
    this.api.catalog().subscribe({
      next: c => {
        this.adminPermItems.set(c.adminPermissions);
        this.siteActionItems.set(c.siteActions);
        this.websites.set(c.websites.filter(w => w.key !== ADMIN_WEBSITE_KEY));
      },
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

  siteName(key: string): string {
    if (key === ADMIN_WEBSITE_KEY) return 'Admin (this app)';
    if (key === ALL_WEBSITES_KEY) return 'All other websites';
    return this.websites().find(w => w.key === key)?.name ?? key;
  }

  permissionLabel(key: string): string {
    return this.adminPermItems().find(p => p.key === key)?.label
      ?? this.siteActionItems().find(p => p.key === key)?.label
      ?? key;
  }

  onPickSite(key: string): void {
    this.pickedPermissions.clear();
    if (!key) return;
    const existing = this.fGrants.get(key);
    existing?.permissions.forEach(p => this.pickedPermissions.add(p));
  }

  togglePermission(key: string): void {
    this.pickedPermissions.has(key) ? this.pickedPermissions.delete(key) : this.pickedPermissions.add(key);
  }

  addGrant(): void {
    if (!this.pickedSite || !this.pickedPermissions.size) return;
    this.fGrants.set(this.pickedSite, { websiteKey: this.pickedSite, permissions: [...this.pickedPermissions] });
    this.pickedSite = '';
    this.pickedPermissions.clear();
  }

  editGrant(g: WebsiteGrant): void {
    this.pickedSite = g.websiteKey;
    this.pickedPermissions.clear();
    g.permissions.forEach(p => this.pickedPermissions.add(p));
  }

  removeGrant(websiteKey: string): void {
    this.fGrants.delete(websiteKey);
    if (this.pickedSite === websiteKey) { this.pickedSite = ''; this.pickedPermissions.clear(); }
  }

  toggleView(r: CustomRoleView): void { this.viewId.set(this.viewId() === r.id ? null : r.id); }

  startCreate(): void {
    if (this.showForm() && !this.editId()) { this.showForm.set(false); return; }
    this.editId.set(null);
    this.fKey = ''; this.fName = ''; this.fDesc = '';
    this.fGrants = new Map();
    this.pickedSite = ''; this.pickedPermissions.clear();
    this.showForm.set(true);
  }

  startEdit(r: CustomRoleView): void {
    this.editId.set(r.id);
    this.fKey = r.key; this.fName = r.name; this.fDesc = r.description ?? '';
    this.fGrants = new Map(r.websiteGrants.map(g => [g.websiteKey, { websiteKey: g.websiteKey, permissions: [...g.permissions] }]));
    this.pickedSite = ''; this.pickedPermissions.clear();
    this.showForm.set(true);
  }

  cancel(): void { this.showForm.set(false); this.editId.set(null); }

  save(): void {
    if (!this.fKey || !this.fName) return;
    const req: UpsertCustomRoleRequest = {
      key: this.fKey.trim(),
      name: this.fName.trim(),
      description: this.fDesc.trim() || null,
      websiteGrants: this.fGrantList(),
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

