import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { LocalizationAdminService } from '../../core/services/localization-admin.service';
import { ConfigRegistryService } from '../../core/services/config-registry.service';
import { ConfigService } from '../../core/services/config.service';
import { I18nService } from '../../core/services/i18n.service';
import {
  ExportFormat,
  ImportFormat,
  ImportMode,
  LocaleView,
  LocalizationCoverage,
  TranslationView,
  UpsertLocaleRequest,
} from '../../core/models/localization.models';
import {
  ConfigEntryView,
  ConfigMeta,
  ConfigScope,
  ConfigValueType,
  UpsertConfigEntryRequest,
} from '../../core/models/config-registry.models';

type Tab = 'locales' | 'translate' | 'io' | 'config';

/** A row in the side-by-side translation editor, with the edit held locally until saved. */
interface EditRow {
  namespace: string;
  key: string;
  source: string;
  value: string;
  original: string;
  needsReview: boolean;
}

/**
 * One screen for everything that used to be hard-coded: the languages the sites are served in, the
 * strings themselves, bulk import/export of those strings, and the runtime config registry (URLs,
 * icons, colours, feature flags, limits).
 *
 * Nothing here needs a redeploy to take effect. Saving a string bumps that locale's bundle version,
 * and every open client picks it up on its next manifest poll.
 */
