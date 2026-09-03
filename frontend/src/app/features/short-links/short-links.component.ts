import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ShortLinksService } from '../../core/services/short-links.service';
import { ShortLink } from '../../core/models/short-link.models';

@Component({
  selector: 'app-short-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="shortlinks">
      <header class="head">
        <div>
          <h1>🔗 Short Links</h1>
          <p class="subtitle">{{ links().length }} link{{ links().length === 1 ? '' : 's' }} · {{ totalClicks() }} total clicks</p>
        </div>
        <button class="btn-primary" type="button" (click)="openForm()">+ New Link</button>
      </header>

      @if (errorMessage()) {
        <div class="error-banner">⚠️ {{ errorMessage() }}</div>
      }

      @if (loading()) {
        <p class="loading">Loading short links…</p>
      } @else if (links().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🔗</span>
          <p>No short links yet. Shorten your first URL!</p>
          <button class="btn-primary" type="button" (click)="openForm()">+ New Link</button>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr><th>Link</th><th>Target</th><th>Clicks</th><th>Created</th><th>Expires</th><th></th></tr>
            </thead>
            <tbody>
              @for (link of links(); track link.id) {
                <tr [class.expired]="isExpired(link)">
                  <td>
                    <button class="linkish" type="button" (click)="copy(link)" [title]="shareUrl(link)">
                      {{ link.code }} {{ copiedId() === link.id ? '✓ copied' : '📋' }}
                    </button>
                  </td>
                  <td class="target" [title]="link.targetUrl">{{ link.targetUrl }}</td>
                  <td>{{ link.clicks }}</td>
                  <td>{{ link.createdAt | date:'short' }}</td>
                  <td>{{ link.expiresAt ? (link.expiresAt | date:'short') : '—' }}</td>
                  <td class="actions">
                    <button class="icon-btn" type="button" (click)="edit(link)" title="Edit">✏️</button>
                    <button class="icon-btn danger" type="button" (click)="remove(link)" title="Delete">🗑️</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (showForm()) {
        <div class="scrim" (click)="cancelForm()">
          <div class="dialog" (click)="$event.stopPropagation()">
            <h2>{{ editingLink ? 'Edit short link' : 'New short link' }}</h2>
            <label class="field"><span>Destination URL</span>
              <input class="input" type="url" placeholder="https://example.com/very/long/path" [(ngModel)]="form.targetUrl" />
            </label>
            @if (!editingLink) {
              <label class="field"><span>Custom code (optional)</span>
                <input class="input" placeholder="e.g. my-link" [(ngModel)]="form.code" />
              </label>
            }
            <label class="field"><span>Expires (optional)</span>
              <input class="input" type="datetime-local" [(ngModel)]="form.expiresAtLocal" />
            </label>
            @if (formError()) { <p class="form-error">{{ formError() }}</p> }
            <div class="form-actions">
              <button class="btn-secondary" type="button" (click)="cancelForm()">Cancel</button>
              <button class="btn-primary" type="button" [disabled]="saving() || !form.targetUrl" (click)="save()">
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .shortlinks { padding: 2rem; max-width: 1100px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; }
    .head h1 { margin: 0; font-size: 1.5rem; }
    .subtitle { margin: 0.2rem 0 0; color: var(--muted); font-size: 0.9rem; }

    .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); box-shadow: var(--shadow-sm); }
    .tbl { width: 100%; border-collapse: collapse; }
    .tbl th, .tbl td { text-align: left; padding: 0.65rem 0.9rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
    .tbl th { color: var(--muted); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.02em; }
    .tbl tr:last-child td { border-bottom: none; }
    .target { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    tr.expired td { opacity: 0.55; }
    .actions { display: flex; gap: 0.4rem; }

    .linkish { background: none; border: none; padding: 0; color: var(--brand); font-weight: 600; cursor: pointer; font-size: 0.9rem; }
    .icon-btn {
      display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 30px;
      border: 1px solid var(--border); background: var(--surface); border-radius: 7px; cursor: pointer; transition: .12s;
    }
    .icon-btn:hover { border-color: var(--brand); }
    .icon-btn.danger:hover { border-color: var(--danger-border); }

    .input {
      display: block; width: 100%; padding: 0.5rem 0.75rem;
      border: 1px solid var(--border); background: var(--surface); color: var(--text);
      border-radius: 6px; font-size: 1rem; box-sizing: border-box;
    }
    .field { display: block; margin-bottom: 0.85rem; }
    .field span { display: block; margin-bottom: 0.3rem; font-size: 0.85rem; color: var(--muted); }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem; }
    .form-error { color: var(--danger); font-size: 0.85rem; margin: -0.4rem 0 0.6rem; }

    .btn-primary { background: var(--brand); color: var(--brand-text); border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }
    .btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }

    .loading { color: var(--muted); }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 3rem 1rem; color: var(--muted); text-align: center; }
    .empty-icon { font-size: 2.5rem; }
    .error-banner { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-border); border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1rem; }

    .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .dialog { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 440px; box-shadow: var(--shadow-sm); }
    .dialog h2 { margin: 0 0 1rem; }
  `]
})
export class ShortLinksComponent implements OnInit {
  links = signal<ShortLink[]>([]);
  loading = signal(false);
  saving = signal(false);
  showForm = signal(false);
  errorMessage = signal<string | null>(null);
  formError = signal<string | null>(null);
  copiedId = signal<string | null>(null);
  editingLink: ShortLink | null = null;

  readonly totalClicks = computed(() => this.links().reduce((sum, l) => sum + l.clicks, 0));

  form = { targetUrl: '', code: '', expiresAtLocal: '' };

  constructor(private shortLinksApi: ShortLinksService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.shortLinksApi.getAll().subscribe({
      next: (data) => { this.links.set(data); this.loading.set(false); },
      error: () => {
        this.errorMessage.set('Failed to load short links. Please try again.');
        this.loading.set(false);
      }
    });
  }

  isExpired(link: ShortLink): boolean {
    return !!link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now();
  }

  shareUrl(link: ShortLink): string {
    return this.shortLinksApi.shareUrl(link.code);
  }

  copy(link: ShortLink) {
    navigator.clipboard.writeText(this.shareUrl(link)).then(() => {
      this.copiedId.set(link.id ?? null);
      setTimeout(() => this.copiedId.set(null), 1500);
    });
  }

  openForm() {
    this.editingLink = null;
    this.form = { targetUrl: '', code: '', expiresAtLocal: '' };
    this.formError.set(null);
    this.showForm.set(true);
  }

  edit(link: ShortLink) {
    this.editingLink = link;
    this.form = {
      targetUrl: link.targetUrl,
      code: link.code,
      expiresAtLocal: link.expiresAt ? link.expiresAt.slice(0, 16) : '',
    };
    this.formError.set(null);
    this.showForm.set(true);
  }

  cancelForm() {
    this.showForm.set(false);
    this.editingLink = null;
  }

  save() {
    this.formError.set(null);
    this.saving.set(true);
    const expiresAt = this.form.expiresAtLocal ? new Date(this.form.expiresAtLocal).toISOString() : null;

    const onError = (err: HttpErrorResponse) => {
      this.formError.set(typeof err.error === 'string' ? err.error : 'Failed to save the short link.');
      this.saving.set(false);
    };
    const onSuccess = () => {
      this.saving.set(false);
      this.cancelForm();
      this.load();
    };

    if (this.editingLink?.id) {
      this.shortLinksApi.update(this.editingLink.id, { targetUrl: this.form.targetUrl, expiresAt }).subscribe({ next: onSuccess, error: onError });
    } else {
      this.shortLinksApi.create({ targetUrl: this.form.targetUrl, code: this.form.code || null, expiresAt }).subscribe({ next: onSuccess, error: onError });
    }
  }

  remove(link: ShortLink) {
    if (!link.id || !confirm(`Delete the short link "${link.code}"?`)) return;
    this.shortLinksApi.delete(link.id).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage.set('Failed to delete the short link. Please try again.')
    });
  }
}
