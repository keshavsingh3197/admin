import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SettingsService } from '../../core/services/settings.service';
import { ConfigService } from '../../core/services/config.service';
import {
  CreatorChannelView,
  UpsertCreatorChannelRequest,
} from '../../core/models/settings.models';

/**
 * Admin-only management UI for central ecosystem Creator Channels & Social Profiles.
 * Synchronizes channels (keshavsinghworld, OmkarShivBhakti, social accounts) across
 * AnimStudio AI, Social Analytics, Hindu Panchang, Pratiyogita, Blog & Portfolio via GET /api/config.
 */
@Component({
  selector: 'app-channels-manager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="cm-shell">
      <div class="cm-sidebar">
        <div class="cm-sidebar-top">
          <input class="cm-search" type="search" [(ngModel)]="query"
                 placeholder="Filter channels, handles, platforms…" />
          <button type="button" class="cm-btn primary sm" (click)="newChannel()">+ Add Channel</button>
        </div>

        @if (loading()) {
          <p class="cm-empty">Loading channels…</p>
        } @else if (!filteredChannels().length) {
          <p class="cm-empty">No creator channels match your filter.</p>
        } @else {
          <div class="cm-list">
            @for (ch of filteredChannels(); track ch.id) {
              <button type="button" class="cm-item"
                      [class.active]="selected()?.id === ch.id"
                      (click)="selectChannel(ch)">
                <div class="cm-item-head">
                  <span class="cm-plat">{{ ch.platform }}</span>
                  <strong>{{ ch.name }}</strong>
                  @if (ch.isPrimary) { <span class="cm-badge primary">Primary</span> }
                </div>
                <div class="cm-item-sub">
                  <span>{{ ch.handle || ch.key }}</span>
                  <span class="cm-state" [class.off]="!ch.isEnabled">
                    {{ ch.isEnabled ? 'Enabled' : 'Disabled' }}
                  </span>
                </div>
                <div class="cm-targets">
                  @if (ch.showInAnalytics) { <span>Analytics</span> }
                  @if (ch.showInPanchang) { <span>Panchang</span> }
                  @if (ch.showInStudio) { <span>Studio</span> }
                  @if (ch.showInFooter) { <span>Footer</span> }
                </div>
              </button>
            }
          </div>
        }
      </div>

      <div class="cm-editor">
        <div class="cm-editor-head">
          <div>
            <h2>{{ selected() ? 'Edit Channel: ' + selected()!.name : 'New Creator Channel' }}</h2>
            <p class="cm-hint">
              Changes published here propagate immediately to Studio AI, Social Analytics, Hindu Panchang,
              and ecosystem footers via <code>/api/config</code>.
            </p>
          </div>
          @if (selected()?.url) {
            <a class="cm-btn secondary sm" [href]="selected()!.url" target="_blank" rel="noopener noreferrer">
              Open Channel ↗
            </a>
          }
        </div>

        @if (error()) { <div class="cm-alert error">{{ error() }}</div> }
        @if (message()) { <div class="cm-alert ok">{{ message() }}</div> }

        <div class="cm-resolve-box">
          <label class="cm-resolve-label">
            <span>Auto-Resolve YouTube Channel (No API key needed)</span>
            <div class="cm-resolve-row">
              <input class="cm-input" [(ngModel)]="resolveInput"
                     placeholder="@keshavsinghworld or @OmkarShivBhakti or https://www.youtube.com/@..." />
              <button type="button" class="cm-btn secondary" (click)="resolveYouTube()" [disabled]="resolving()">
                {{ resolving() ? 'Resolving…' : 'Fetch Live Details' }}
              </button>
            </div>
          </label>
        </div>

        <div class="cm-grid">
          <label class="cm-field">
            <span>Key (slug) *</span>
            <input class="cm-input mono" [(ngModel)]="draft.key" placeholder="keshavsinghworld" />
          </label>
          <label class="cm-field">
            <span>Display Name *</span>
            <input class="cm-input" [(ngModel)]="draft.name" placeholder="Keshav Singh World" />
          </label>
          <label class="cm-field">
            <span>Handle</span>
            <input class="cm-input mono" [(ngModel)]="draft.handle" placeholder="@keshavsinghworld" />
          </label>
          <label class="cm-field">
            <span>Platform</span>
            <select class="cm-input" [(ngModel)]="draft.platform">
              <option value="YouTube">YouTube</option>
              <option value="Instagram">Instagram</option>
              <option value="Facebook">Facebook</option>
              <option value="GitHub">GitHub</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="X">X</option>
              <option value="Website">Website</option>
            </select>
          </label>
          <label class="cm-field span-2">
            <span>Channel / Profile URL (https://) *</span>
            <input class="cm-input mono" [(ngModel)]="draft.url" placeholder="https://www.youtube.com/@keshavsinghworld" />
          </label>
          <label class="cm-field">
            <span>YouTube Channel ID (UC…)</span>
            <input class="cm-input mono" [(ngModel)]="draft.channelId" placeholder="UC..." />
          </label>
          <label class="cm-field">
            <span>Sort Order</span>
            <input class="cm-input" type="number" [(ngModel)]="draft.sortOrder" />
          </label>
          <label class="cm-field">
            <span>Category / Niche</span>
            <input class="cm-input" [(ngModel)]="draft.niche" placeholder="Devotional 3D Animations & Sanatan Culture" />
          </label>
          <label class="cm-field">
            <span>Tagline</span>
            <input class="cm-input" [(ngModel)]="draft.tagline" placeholder="Short subtitle for studio/cards" />
          </label>
          <label class="cm-field span-2">
            <span>Description</span>
            <textarea class="cm-input" rows="2" [(ngModel)]="draft.description"
                      placeholder="Shown in channel directories and studio credits."></textarea>
          </label>
          <label class="cm-field">
            <span>Studio Engine Name (Credit)</span>
            <input class="cm-input" [(ngModel)]="draft.engineName" placeholder="AnimStudio" />
          </label>
          <label class="cm-field">
            <span>Visuals Credit Line</span>
            <input class="cm-input" [(ngModel)]="draft.visualsCredit" placeholder="Omkar Shiv Bhakti 3D Devotional Animations" />
          </label>
          <label class="cm-field">
            <span>Default Hashtags (comma-separated)</span>
            <input class="cm-input mono" [(ngModel)]="hashtagsText" placeholder="OmkarShivBhakti, AnimStudio, KeshavSingh" />
          </label>
          <label class="cm-field">
            <span>Search Tags (comma-separated)</span>
            <input class="cm-input mono" [(ngModel)]="tagsText" placeholder="omkar shiv bhakti, bhakti, keshav singh" />
          </label>
          <label class="cm-field">
            <span>Retired Handles (flagged on SEO checkup)</span>
            <input class="cm-input mono" [(ngModel)]="retiredHandlesText" placeholder="OMKR" />
          </label>
          <label class="cm-field">
            <span>Retired URLs (flagged on SEO checkup)</span>
            <input class="cm-input mono" [(ngModel)]="retiredUrlsText" placeholder="youtube.com/@omkr-shiv" />
          </label>
        </div>

        <div class="cm-toggles">
          <label class="cm-chk"><input type="checkbox" [(ngModel)]="draft.isEnabled" /> Enabled</label>
          <label class="cm-chk"><input type="checkbox" [(ngModel)]="draft.isPrimary" /> Primary Creator Channel</label>
          <label class="cm-chk"><input type="checkbox" [(ngModel)]="draft.showInAnalytics" /> Sync to Social Analytics</label>
          <label class="cm-chk"><input type="checkbox" [(ngModel)]="draft.showInPanchang" /> Sync to Hindu Panchang</label>
          <label class="cm-chk"><input type="checkbox" [(ngModel)]="draft.showInStudio" /> Sync to Studio AI</label>
          <label class="cm-chk"><input type="checkbox" [(ngModel)]="draft.showInFooter" /> Show in Global Footers</label>
        </div>

        <div class="cm-actions">
          <button type="button" class="cm-btn primary" (click)="save()" [disabled]="busy()">
            {{ busy() ? 'Saving…' : (selected() ? 'Update Channel' : 'Create Channel') }}
          </button>
          <button type="button" class="cm-btn secondary" (click)="newChannel()" [disabled]="busy()">Reset / New</button>
          <span class="spacer"></span>
          @if (selected()) {
            <button type="button" class="cm-btn danger" (click)="remove()" [disabled]="busy()">Delete</button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cm-shell { display: grid; grid-template-columns: 320px 1fr; gap: 1rem; margin-top: 1rem; align-items: start; }
    .cm-sidebar { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); overflow: hidden; }
    .cm-sidebar-top { padding: 0.75rem; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.5rem; }
    .cm-search { width: 100%; box-sizing: border-box; padding: 0.45rem 0.65rem; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); font-size: 0.85rem; }
    .cm-list { max-height: 620px; overflow-y: auto; }
    .cm-item { width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--border); padding: 0.75rem; background: transparent; color: var(--text); cursor: pointer; display: flex; flex-direction: column; gap: 0.3rem; }
    .cm-item:hover { background: color-mix(in srgb, var(--brand) 6%, var(--surface)); }
    .cm-item.active { background: color-mix(in srgb, var(--brand) 12%, var(--surface)); border-left: 3px solid var(--brand); }
    .cm-item-head { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .cm-plat { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; padding: 0.12rem 0.42rem; border-radius: 999px; background: color-mix(in srgb, var(--brand) 14%, var(--surface)); color: var(--brand); }
    .cm-badge.primary { font-size: 0.68rem; padding: 0.1rem 0.4rem; border-radius: 999px; background: var(--success-soft); color: var(--success); border: 1px solid var(--success-border); }
    .cm-item-sub { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--muted); }
    .cm-state { color: var(--success); font-weight: 600; }
    .cm-state.off { color: var(--muted); }
    .cm-targets { display: flex; gap: 0.3rem; flex-wrap: wrap; }
    .cm-targets span { font-size: 0.68rem; padding: 0.1rem 0.35rem; border-radius: 4px; background: var(--surface-2); color: var(--muted); border: 1px solid var(--border); }
    .cm-empty { padding: 1.5rem; text-align: center; color: var(--muted); font-size: 0.86rem; margin: 0; }
    .cm-editor { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 1.15rem; }
    .cm-editor-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.9rem; }
    .cm-editor-head h2 { margin: 0 0 0.25rem; font-size: 1.1rem; }
    .cm-hint { margin: 0; font-size: 0.82rem; color: var(--muted); }
    .cm-alert { padding: 0.55rem 0.75rem; border-radius: 7px; font-size: 0.84rem; margin-bottom: 0.85rem; }
    .cm-alert.error { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-border); }
    .cm-alert.ok { background: var(--success-soft); color: var(--success); border: 1px solid var(--success-border); }
    .cm-resolve-box { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; margin-bottom: 1rem; }
    .cm-resolve-label span { display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.35rem; }
    .cm-resolve-row { display: flex; gap: 0.5rem; }
    .cm-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; }
    .cm-field { display: flex; flex-direction: column; gap: 0.22rem; }
    .cm-field.span-2 { grid-column: span 2; }
    .cm-field span { font-size: 0.78rem; color: var(--muted); }
    .cm-input { width: 100%; box-sizing: border-box; padding: 0.46rem 0.65rem; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); font-size: 0.88rem; font-family: inherit; }
    .cm-input.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.82rem; }
    .cm-toggles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem; margin: 1rem 0; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
    .cm-chk { display: flex; align-items: center; gap: 0.45rem; font-size: 0.84rem; cursor: pointer; }
    .cm-actions { display: flex; align-items: center; gap: 0.5rem; }
    .cm-actions .spacer { flex: 1; }
    .cm-btn { display: inline-flex; align-items: center; gap: 0.35rem; border: 1px solid transparent; border-radius: 7px; padding: 0.48rem 0.85rem; font-size: 0.85rem; cursor: pointer; text-decoration: none; font-weight: 500; }
    .cm-btn.sm { padding: 0.36rem 0.7rem; font-size: 0.8rem; }
    .cm-btn.primary { background: var(--brand); color: var(--brand-text); }
    .cm-btn.secondary { background: var(--bg); color: var(--text); border-color: var(--border); }
    .cm-btn.danger { background: transparent; color: var(--danger); border-color: var(--danger-border); }
    .cm-btn:disabled { opacity: 0.55; cursor: default; }
    @media (max-width: 900px) { .cm-shell { grid-template-columns: 1fr; } .cm-grid { grid-template-columns: 1fr; } .cm-field.span-2 { grid-column: auto; } .cm-resolve-row { flex-direction: column; } }
  `],
})
export class ChannelsManagerComponent implements OnInit {
  private readonly settings = inject(SettingsService);
  private readonly config = inject(ConfigService);

  readonly channels = signal<CreatorChannelView[]>([]);
  readonly selected = signal<CreatorChannelView | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly resolving = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  query = '';
  resolveInput = '';
  hashtagsText = '';
  tagsText = '';
  retiredHandlesText = '';
  retiredUrlsText = '';
  draft: UpsertCreatorChannelRequest = this.blankDraft();

  readonly filteredChannels = computed(() => {
    const q = this.query.trim().toLowerCase();
    const list = this.channels();
    if (!q) return list;
    return list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.handle.toLowerCase().includes(q) ||
      c.key.toLowerCase().includes(q) ||
      c.platform.toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.settings.listChannels().subscribe({
      next: list => {
        this.channels.set(list);
        this.loading.set(false);
        if (list.length > 0 && !this.selected()) {
          this.selectChannel(list[0]);
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load creator channels.');
      },
    });
  }

  selectChannel(ch: CreatorChannelView): void {
    this.selected.set(ch);
    this.message.set(null);
    this.error.set(null);
    this.draft = {
      key: ch.key,
      name: ch.name,
      handle: ch.handle,
      platform: ch.platform,
      channelId: ch.channelId,
      url: ch.url,
      niche: ch.niche,
      tagline: ch.tagline,
      description: ch.description,
      engineName: ch.engineName,
      visualsCredit: ch.visualsCredit,
      hashtags: [...ch.hashtags],
      tags: [...ch.tags],
      retiredHandles: [...ch.retiredHandles],
      retiredUrls: [...ch.retiredUrls],
      isPrimary: ch.isPrimary,
      isEnabled: ch.isEnabled,
      showInAnalytics: ch.showInAnalytics,
      showInPanchang: ch.showInPanchang,
      showInStudio: ch.showInStudio,
      showInFooter: ch.showInFooter,
      sortOrder: ch.sortOrder,
    };
    this.hashtagsText = ch.hashtags.join(', ');
    this.tagsText = ch.tags.join(', ');
    this.retiredHandlesText = ch.retiredHandles.join(', ');
    this.retiredUrlsText = ch.retiredUrls.join(', ');
    this.resolveInput = ch.handle || ch.url;
  }

  newChannel(): void {
    this.selected.set(null);
    this.message.set(null);
    this.error.set(null);
    this.draft = {
      ...this.blankDraft(),
      sortOrder: (this.channels().length + 1) * 10,
    };
    this.hashtagsText = '';
    this.tagsText = '';
    this.retiredHandlesText = '';
    this.retiredUrlsText = '';
    this.resolveInput = '';
  }

  resolveYouTube(): void {
    const input = (this.resolveInput || this.draft.handle || this.draft.url).trim();
    if (!input) {
      this.error.set('Enter a YouTube @handle, channel ID, or URL to fetch live channel details.');
      return;
    }
    this.resolving.set(true);
    this.error.set(null);
    this.message.set(null);
    this.settings.resolveYouTubeChannel(input).subscribe({
      next: res => {
        this.resolving.set(false);
        this.draft.platform = 'YouTube';
        this.draft.channelId = res.channelId;
        if (!this.draft.name) this.draft.name = res.title;
        if (!this.draft.handle) this.draft.handle = res.handle;
        if (!this.draft.url) this.draft.url = res.handle.startsWith('@')
          ? `https://www.youtube.com/${res.handle}`
          : res.url;
        if (!this.draft.description && res.description) this.draft.description = res.description;
        if (!this.draft.key) {
          this.draft.key = (res.handle || res.channelId)
            .replace(/^@/, '')
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '');
        }
        this.message.set(`Resolved live YouTube ID ${res.channelId} (${res.title}). Click Update/Create to save.`);
      },
      error: (err: HttpErrorResponse) => {
        this.resolving.set(false);
        this.error.set(err.error?.error ?? 'Could not resolve YouTube channel details.');
      },
    });
  }

  save(): void {
    this.error.set(null);
    this.message.set(null);
    if (!this.draft.key.trim() || !this.draft.name.trim() || !this.draft.url.trim()) {
      this.error.set('Key, Display Name, and URL are required.');
      return;
    }
    const payload: UpsertCreatorChannelRequest = {
      ...this.draft,
      key: this.draft.key.trim().toLowerCase(),
      name: this.draft.name.trim(),
      handle: this.draft.handle.trim(),
      channelId: this.draft.channelId.trim(),
      url: this.draft.url.trim(),
      niche: this.draft.niche.trim(),
      tagline: this.draft.tagline.trim(),
      description: this.draft.description.trim(),
      engineName: this.draft.engineName.trim(),
      visualsCredit: this.draft.visualsCredit.trim(),
      hashtags: this.splitCsv(this.hashtagsText),
      tags: this.splitCsv(this.tagsText),
      retiredHandles: this.splitCsv(this.retiredHandlesText),
      retiredUrls: this.splitCsv(this.retiredUrlsText),
    };

    this.busy.set(true);
    const cur = this.selected();
    const op = cur
      ? this.settings.updateChannel(cur.id, payload)
      : this.settings.createChannel(payload);

    op.subscribe({
      next: saved => {
        this.busy.set(false);
        this.channels.update(list =>
          [...list.filter(x => x.id !== saved.id), saved].sort((a, b) => a.sortOrder - b.sortOrder)
        );
        this.selectChannel(saved);
        this.config.refresh();
        this.message.set(`Saved creator channel "${saved.name}". Ecosystem config refreshed.`);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(err.error?.error ?? 'Could not save creator channel.');
      },
    });
  }

  remove(): void {
    const cur = this.selected();
    if (!cur || !confirm(`Delete creator channel "${cur.name}" from the central ecosystem?`)) return;
    this.busy.set(true);
    this.settings.deleteChannel(cur.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.channels.update(list => list.filter(x => x.id !== cur.id));
        this.config.refresh();
        this.newChannel();
        this.message.set(`Deleted creator channel "${cur.name}".`);
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Could not delete creator channel.');
      },
    });
  }

  private splitCsv(raw: string): string[] {
    return raw.split(',').map(x => x.trim()).filter(Boolean);
  }

  private blankDraft(): UpsertCreatorChannelRequest {
    return {
      key: '',
      name: '',
      handle: '',
      platform: 'YouTube',
      channelId: '',
      url: '',
      niche: '',
      tagline: '',
      description: '',
      engineName: '',
      visualsCredit: '',
      hashtags: [],
      tags: [],
      retiredHandles: [],
      retiredUrls: [],
      isPrimary: false,
      isEnabled: true,
      showInAnalytics: true,
      showInPanchang: false,
      showInStudio: true,
      showInFooter: true,
      sortOrder: 10,
    };
  }
}