@Component({
  selector: 'app-localization',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1>{{ i18n.t('admin.i18n.title') }}</h1>
          <p class="subtitle">
            Languages, the strings behind every screen, and the runtime configuration that keeps URLs,
            icons and feature flags out of the builds. Changes take effect without a redeploy.
          </p>
        </div>
        <div class="ops">
          <button class="btn ghost sm" (click)="reloadAll()" [disabled]="busy()">Reload</button>
          <button class="btn secondary sm" (click)="refreshServerCaches()" [disabled]="busy()"
                  title="Re-read languages, strings and configuration from the database">
            Refresh server caches
          </button>
        </div>
      </header>

      <nav class="tabs" role="tablist">
        <button role="tab" [class.on]="tab() === 'locales'" (click)="tab.set('locales')">
          {{ i18n.t('admin.i18n.tab.locales') }}
        </button>
        <button role="tab" [class.on]="tab() === 'translate'" (click)="tab.set('translate')">
          {{ i18n.t('admin.i18n.tab.translations') }}
        </button>
        <button role="tab" [class.on]="tab() === 'io'" (click)="tab.set('io')">
          {{ i18n.t('admin.i18n.tab.importExport') }}
        </button>
        <button role="tab" [class.on]="tab() === 'config'" (click)="tab.set('config')">
          {{ i18n.t('admin.i18n.tab.config') }}
        </button>
      </nav>

      <!-- ============================ Languages ============================ -->
      @if (tab() === 'locales') {
        <section class="panel">
          <div class="panel-head">
            <h2>{{ i18n.t('admin.i18n.tab.locales') }}</h2>
            <button class="btn primary sm" (click)="newLocale()">+ Add language</button>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th>Native</th><th>Dir</th><th>Fallback</th>
                <th class="num">Strings</th><th>State</th><th></th>
              </tr>
            </thead>
            <tbody>
              @for (l of locales(); track l.code) {
                <tr [class.on]="localeDraft?.code === l.code">
                  <td><code>{{ l.code }}</code></td>
                  <td>{{ l.englishName }}</td>
                  <td>{{ l.icon }} {{ l.nativeName }}</td>
                  <td>{{ l.direction }}</td>
                  <td>{{ l.fallbackCode || '—' }}</td>
                  <td class="num">{{ l.translatedCount }}</td>
                  <td>
                    @if (l.isDefault) { <span class="tag live">default</span> }
                    @else if (l.isEnabled) { <span class="tag live">enabled</span> }
                    @else { <span class="tag">disabled</span> }
                  </td>
                  <td class="right">
                    <button class="btn ghost xs" (click)="editLocale(l)">Edit</button>
                    @if (!l.isDefault) {
                      <button class="btn danger xs" (click)="removeLocale(l)">Delete</button>
                    }
                  </td>
                </tr>
              }
              @if (!locales().length) {
                <tr><td colspan="8" class="muted pad">No languages registered.</td></tr>
              }
            </tbody>
          </table>

          @if (localeDraft; as d) {
            <div class="form card">
              <h3>{{ isNewLocale ? 'Add language' : 'Edit ' + d.code }}</h3>
              <div class="grid-3">
                <label class="field"><span>Code</span>
                  <input class="input" [(ngModel)]="d.code" [readonly]="!isNewLocale" placeholder="hi"></label>
                <label class="field"><span>Name (English)</span>
                  <input class="input" [(ngModel)]="d.englishName" placeholder="Hindi"></label>
                <label class="field"><span>Name (native)</span>
                  <input class="input" [(ngModel)]="d.nativeName" placeholder="हिन्दी"></label>
                <label class="field"><span>Icon</span>
                  <input class="input" [(ngModel)]="d.icon" placeholder="🇮🇳"></label>
                <label class="field"><span>Direction</span>
                  <select class="input" [(ngModel)]="d.direction">
                    <option value="ltr">ltr</option><option value="rtl">rtl</option>
                  </select></label>
                <label class="field"><span>Fallback language</span>
                  <select class="input" [(ngModel)]="d.fallbackCode">
                    <option value="">(default language)</option>
                    @for (l of locales(); track l.code) {
                      @if (l.code !== d.code) { <option [value]="l.code">{{ l.code }} — {{ l.englishName }}</option> }
                    }
                  </select></label>
                <label class="field"><span>Sort order</span>
                  <input class="input" type="number" [(ngModel)]="d.sortOrder"></label>
                <label class="field"><span>Date format</span>
                  <input class="input" [(ngModel)]="d.dateFormat" placeholder="dd MMM yyyy"></label>
                <label class="field"><span>Currency</span>
                  <input class="input" [(ngModel)]="d.currencyCode" placeholder="INR"></label>
              </div>
              <div class="row-actions">
                <label class="check"><input type="checkbox" [(ngModel)]="d.isEnabled"> Enabled (visible to visitors)</label>
                <label class="check"><input type="checkbox" [(ngModel)]="d.isDefault"> Default language</label>
                <span class="spacer"></span>
                <button class="btn primary sm" (click)="saveLocale()" [disabled]="busy()">Save</button>
                <button class="btn secondary sm" (click)="localeDraft = null">Cancel</button>
              </div>
              <p class="muted small">
                An untranslated key renders the fallback language's string instead of a blank. The
                default language is the last-resort fallback, so it can be neither disabled nor deleted.
              </p>
            </div>
          }

          @if (coverage().length) {
            <div class="card">
              <h3>{{ i18n.t('admin.i18n.coverage') }}</h3>
              <table class="table compact">
                <thead><tr><th>Language</th><th class="num">Keys</th><th class="num">Translated</th>
                  <th class="num">Missing</th><th class="num">Needs review</th><th>Complete</th></tr></thead>
                <tbody>
                  @for (c of coverage(); track c.locale) {
                    <tr>
                      <td><code>{{ c.locale }}</code></td>
                      <td class="num">{{ c.totalKeys }}</td>
                      <td class="num">{{ c.translatedKeys }}</td>
                      <td class="num" [class.warn]="c.missingKeys > 0">{{ c.missingKeys }}</td>
                      <td class="num">{{ c.needsReviewKeys }}</td>
                      <td>
                        <div class="bar"><span [style.width.%]="percent(c)"></span></div>
                        <small class="muted">{{ percent(c) }}%</small>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- ============================ Translations ============================ -->
      @if (tab() === 'translate') {
        <section class="panel">
          <div class="panel-head wrap">
            <h2>{{ i18n.t('admin.i18n.tab.translations') }}</h2>
            <div class="filters">
              <label class="inline"><span>{{ i18n.t('common.label.language') }}</span>
                <select class="input" [ngModel]="editLocaleCode()" (ngModelChange)="selectEditLocale($event)">
                  @for (l of locales(); track l.code) {
                    <option [value]="l.code">{{ l.code }} — {{ l.englishName }}</option>
                  }
                </select></label>
              <label class="inline"><span>Namespace</span>
                <select class="input" [ngModel]="namespace()" (ngModelChange)="setNamespace($event)">
                  <option value="">All</option>
                  @for (ns of namespaces(); track ns) { <option [value]="ns">{{ ns }}</option> }
                </select></label>
              <label class="inline"><span>{{ i18n.t('common.actions.search') }}</span>
                <input class="input" [ngModel]="search()" (ngModelChange)="setSearch($event)"
                       placeholder="key or text"></label>
              <label class="check">
                <input type="checkbox" [ngModel]="missingOnly()" (ngModelChange)="setMissingOnly($event)">
                {{ i18n.t('admin.i18n.missingOnly') }}
              </label>
            </div>
          </div>

          <p class="muted small">
            Every key known in the default language, paired with its <strong>{{ editLocaleCode() }}</strong>
            translation. Leave a row blank to let it fall back. Text is stored as plain text — markup is
            rejected, so a string can never inject HTML into a page.
          </p>

          <table class="table">
            <thead>
              <tr>
                <th class="k">Key</th>
                <th>{{ i18n.t('admin.i18n.sourceText') }}</th>
                <th>{{ i18n.t('admin.i18n.translation') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.namespace + '.' + row.key; let idx = $index) {
                <tr [class.dirty]="row.value !== row.original">
                  <td class="k"><code>{{ row.namespace }}.{{ row.key }}</code></td>
                  <td class="src">{{ row.source }}</td>
                  <td>
                    <input class="input" [(ngModel)]="row.value"
                           [attr.aria-label]="row.namespace + '.' + row.key"
                           [placeholder]="row.source">
                  </td>
                </tr>
              }
              @if (!rows().length && !busy()) {
                <tr><td colspan="3" class="muted pad">{{ i18n.t('common.state.empty') }}</td></tr>
              }
            </tbody>
          </table>

          <div class="row-actions sticky">
            <span class="muted small">
              {{ total() }} keys · showing {{ rows().length }} · {{ dirtyCount() }} unsaved
            </span>
            <span class="spacer"></span>
            <button class="btn ghost sm" (click)="page(-1)" [disabled]="skip() === 0 || busy()">Previous</button>
            <button class="btn ghost sm" (click)="page(1)" [disabled]="skip() + take >= total() || busy()">Next</button>
            <button class="btn primary sm" (click)="saveRows()" [disabled]="busy() || dirtyCount() === 0">
              {{ i18n.t('common.actions.save') }} ({{ dirtyCount() }})
            </button>
          </div>
        </section>
      }

      <!-- ============================ Import / export ============================ -->
      @if (tab() === 'io') {
        <section class="panel">
          <div class="grid-2 wide">
            <div class="card">
              <h3>{{ i18n.t('common.actions.export') }}</h3>
              <p class="muted small">
                Download a language's strings to translate elsewhere, keep in version control, or move
                between environments. <strong>Excel</strong> is the one to hand a translator: one sheet
                per namespace, with the default language's text alongside as the source. Fill in the
                <em>Translation</em> column and upload it back — nothing else needs editing.
              </p>
              <div class="grid-2">
                <label class="field"><span>{{ i18n.t('common.label.language') }}</span>
                  <select class="input" [(ngModel)]="exportLocale">
                    @for (l of locales(); track l.code) {
                      <option [value]="l.code">{{ l.code }} — {{ l.englishName }}</option>
                    }
                  </select></label>
                <label class="field"><span>Format</span>
                  <select class="input" [(ngModel)]="exportFormat">
                    <option value="json">JSON (flat keys)</option>
                    <option value="nested">JSON (nested objects)</option>
                    <option value="csv">CSV</option>
                    <option value="xlsx">Excel (.xlsx)</option>
                  </select></label>
                <label class="field"><span>Namespace</span>
                  <select class="input" [(ngModel)]="exportNamespace">
                    <option value="">All</option>
                    @for (ns of namespaces(); track ns) { <option [value]="ns">{{ ns }}</option> }
                  </select></label>
              </div>
              <button class="btn primary sm" (click)="doExport()" [disabled]="busy()">Download</button>
            </div>

            <div class="card">
              <h3>{{ i18n.t('common.actions.import') }}</h3>
              <p class="muted small">
                Upload a <code>.xlsx</code>, <code>.csv</code> or <code>.json</code> file, or paste a
                payload below. JSON may be flat (<code>"blog.nav.home": "Home"</code>) or nested; CSV
                wants a <code>namespace,key,value</code> header. Every value is validated exactly as a
                hand edit is, so an import can't introduce anything an editor couldn't type.
              </p>
              <div class="grid-2">
                <label class="field"><span>{{ i18n.t('common.label.language') }}</span>
                  <select class="input" [(ngModel)]="importLocale">
                    @for (l of locales(); track l.code) {
                      <option [value]="l.code">{{ l.code }} — {{ l.englishName }}</option>
                    }
                  </select></label>
                <label class="field"><span>Mode</span>
                  <select class="input" [(ngModel)]="importMode">
                    <option value="merge">Merge (add and update)</option>
                    <option value="replace">Replace (clear the namespaces first)</option>
                  </select></label>
                <label class="field"><span>Target namespace</span>
                  <input class="input" [(ngModel)]="importNamespace"
                         placeholder="(taken from each key / sheet)"></label>
              </div>
              <label class="check">
                <input type="checkbox" [(ngModel)]="importNeedsReview"> Mark everything imported as needing review
              </label>

              <label class="field"><span>Upload a file</span>
                <input #fileInput class="input" type="file"
                       accept=".json,.csv,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                       (change)="uploadFile($event)"></label>
              <p class="muted small">A file is sent straight to the server — the format comes from its
                name. Spreadsheets can only be imported this way.</p>

              <label class="field"><span>…or paste JSON / CSV</span>
                <textarea class="input mono" rows="8" [(ngModel)]="importPayload" spellcheck="false"
                          placeholder='{ "blog.nav.home": "होम" }'></textarea></label>
              <div class="row-actions">
                <label class="inline"><span>Pasted format</span>
                  <select class="input" [(ngModel)]="importFormat">
                    <option value="json">JSON</option><option value="csv">CSV</option>
                  </select></label>
                <span class="spacer"></span>
                <button class="btn primary sm" (click)="doImport()"
                        [disabled]="busy() || !importPayload.trim()">Import pasted payload</button>
              </div>

              @if (importResult(); as r) {
                <div class="result">
                  <p><strong>{{ r.created }}</strong> created ·
                     <strong>{{ r.updated }}</strong> updated ·
                     <strong>{{ r.deleted }}</strong> removed ·
                     <strong>{{ r.skipped }}</strong> skipped</p>
                  @if (r.errors.length) {
                    <details open>
                      <summary>{{ r.errors.length }} problem(s)</summary>
                      <ul>@for (e of r.errors; track e) { <li>{{ e }}</li> }</ul>
                    </details>
                  }
                </div>
              }
            </div>
          </div>
        </section>
      }

      <!-- ============================ Configuration ============================ -->
      @if (tab() === 'config') {
        <section class="panel">
          <div class="panel-head wrap">
            <h2>{{ i18n.t('admin.config.title') }}</h2>
            <div class="filters">
              <label class="inline"><span>Group</span>
                <select class="input" [ngModel]="configGroup()" (ngModelChange)="setConfigGroup($event)">
                  <option value="">All</option>
                  @for (g of configGroups(); track g) { <option [value]="g">{{ g }}</option> }
                </select></label>
              <label class="inline"><span>{{ i18n.t('common.actions.search') }}</span>
                <input class="input" [ngModel]="configSearch()" (ngModelChange)="setConfigSearch($event)"
                       placeholder="key or description"></label>
            </div>
            <div class="ops">
              <button class="btn ghost sm" (click)="exportConfig()" [disabled]="busy()">Export</button>
              <button class="btn primary sm" (click)="newConfigEntry()">+ New key</button>
            </div>
          </div>

          <p class="muted small">
            {{ i18n.t('admin.config.secretHint') }}
            URLs and icons are checked against a host allowlist before they are stored, because these
            values are rendered into public pages.
            @if (configMeta(); as m) { Allowed hosts: <code>{{ m.allowedHosts.join(', ') }}</code>. }
          </p>

          <table class="table">
            <thead><tr><th>Key</th><th>Type</th><th>Value</th><th>Scope</th><th></th></tr></thead>
            <tbody>
              @for (e of configEntries(); track e.key) {
                <tr>
                  <td>
                    <code>{{ e.key }}</code>
                    @if (e.localized) { <span class="tag">localized</span> }
                    @if (e.description) { <div class="muted small">{{ e.description }}</div> }
                  </td>
                  <td><span class="tag">{{ e.valueType }}</span></td>
                  <td class="val">
                    @if (e.isSecret) {
                      <em class="muted">{{ e.isSet ? 'set (hidden)' : 'not set' }}</em>
                    } @else if (e.localized) {
                      <code>{{ e.value || e.defaultValue }}</code>
                      <div class="muted small">→ {{ i18n.t(e.value || e.defaultValue) }}</div>
                    } @else if (e.valueType === 'icon') {
                      <span class="icon-preview">{{ e.value || e.defaultValue }}</span>
                      <code>{{ e.value || e.defaultValue }}</code>
                    } @else if (e.valueType === 'color') {
                      <span class="swatch" [style.background]="e.value || e.defaultValue"></span>
                      <code>{{ e.value || e.defaultValue }}</code>
                    } @else {
                      <code class="clip">{{ e.value || e.defaultValue }}</code>
                    }
                  </td>
                  <td>
                    <span class="tag" [class.live]="e.scope === 'public'">{{ e.scope }}</span>
                    @if (e.isSecret) { <span class="tag warn-tag">secret</span> }
                  </td>
                  <td class="right">
                    <button class="btn ghost xs" (click)="editConfigEntry(e)">Edit</button>
                    @if (!e.isSystem) {
                      <button class="btn danger xs" (click)="removeConfigEntry(e)">Delete</button>
                    }
                  </td>
                </tr>
              }
              @if (!configEntries().length && !busy()) {
                <tr><td colspan="5" class="muted pad">{{ i18n.t('common.state.empty') }}</td></tr>
              }
            </tbody>
          </table>

          @if (configDraft; as d) {
            <div class="form card">
              <h3>{{ isNewConfig ? 'New configuration key' : 'Edit ' + d.key }}</h3>
              <div class="grid-3">
                <label class="field"><span>Key</span>
                  <input class="input" [(ngModel)]="d.key" [readonly]="!isNewConfig"
                         placeholder="ui.icon.home"></label>
                <label class="field"><span>Group</span>
                  <input class="input" [(ngModel)]="d.group" placeholder="icons"></label>
                <label class="field"><span>Type</span>
                  <select class="input" [(ngModel)]="d.valueType" [disabled]="configIsSystem">
                    @for (t of valueTypes(); track t) { <option [value]="t">{{ t }}</option> }
                  </select></label>
                <label class="field"><span>Scope</span>
                  <select class="input" [(ngModel)]="d.scope" [disabled]="configIsSystem">
                    @for (s of scopes(); track s) { <option [value]="s">{{ s }}</option> }
                  </select></label>
                <label class="field"><span>Default value</span>
                  <input class="input" [(ngModel)]="d.defaultValue"></label>
              </div>
              <label class="field"><span>Value @if (configIsSecret) { <em>(write-only)</em> }</span>
                <textarea class="input mono" rows="3" [(ngModel)]="d.value" spellcheck="false"
                          [placeholder]="configIsSecret ? 'Leave blank to keep the stored secret' : ''"></textarea></label>
              <label class="field"><span>Description</span>
                <input class="input" [(ngModel)]="d.description"></label>
              <div class="row-actions">
                <label class="check">
                  <input type="checkbox" [(ngModel)]="d.localized" [disabled]="configIsSecret">
                  Value is a translation key
                </label>
                <label class="check">
                  <input type="checkbox" [(ngModel)]="d.isSecret" [disabled]="configIsSystem">
                  Secret (encrypted, never served)
                </label>
                <span class="spacer"></span>
                <button class="btn primary sm" (click)="saveConfigEntry()" [disabled]="busy()">Save</button>
                <button class="btn secondary sm" (click)="configDraft = null">Cancel</button>
              </div>
              @if (configIsSystem) {
                <p class="muted small">
                  A built-in key: other apps rely on its type and scope, so those are fixed. The value,
                  default and description are editable, and it cannot be deleted.
                </p>
              }
            </div>
          }
        </section>
      }

      @if (message()) { <p class="message">{{ message() }}</p> }
      @if (error()) { <div class="toast" (click)="error.set(null)">{{ error() }}</div> }
    </div>
  `,
  styles: [`
    .page { padding:1.5rem; max-width:1250px; margin:0 auto; }
    .head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
    h1 { margin:0; }
    h2 { margin:0; font-size:1.05rem; }
    h3 { margin:0 0 .6rem; font-size:.95rem; }
    .subtitle { color:var(--muted); font-size:.88rem; margin:.2rem 0 0; max-width:70ch; }
    .ops { display:flex; gap:.5rem; align-items:flex-end; flex-wrap:wrap; }
    .tabs { display:flex; gap:.25rem; margin:1.1rem 0 0; border-bottom:1px solid var(--border); flex-wrap:wrap; }
    .tabs button { background:none; border:none; border-bottom:2px solid transparent; color:var(--muted);
      padding:.5rem .85rem; cursor:pointer; font-size:.9rem; }
    .tabs button.on { color:var(--text); border-bottom-color:var(--brand); font-weight:600; }
    .panel { margin-top:1rem; }
    .panel-head { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:.6rem; }
    .panel-head.wrap { flex-wrap:wrap; align-items:flex-end; }
    .filters { display:flex; gap:.6rem; flex-wrap:wrap; align-items:flex-end; }
    .inline { display:flex; flex-direction:column; gap:.15rem; font-size:.78rem; color:var(--muted); }
    .card { border:1px solid var(--border); border-radius:12px; background:var(--surface); padding:1rem; margin-top:1rem; }
    .form.card { border-color:color-mix(in srgb, var(--brand) 40%, var(--border)); }
    .table { width:100%; border-collapse:collapse; font-size:.86rem; background:var(--surface);
      border:1px solid var(--border); border-radius:12px; overflow:hidden; }
    .table th, .table td { text-align:left; padding:.5rem .65rem; border-bottom:1px solid var(--border);
      vertical-align:top; }
    .table th { font-size:.74rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
    .table.compact td, .table.compact th { padding:.35rem .6rem; }
    .table tr.on { background:color-mix(in srgb, var(--brand) 10%, var(--surface)); }
    .table tr.dirty td { background:color-mix(in srgb, var(--brand) 7%, var(--surface)); }
    .num, .right { text-align:right; }
    .k { width:26%; }
    .src { color:var(--muted); width:32%; }
    .val { max-width:34ch; }
    .clip { display:inline-block; max-width:34ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      vertical-align:bottom; }
    .grid-2 { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:.7rem; }
    .grid-2.wide { grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:1rem; }
    .grid-3 { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:.7rem; }
    .field { display:flex; flex-direction:column; gap:.2rem; font-size:.78rem; color:var(--muted); }
    .check { display:inline-flex; align-items:center; gap:.35rem; font-size:.82rem; }
    .row-actions { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-top:.8rem; }
    .row-actions.sticky { position:sticky; bottom:0; background:var(--bg); padding:.6rem 0; border-top:1px solid var(--border); }
    .spacer { flex:1; }
    .muted { color:var(--muted); }
    .small { font-size:.78rem; }
    .pad { padding:.9rem; }
    .warn { color:#c2410c; font-weight:600; }
    .tag { font-size:.68rem; background:var(--bg); border:1px solid var(--border); border-radius:99px;
      padding:.05rem .45rem; color:var(--muted); }
    .tag.live { color:#15803d; border-color:#86efac; }
    .tag.warn-tag { color:#b45309; border-color:#fcd34d; }
    .bar { height:6px; background:var(--bg); border-radius:99px; overflow:hidden; min-width:80px; }
    .bar span { display:block; height:100%; background:var(--brand); }
    .swatch { display:inline-block; width:14px; height:14px; border-radius:4px; border:1px solid var(--border);
      vertical-align:-2px; margin-right:.35rem; }
    .icon-preview { font-size:1.05rem; margin-right:.35rem; }
    .mono { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
    .result { margin-top:.7rem; font-size:.82rem; }
    .result ul { margin:.3rem 0 0; padding-left:1.1rem; color:#b45309; }
    .message { margin-top:1rem; color:#15803d; font-size:.85rem; }
    .toast { position:fixed; right:1rem; bottom:1rem; background:#7f1d1d; color:#fff; padding:.6rem .9rem;
      border-radius:10px; font-size:.85rem; cursor:pointer; max-width:44ch; }
    @media (max-width: 760px) { .k, .src { width:auto; } }
  `],
})
export class LocalizationComponent implements OnInit {
  private api = inject(LocalizationAdminService);
  private configApi = inject(ConfigRegistryService);
  private centralConfig = inject(ConfigService);
  protected readonly i18n = inject(I18nService);

  readonly tab = signal<Tab>('locales');
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  // ---- Languages ----
  readonly locales = signal<LocaleView[]>([]);
  readonly coverage = signal<LocalizationCoverage[]>([]);
  /**
   * Open editors are plain fields, not signals: `ngModel` mutates the draft object in place, and a
   * signal holding that object would not notify on a property change — the checkbox-driven parts of
   * the form (`configIsSecret`, the disabled states) would go stale. Plain fields re-render on the
   * same event that changed them.
   */
  localeDraft: UpsertLocaleRequest | null = null;
  isNewLocale = false;

  // ---- Translation editor ----
  readonly namespaces = signal<string[]>([]);
  readonly editLocaleCode = signal('');
  readonly namespace = signal('');
  readonly search = signal('');
  readonly missingOnly = signal(false);
  readonly rows = signal<EditRow[]>([]);
  readonly total = signal(0);
  readonly skip = signal(0);
  /**
   * Page size comes from the config registry, so it is tunable without a rebuild. A getter, not a
   * field: the central config may still be in flight when this component is constructed.
   */
  get take(): number {
    return this.centralConfig.num('ui.pagesize.default', 25) * 4;
  }
  /**
   * A method, not a `computed`: `ngModel` mutates each row object in place, which does not notify the
   * `rows` signal (the array reference is unchanged). Evaluating it during change detection — which
   * the edit itself triggers — keeps the counter and the dirty-row highlight honest.
   */
  dirtyCount(): number {
    return this.rows().filter((r) => r.value !== r.original).length;
  }

  // ---- Import / export ----
  exportLocale = '';
  exportFormat: ExportFormat = 'json';
  exportNamespace = '';
  importLocale = '';
  importFormat: ImportFormat = 'json';
  importMode: ImportMode = 'merge';
  importNamespace = '';
  importNeedsReview = false;
  importPayload = '';
  readonly importResult = signal<{
    created: number; updated: number; deleted: number; skipped: number; errors: string[];
  } | null>(null);

  // ---- Config registry ----
  readonly configEntries = signal<ConfigEntryView[]>([]);
  readonly configGroups = signal<string[]>([]);
  readonly configMeta = signal<ConfigMeta | null>(null);
  readonly configGroup = signal('');
  readonly configSearch = signal('');
  configDraft: UpsertConfigEntryRequest | null = null;
  isNewConfig = false;
  configIsSystem = false;
  get configIsSecret(): boolean {
    return this.configDraft?.isSecret === true;
  }
  readonly valueTypes = computed<ConfigValueType[]>(
    () => this.configMeta()?.valueTypes ?? ['string', 'number', 'bool', 'json', 'url', 'icon', 'color'],
  );
  readonly scopes = computed<ConfigScope[]>(
    () => this.configMeta()?.scopes ?? ['public', 'authenticated', 'internal'],
  );

  ngOnInit(): void {
    this.reloadAll();
  }

  reloadAll(): void {
    this.loadLocales();
    this.loadNamespaces();
    this.loadCoverage();
    this.loadConfig();
    this.configApi.meta().subscribe({ next: (m) => this.configMeta.set(m), error: () => {} });
    this.configApi.groups().subscribe({ next: (g) => this.configGroups.set(g), error: () => {} });
  }

  /** Re-reads languages, strings and configuration from the database on the server. */
  refreshServerCaches(): void {
    this.busy.set(true);
    this.api.refresh().subscribe({
      next: () => {
        this.configApi.refresh().subscribe({
          next: () => {
            // Pick the new values up in this tab too.
            this.centralConfig.refresh();
            this.i18n.reload();
            this.busy.set(false);
            this.note('Server caches refreshed.');
            this.reloadAll();
          },
          error: (e) => this.fail(e),
        });
      },
      error: (e) => this.fail(e),
    });
  }

  // ---------------------------------------------------------------- Languages

  private loadLocales(): void {
    this.busy.set(true);
    this.api.listLocales().subscribe({
      next: (list) => {
        this.locales.set(list);
        this.busy.set(false);
        if (!this.editLocaleCode()) {
          // Default to the first non-default language: that is the one needing translation.
          const target = list.find((l) => !l.isDefault) ?? list[0];
          if (target) {
            this.editLocaleCode.set(target.code);
            this.exportLocale = target.code;
            this.importLocale = target.code;
            this.loadRows();
          }
        }
      },
      error: (e) => this.fail(e),
    });
  }

  private loadCoverage(): void {
    this.api.coverage().subscribe({ next: (c) => this.coverage.set(c), error: () => {} });
  }

  percent(c: LocalizationCoverage): number {
    if (c.totalKeys === 0) return 100;
    return Math.round((c.translatedKeys / c.totalKeys) * 100);
  }

  newLocale(): void {
    this.isNewLocale = true;
    this.localeDraft = ({
      code: '', englishName: '', nativeName: '', direction: 'ltr', icon: '',
      isDefault: false, isEnabled: true, fallbackCode: '', sortOrder: this.locales().length,
      dateFormat: 'dd MMM yyyy', numberFormat: '1.0-2', currencyCode: 'INR',
    });
  }

  editLocale(l: LocaleView): void {
    this.isNewLocale = false;
    this.localeDraft = ({
      code: l.code, englishName: l.englishName, nativeName: l.nativeName, direction: l.direction,
      icon: l.icon, isDefault: l.isDefault, isEnabled: l.isEnabled, fallbackCode: l.fallbackCode,
      sortOrder: l.sortOrder, dateFormat: l.dateFormat, numberFormat: l.numberFormat,
      currencyCode: l.currencyCode,
    });
  }

  saveLocale(): void {
    const draft = this.localeDraft;
    if (!draft) return;
    this.busy.set(true);
    this.api.upsertLocale(draft).subscribe({
      next: () => {
        this.busy.set(false);
        this.localeDraft = null;
        this.note(`Language ${draft.code} saved.`);
        this.loadLocales();
        this.loadCoverage();
      },
      error: (e) => this.fail(e),
    });
  }

  removeLocale(l: LocaleView): void {
    if (!confirm(`Delete ${l.englishName} (${l.code}) and all of its translations? This cannot be undone.`)) return;
    this.busy.set(true);
    this.api.deleteLocale(l.code).subscribe({
      next: () => {
        this.busy.set(false);
        this.note(`Language ${l.code} deleted.`);
        if (this.editLocaleCode() === l.code) this.editLocaleCode.set('');
        this.loadLocales();
        this.loadCoverage();
      },
      error: (e) => this.fail(e),
    });
  }

  // ---------------------------------------------------------------- Translations

  private loadNamespaces(): void {
    this.api.listNamespaces().subscribe({ next: (ns) => this.namespaces.set(ns), error: () => {} });
  }

  selectEditLocale(code: string): void {
    this.editLocaleCode.set(code);
    this.skip.set(0);
    this.loadRows();
  }

  setNamespace(ns: string): void {
    this.namespace.set(ns);
    this.skip.set(0);
    this.loadRows();
  }

  setSearch(value: string): void {
    this.search.set(value);
    this.skip.set(0);
    this.loadRows();
  }

  setMissingOnly(value: boolean): void {
    this.missingOnly.set(value);
    this.skip.set(0);
    this.loadRows();
  }

  page(direction: number): void {
    const next = this.skip() + direction * this.take;
    this.skip.set(Math.max(0, next));
    this.loadRows();
  }

  private loadRows(): void {
    const locale = this.editLocaleCode();
    if (!locale) return;
    this.busy.set(true);
    this.api
      .listForTranslating(locale, {
        ns: this.namespace() || undefined,
        search: this.search() || undefined,
        missingOnly: this.missingOnly() || undefined,
        skip: this.skip(),
        take: this.take,
      })
      .subscribe({
        next: (page) => {
          this.rows.set(page.items.map((item: TranslationView) => ({
            namespace: item.namespace,
            key: item.key,
            // The API puts the default locale's text in `notes` for these rows.
            source: item.notes,
            value: item.value,
            original: item.value,
            needsReview: item.needsReview,
          })));
          this.total.set(page.total);
          this.busy.set(false);
        },
        error: (e) => this.fail(e),
      });
  }

  saveRows(): void {
    const locale = this.editLocaleCode();
    const dirty = this.rows().filter((r) => r.value !== r.original);
    if (!locale || dirty.length === 0) return;

    this.busy.set(true);
    this.api
      .saveEntries(dirty.map((r) => ({
        locale,
        namespace: r.namespace,
        key: r.key,
        value: r.value,
        needsReview: false,
      })))
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          if (result.errors.length) this.error.set(result.errors.slice(0, 3).join(' · '));
          this.note(`${result.created + result.updated} string(s) saved.`);
          // Reflect the edit in this session immediately.
          this.i18n.reload();
          this.loadRows();
          this.loadCoverage();
          this.loadLocales();
        },
        error: (e) => this.fail(e),
      });
  }

  // ---------------------------------------------------------------- Import / export

  doExport(): void {
    if (!this.exportLocale) return;
    this.busy.set(true);
    this.api.export(this.exportLocale, this.exportFormat, this.exportNamespace || undefined).subscribe({
      next: (blob) => {
        this.busy.set(false);
        const ext = this.exportFormat === 'csv' ? 'csv' : 'json';
        const suffix = this.exportNamespace ? `-${this.exportNamespace}` : '';
        this.download(blob, `translations-${this.exportLocale}${suffix}.${ext}`);
      },
      error: (e) => this.fail(e),
    });
  }

  /**
   * Sends the chosen file straight to the server, which infers the format from its name. This is the
   * only path for a spreadsheet — `.xlsx` is binary, so it cannot be pasted or carried in a JSON body.
   */
  uploadFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.importLocale) return;

    this.busy.set(true);
    this.importResult.set(null);
    this.api
      .importFile(file, {
        locale: this.importLocale,
        mode: this.importMode,
        namespace: this.importNamespace || undefined,
        markNeedsReview: this.importNeedsReview,
      })
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.importResult.set(result);
          this.note(`Imported ${file.name} into ${result.locale}.`);
          // Clear the picker so choosing the same file again re-fires the change event.
          input.value = '';
          this.afterImport(result.locale);
        },
        error: (e) => {
          input.value = '';
          this.fail(e);
        },
      });
  }

  doImport(): void {
    if (!this.importLocale || !this.importPayload.trim()) return;
    this.busy.set(true);
    this.importResult.set(null);
    this.api
      .import({
        locale: this.importLocale,
        format: this.importFormat,
        mode: this.importMode,
        namespace: this.importNamespace || undefined,
        markNeedsReview: this.importNeedsReview,
        payload: this.importPayload,
      })
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.importResult.set(result);
          this.note(`Imported into ${result.locale}.`);
          this.afterImport(result.locale);
        },
        error: (e) => this.fail(e),
      });
  }

  /** Everything an import invalidates: the namespace list, coverage, counts and the open grid. */
  private afterImport(locale: string): void {
    this.loadNamespaces();
    this.loadCoverage();
    this.loadLocales();
    if (locale === this.editLocaleCode()) this.loadRows();
    // The import may have changed strings this very screen renders.
    this.i18n.reload();
  }

  // ---------------------------------------------------------------- Config registry

  setConfigGroup(group: string): void {
    this.configGroup.set(group);
    this.loadConfig();
  }

  setConfigSearch(search: string): void {
    this.configSearch.set(search);
    this.loadConfig();
  }

  private loadConfig(): void {
    this.configApi.list(this.configGroup() || undefined, this.configSearch() || undefined).subscribe({
      next: (entries) => this.configEntries.set(entries),
      error: (e) => this.fail(e),
    });
  }

  newConfigEntry(): void {
    this.isNewConfig = true;
    this.configIsSystem = false;
    this.configDraft = ({
      key: '', group: this.configGroup() || 'general', valueType: 'string', value: '',
      defaultValue: '', scope: 'internal', isSecret: false, localized: false, description: '',
    });
  }

  editConfigEntry(e: ConfigEntryView): void {
    this.isNewConfig = false;
    this.configIsSystem = e.isSystem;
    this.configDraft = ({
      key: e.key, group: e.group, valueType: e.valueType,
      // A secret's value is never returned, so the field starts blank: filling it in replaces it.
      value: e.isSecret ? '' : (e.value ?? ''),
      defaultValue: e.defaultValue, scope: e.scope, isSecret: e.isSecret,
      localized: e.localized, description: e.description,
    });
  }

  saveConfigEntry(): void {
    const draft = this.configDraft;
    if (!draft) return;
    this.busy.set(true);
    this.configApi.upsert(draft).subscribe({
      next: () => {
        this.busy.set(false);
        this.configDraft = null;
        this.note(`${draft.key} saved.`);
        this.loadConfig();
        this.configApi.groups().subscribe({ next: (g) => this.configGroups.set(g), error: () => {} });
        // The value may be one this very app renders.
        this.centralConfig.refresh();
      },
      error: (e) => this.fail(e),
    });
  }

  removeConfigEntry(e: ConfigEntryView): void {
    if (!confirm(`Delete configuration key ${e.key}?`)) return;
    this.busy.set(true);
    this.configApi.remove(e.key).subscribe({
      next: () => {
        this.busy.set(false);
        this.note(`${e.key} deleted.`);
        this.loadConfig();
      },
      error: (err) => this.fail(err),
    });
  }

  exportConfig(): void {
    this.busy.set(true);
    this.configApi.export().subscribe({
      next: (blob) => {
        this.busy.set(false);
        this.download(blob, 'app-config.json');
      },
      error: (e) => this.fail(e),
    });
  }

  // ---------------------------------------------------------------- Helpers

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private note(text: string): void {
    this.message.set(text);
    setTimeout(() => this.message.set(null), this.centralConfig.num('ui.toast.durationms', 4000));
  }

  /** Surfaces the API's own validation message; anything else stays generic. */
  private fail(error: unknown): void {
    this.busy.set(false);
    const message =
      error instanceof HttpErrorResponse && typeof error.error?.error === 'string'
        ? error.error.error
        : this.i18n.t('common.state.error');
    this.error.set(message);
  }
}
