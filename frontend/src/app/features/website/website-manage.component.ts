import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { WebsiteContentService } from '../../core/services/website.service';
import { SettingsService } from '../../core/services/settings.service';
import { LocalizationAdminService } from '../../core/services/localization-admin.service';
import { WebsiteContentView } from '../../core/models/website.models';
import { ApplicationMetrics, WebsiteLinkView } from '../../core/models/settings.models';
import { LocaleView } from '../../core/models/localization.models';

/**
 * The content behind the public sites: each entry is a JSON payload addressed by site key + content key
 * (portfolio/about, portfolio/experience, blog/announcement…), which the site fetches from the public
 * endpoint once it is published.
 *
 * Unpublished entries are invisible to the sites, so this doubles as a draft: save it, look at it, then
 * publish. Which sites exist is the registry on the Settings page — this page only fills them in.
 */
@Component({
  selector: 'app-website-manage',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1>Websites</h1>
          <p class="subtitle">Manage registered applications, access footprint, and published content.</p>
        </div>
        <div class="ops">
          <label class="inline">
            <span>Site</span>
            <select class="input" [ngModel]="site()" (ngModelChange)="selectSite($event)">
              <option value="">All sites</option>
              @for (s of sites(); track s.id) { <option [value]="s.key">{{ s.name }} ({{ s.key }})</option> }
              @for (k of extraSiteKeys(); track k) { <option [value]="k">{{ k }}</option> }
            </select>
          </label>
          <button class="btn primary sm" (click)="openNew()">+ New content</button>
        </div>
      </header>

      <div class="tabs"><button [class.active]="tab() === 'applications'" (click)="tab.set('applications')">Applications</button><button [class.active]="tab() === 'content'" (click)="tab.set('content')">Content</button></div>

      @if (tab() === 'content') {
      <div class="grid">
        <div class="col list">
          @for (c of entries(); track c.id) {
            <button class="row" [class.on]="c.id === active()?.id" (click)="open(c)">
              <span class="row-top">
                <span class="key">{{ c.siteKey }} / {{ c.contentKey }}</span>
                <span class="tag" [class.live]="c.isPublished">{{ c.isPublished ? 'published' : 'draft' }}</span>
              </span>
              <span class="when">
                <span class="tag">{{ c.locale }}</span>
                v{{ c.version }} · {{ c.updatedAt | date:'d MMM yyyy, HH:mm' }}
              </span>
            </button>
          }
          @if (!entries().length && !loading()) { <p class="muted pad">Nothing here yet.</p> }
          @if (loading()) { <p class="muted pad">Loading…</p> }
        </div>

        <div class="col detail">
          @if (editing()) {
            <div class="form">
              <div class="grid-2">
                <label class="field"><span>Site key</span>
                  <input class="input" [(ngModel)]="draft.siteKey" [readonly]="!isNew()" placeholder="portfolio"></label>
                <label class="field"><span>Content key</span>
                  <input class="input" [(ngModel)]="draft.contentKey" [readonly]="!isNew()" placeholder="about"></label>
              </div>
              <label class="field"><span>Language</span>
                <select class="input" [(ngModel)]="draft.locale" [disabled]="!isNew()">
                  <option value="">(default language)</option>
                  @for (l of locales(); track l.code) {
                    <option [value]="l.code">{{ l.code }} — {{ l.englishName }}</option>
                  }
                </select></label>
              <p class="muted small">Keys are lower case letters, numbers, <code>-</code> and <code>_</code>,
                2–64 characters. They cannot be changed once created — the key plus the language is the
                address a site fetches. A site asking for a language with no entry here falls back to
                the language's fallback chain, so a page never renders empty.</p>

              <label class="field"><span>Payload (JSON)</span>
                <textarea class="input mono" rows="18" [(ngModel)]="draft.payloadJson" spellcheck="false"></textarea></label>

              <div class="row-actions">
                <label class="check">
                  <input type="checkbox" [(ngModel)]="draft.isPublished"> Published (visible to the site)
                </label>
                <span class="spacer"></span>
                <button class="btn ghost sm" (click)="format()">Format JSON</button>
                <button class="btn primary sm" (click)="save()" [disabled]="busy()">Save</button>
                <button class="btn secondary sm" (click)="cancel()">Cancel</button>
              </div>

              @if (!isNew() && active(); as c) {
                <p class="muted small">Read by the site at
                  <code>{{ publicUrl(c) }}</code>
                  @if (!c.isPublished) { — <strong>not while it is a draft</strong> }
                </p>
                @if (missingLocalesFor(c).length) {
                  <p class="muted small">Not yet available in:
                    @for (l of missingLocalesFor(c); track l.code) {
                      <button class="btn ghost sm" (click)="translateFrom(c, l.code)"
                              [title]="'Start a ' + l.englishName + ' version from this one'">
                        + {{ l.englishName }}
                      </button>
                    }
                  </p>
                }
                <button class="btn danger sm" (click)="remove(c)">Delete this entry</button>
              }
            </div>
          } @else {
            <p class="muted pad">Select an entry to edit it, or create a new one.</p>
          }
        </div>
      </div>
      } @else {
        <div class="app-layout">
          <section class="col app-list">
            @for (app of sites(); track app.id) {
              <button class="app-row" [class.on]="selectedApp()?.id === app.id" (click)="selectApp(app)"><span><strong>{{ app.name }}</strong><small>{{ app.key }} · {{ app.isEnabled ? 'Enabled' : 'Disabled' }}</small></span><span aria-hidden="true">›</span></button>
            }
            <button class="btn primary new-app" (click)="newApplication()">+ New application</button>
          </section>
          <section class="col app-detail">
            @if (selectedApp() && appMetrics(); as metrics) {
              <div class="metric-grid">
                <a class="metric-tile" [routerLink]="['/users']" [queryParams]="{ app: selectedApp()!.key }"><span>Users</span><strong>{{ metrics.userCount }}</strong></a>
                <a class="metric-tile" [routerLink]="['/roles']" [queryParams]="{ app: selectedApp()!.key }"><span>Roles</span><strong>{{ metrics.roleCount }}</strong></a>
                <a class="metric-tile" [routerLink]="['/groups']" [queryParams]="{ app: selectedApp()!.key }"><span>Groups</span><strong>{{ metrics.groupCount }}</strong></a>
                <!-- Not a link: there is no "every user's sessions for this app" screen, and linking to
                     /profile/sessions (yours alone) was misleading — a plain stat until that page exists. -->
                <article><span>Active sessions</span><strong>{{ metrics.activeSessionCount }}</strong></article>
                <a class="metric-tile" [routerLink]="['/analytics']" [queryParams]="{ app: selectedApp()!.key }"><span>Analytics</span><strong>→</strong></a>
                <a class="metric-tile" [routerLink]="['/health']"><span>Health</span><strong>→</strong></a>
              </div>
            }
            <div class="app-form">
              <div class="grid-2"><label class="field"><span>Application key</span><input class="input" [(ngModel)]="appDraft.key" [readonly]="!!editingAppId" placeholder="portfolio"></label><label class="field"><span>Name</span><input class="input" [(ngModel)]="appDraft.name" placeholder="Portfolio"></label></div>
              <label class="field"><span>URL</span><input class="input" type="url" [(ngModel)]="appDraft.url" placeholder="https://example.keshavsingh.in"></label>
              <div class="grid-2"><label class="field"><span>Sort order</span><input class="input" type="number" [(ngModel)]="appDraft.sortOrder"></label><label class="check app-enabled"><input type="checkbox" [(ngModel)]="appDraft.isEnabled"> Enabled</label></div>
              <div class="row-actions"><button class="btn primary" [disabled]="busy()" (click)="saveApplication()">{{ editingAppId ? 'Update application' : 'Create application' }}</button>@if (editingAppId) { <button class="btn danger" [disabled]="busy()" (click)="deleteApplication()">Delete</button> }</div>
            </div>
          </section>
        </div>
      }

      @if (message()) { <p class="message">{{ message() }}</p> }
      @if (error()) { <div class="toast" (click)="error.set(null)">{{ error() }}</div> }
    </div>
  `,
  styles: [`
    .page { padding:1.5rem; max-width:1150px; margin:0 auto; }
    .head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
    h1 { margin:0; }
    .subtitle { color:var(--muted); font-size:.88rem; margin:.2rem 0 0; }
    .ops { display:flex; gap:.5rem; align-items:flex-end; flex-wrap:wrap; }
    .tabs{display:flex;gap:1rem;border-bottom:1px solid var(--border);margin-top:1rem}.tabs button{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--muted);padding:.65rem .1rem;cursor:pointer;font-weight:600}.tabs button.active{color:var(--text);border-color:var(--brand)}
    .inline { display:flex; flex-direction:column; gap:.15rem; font-size:.78rem; color:var(--muted); }
    .grid { display:grid; grid-template-columns:320px 1fr; gap:1rem; margin-top:1rem; align-items:start; }
    .col { border:1px solid var(--border); border-radius:12px; background:var(--surface); overflow:hidden; }
    .list { max-height:76vh; overflow-y:auto; }
    .row { display:flex; flex-direction:column; gap:.2rem; width:100%; text-align:left; background:none; border:none;
      border-bottom:1px solid var(--border); padding:.55rem .8rem; cursor:pointer; color:var(--text); }
    .row:hover { background:var(--bg); }
    .row.on { background:color-mix(in srgb, var(--brand) 10%, var(--surface)); }
    .row-top { display:flex; justify-content:space-between; gap:.5rem; align-items:center; }
    .key { font-size:.86rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .when { color:var(--muted); font-size:.72rem; }
    .tag { font-size:.68rem; background:var(--bg); border:1px solid var(--border); border-radius:99px;
      padding:0 .45rem; color:var(--muted); white-space:nowrap; }
    .tag.live { background:color-mix(in srgb, #188038 16%, var(--surface)); color:#188038; border-color:transparent; }
    .detail .form { padding:.9rem; }
    .field { display:block; margin-bottom:.6rem; }
    .field span { display:block; font-size:.78rem; color:var(--muted); margin-bottom:.2rem; }
    .input { display:block; width:100%; box-sizing:border-box; padding:.45rem .6rem; border:1px solid var(--border);
      border-radius:7px; background:var(--bg); color:var(--text); font-size:.88rem; font-family:inherit; }
    .input[readonly] { opacity:.7; }
    .mono { font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.8rem; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:.6rem; }
    .row-actions { display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; margin:.5rem 0; }
    .row-actions .spacer { flex:1; }
    .check { display:flex; align-items:center; gap:.35rem; font-size:.85rem; }
    .btn { display:inline-flex; align-items:center; gap:.3rem; border:1px solid transparent; border-radius:7px;
      padding:.45rem .8rem; font-size:.85rem; cursor:pointer; }
    .btn.sm { padding:.35rem .7rem; font-size:.82rem; }
    .btn.primary { background:var(--brand); color:var(--brand-text); }
    .btn.secondary { background:var(--bg); color:var(--text); border-color:var(--border); }
    .btn.ghost { background:transparent; color:var(--text); border-color:var(--border); }
    .btn.danger { background:transparent; color:#d93025; border-color:color-mix(in srgb, #d93025 40%, transparent); }
    .btn:disabled { opacity:.5; cursor:default; }
    .muted { color:var(--muted); } .small { font-size:.78rem; } .pad { padding:1rem; }
    .message { color:var(--muted); font-size:.82rem; margin-top:.5rem; }
    .toast { position:fixed; bottom:1rem; left:50%; transform:translateX(-50%); background:#fce8e6; color:#c5221f;
      border:1px solid #f5c6c6; border-radius:8px; padding:.6rem 1rem; z-index:50; cursor:pointer; }
    .app-layout{display:grid;grid-template-columns:300px 1fr;gap:1rem;margin-top:1rem;align-items:start}.app-list{padding:.4rem}.app-row{display:flex;align-items:center;justify-content:space-between;width:100%;padding:.7rem;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;text-align:left}.app-row span:first-child{display:flex;flex-direction:column;gap:.15rem}.app-row small{color:var(--muted)}.app-row.on{background:color-mix(in srgb,var(--brand) 10%,var(--surface))}.new-app{margin:.7rem}.app-detail{padding:1rem}.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-bottom:1rem}.metric-grid article,.metric-grid .metric-tile{border:1px solid var(--border);padding:.7rem;border-radius:7px}.metric-tile{display:block;text-decoration:none;color:inherit;transition:border-color .15s,background .15s}.metric-tile:hover{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 6%,var(--surface))}.metric-grid span{display:block;color:var(--muted);font-size:.72rem}.metric-grid strong{font-size:1.2rem}.app-form{border-top:1px solid var(--border);padding-top:1rem}.app-enabled{align-self:end;padding:.55rem 0}@media (max-width: 900px) { .grid,.app-layout { grid-template-columns:1fr; }.metric-grid{grid-template-columns:repeat(2,1fr)} }
  `],
})
export class WebsiteManageComponent implements OnInit {
  private api = inject(WebsiteContentService);
  private settings = inject(SettingsService);
  private localization = inject(LocalizationAdminService);

  /** Registered languages: content is authored one row per language for the same key. */
  locales = signal<LocaleView[]>([]);
  sites = signal<WebsiteLinkView[]>([]);
  tab = signal<'applications' | 'content'>('applications');
  selectedApp = signal<WebsiteLinkView | null>(null);
  appMetrics = signal<ApplicationMetrics | null>(null);
  entries = signal<WebsiteContentView[]>([]);
  active = signal<WebsiteContentView | null>(null);
  site = signal('');
  editing = signal(false);
  isNew = signal(false);
  loading = signal(false);
  busy = signal(false);
  message = signal<string | null>(null);
  error = signal<string | null>(null);

  draft = this.blank();
  editingAppId: string | null = null;
  appDraft = { key: '', name: '', url: '', isEnabled: true, sortOrder: 0 };

  ngOnInit(): void {
    this.settings.listWebsites().subscribe({
      next: list => { this.sites.set(list); if (list.length) this.selectApp(list[0]); },
      error: () => this.error.set('Could not load the website registry.'),
    });
    this.localization.listLocales().subscribe({
      // Non-fatal: without the list the editor falls back to the default language server-side.
      next: list => this.locales.set(list),
      error: () => {},
    });
    this.load();
  }

  /** Sites that have content but aren't in the registry, so their entries stay reachable. */
  extraSiteKeys(): string[] {
    const known = new Set(this.sites().map(s => s.key));
    return [...new Set(this.entries().map(e => e.siteKey))].filter(key => !known.has(key));
  }

  selectSite(key: string): void {
    this.site.set(key);
    this.cancel();
    this.load();
  }

  selectApp(app: WebsiteLinkView): void {
    this.selectedApp.set(app);
    this.editingAppId = app.id;
    this.appDraft = { key: app.key, name: app.name, url: app.url, isEnabled: app.isEnabled, sortOrder: app.sortOrder };
    this.appMetrics.set(null);
    this.settings.websiteMetrics(app.key).subscribe({ next: metrics => this.appMetrics.set(metrics), error: () => this.error.set('Could not load application metrics.') });
  }

  newApplication(): void {
    this.selectedApp.set(null);
    this.appMetrics.set(null);
    this.editingAppId = null;
    this.appDraft = { key: '', name: '', url: '', isEnabled: true, sortOrder: this.sites().length };
  }

  saveApplication(): void {
    if (!this.appDraft.key.trim() || !this.appDraft.name.trim() || !this.appDraft.url.trim()) { this.error.set('Key, name, and URL are required.'); return; }
    this.busy.set(true);
    const request = { ...this.appDraft, key: this.appDraft.key.trim(), name: this.appDraft.name.trim(), url: this.appDraft.url.trim() };
    const operation = this.editingAppId ? this.settings.updateWebsite(this.editingAppId, request) : this.settings.createWebsite(request);
    operation.subscribe({ next: saved => { this.busy.set(false); this.sites.update(items => [...items.filter(item => item.id !== saved.id), saved].sort((a, b) => a.sortOrder - b.sortOrder)); this.selectApp(saved); this.message.set(`Saved application ${saved.name}.`); }, error: (err: HttpErrorResponse) => { this.busy.set(false); this.error.set(err.error?.error ?? 'Could not save the application.'); } });
  }

  deleteApplication(): void {
    const app = this.selectedApp();
    if (!app || !confirm(`Delete application "${app.name}"? Its content records are not deleted.`)) return;
    this.busy.set(true);
    this.settings.deleteWebsite(app.id).subscribe({ next: () => { this.busy.set(false); this.sites.update(items => items.filter(item => item.id !== app.id)); this.newApplication(); }, error: () => { this.busy.set(false); this.error.set('Could not delete the application.'); } });
  }

  load(): void {
    this.loading.set(true);
    this.api.list(this.site() || undefined).subscribe({
      next: list => {
        this.entries.set(list);
        this.loading.set(false);
        const open = this.active();
        if (open) this.active.set(list.find(e => e.id === open.id) ?? null);
      },
      error: () => { this.loading.set(false); this.error.set('Could not load website content.'); },
    });
  }

  open(entry: WebsiteContentView): void {
    this.active.set(entry);
    this.isNew.set(false);
    this.editing.set(true);
    this.message.set(null);
    this.draft = {
      siteKey: entry.siteKey,
      contentKey: entry.contentKey,
      locale: entry.locale,
      payloadJson: this.pretty(entry.payloadJson),
      isPublished: entry.isPublished,
    };
  }

  /**
   * Starts a translation of the open entry: same keys, a different language, the current payload as a
   * starting point. Saving creates a second row rather than overwriting the first.
   */
  translateFrom(entry: WebsiteContentView, locale: string): void {
    this.active.set(null);
    this.isNew.set(true);
    this.editing.set(true);
    this.message.set(null);
    this.draft = {
      siteKey: entry.siteKey,
      contentKey: entry.contentKey,
      locale,
      payloadJson: this.pretty(entry.payloadJson),
      isPublished: false,
    };
  }

  /** Languages this key has no row for yet — the ones worth offering a "translate" shortcut. */
  missingLocalesFor(entry: WebsiteContentView): LocaleView[] {
    const present = new Set(
      this.entries()
        .filter(e => e.siteKey === entry.siteKey && e.contentKey === entry.contentKey)
        .map(e => e.locale),
    );
    return this.locales().filter(l => !present.has(l.code));
  }

  openNew(): void {
    this.active.set(null);
    this.isNew.set(true);
    this.editing.set(true);
    this.message.set(null);
    this.draft = { ...this.blank(), siteKey: this.site() };
  }

  cancel(): void {
    this.editing.set(false);
    this.isNew.set(false);
    this.active.set(null);
    this.draft = this.blank();
  }

  format(): void {
    try {
      this.draft.payloadJson = JSON.stringify(JSON.parse(this.draft.payloadJson), null, 2);
      this.message.set(null);
    } catch {
      this.error.set('That payload is not valid JSON.');
    }
  }

  save(): void {
    if (!this.draft.siteKey.trim() || !this.draft.contentKey.trim()) {
      this.error.set('A site key and a content key are both required.');
      return;
    }
    try {
      JSON.parse(this.draft.payloadJson);
    } catch {
      // The API rejects invalid JSON too; catching it here saves a round trip and keeps the draft.
      this.error.set('That payload is not valid JSON.');
      return;
    }

    this.busy.set(true);
    this.api.upsert({
      siteKey: this.draft.siteKey.trim(),
      contentKey: this.draft.contentKey.trim(),
      // Blank means "the default language" — the API resolves it, so this stays valid if the default
      // changes.
      locale: this.draft.locale || undefined,
      payloadJson: this.draft.payloadJson,
      isPublished: this.draft.isPublished,
    }).subscribe({
      next: saved => {
        this.busy.set(false);
        this.message.set(`Saved ${saved.siteKey}/${saved.contentKey} [${saved.locale}] (v${saved.version}).`);
        this.load();
        this.open(saved);
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.error ?? 'Could not save that entry.');
      },
    });
  }

  remove(entry: WebsiteContentView): void {
    if (!confirm(`Delete ${entry.siteKey}/${entry.contentKey}? The site will stop receiving it.`)) return;
    this.api.remove(entry.id).subscribe({
      next: () => { this.cancel(); this.load(); },
      error: () => this.error.set('Could not delete that entry.'),
    });
  }

  publicUrl(entry: WebsiteContentView): string {
    return this.api.publicUrl(entry.siteKey, entry.contentKey, entry.locale);
  }

  private pretty(json: string): string {
    try { return JSON.stringify(JSON.parse(json), null, 2); }
    catch { return json; }
  }

  private blank() {
    // Blank locale = the default language; the API resolves it on save.
    return { siteKey: '', contentKey: '', locale: '', payloadJson: '{\n  \n}', isPublished: false };
  }
}
