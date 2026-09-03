import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Note } from '../../core/services/api.service';

type Category = 'general' | 'family' | 'finance' | 'work';

const CATEGORIES: Category[] = ['general', 'family', 'finance', 'work'];

@Component({
  selector: 'app-notes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="notes">
      <header class="notes-header">
        <div>
          <h1>📝 Notes</h1>
          <p class="subtitle">{{ notes().length }} note{{ notes().length === 1 ? '' : 's' }} in your workspace</p>
        </div>
        <button class="btn-primary" type="button" (click)="openForm()">+ New Note</button>
      </header>

      <div class="toolbar">
        <input class="input search" type="search" placeholder="🔍 Search notes…" [(ngModel)]="search" />
        <div class="chips">
          <button class="chip" type="button" [class.active]="categoryFilter() === 'all'" (click)="selectCategory('all')">All <span>{{ notes().length }}</span></button>
          @for (c of categories; track c) {
            <button class="chip" type="button" [class.active]="categoryFilter() === c" (click)="selectCategory(c)">{{ c }} <span>{{ categoryCount(c) }}</span></button>
          }
        </div>
        <select class="input sort" [(ngModel)]="sortOrder" (ngModelChange)="page.set(1)" aria-label="Sort notes">
          <option value="updated">Recently updated</option><option value="created">Recently created</option><option value="title">Title A–Z</option>
        </select>
      </div>

      @if (errorMessage()) {
        <div class="error-banner">⚠️ {{ errorMessage() }}</div>
      }

      @if (loading()) {
        <p class="loading">Loading notes…</p>
      } @else if (notes().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🗒️</span>
          <p>No notes yet. Create your first one!</p>
          <button class="btn-primary" type="button" (click)="openForm()">+ New Note</button>
        </div>
      } @else if (filteredNotes().length === 0) {
        <p class="empty">No notes match your search or filter.</p>
      } @else {
        <div class="notes-grid">
          @for (note of pagedNotes(); track note.id) {
            <article class="note-card">
              <div class="note-meta">
                <span class="badge cat-{{ note.category }}">{{ note.category }}</span>
                <small class="updated">{{ note.updatedAt | date:'short' }}</small>
              </div>
              <h3>{{ note.title }}</h3>
              <p class="content" [class.expanded]="expandedId() === note.id">{{ note.content }}</p>
              <div class="note-actions">
                <button class="text-btn" type="button" (click)="toggleExpanded(note.id!)">{{ expandedId() === note.id ? 'Show less' : 'Read note' }}</button>
                <button class="icon-btn" type="button" (click)="edit(note)" title="Edit">✏️</button>
                <button class="icon-btn danger" type="button" (click)="delete(note.id!)" title="Delete">🗑️</button>
              </div>
            </article>
          }
        </div>
        @if (pageCount() > 1) { <div class="pagination"><button class="btn-secondary" [disabled]="page() === 1" (click)="page.set(page() - 1)">Previous</button><span>Page {{ page() }} of {{ pageCount() }}</span><button class="btn-secondary" [disabled]="page() === pageCount()" (click)="page.set(page() + 1)">Next</button></div> }
      }

      @if (showForm()) {
        <div class="scrim" (click)="cancelForm()">
          <div class="dialog" (click)="$event.stopPropagation()">
            <h2>{{ editingNote ? 'Edit note' : 'New note' }}</h2>
            <label class="field"><span>Title</span>
              <input class="input" placeholder="Title" [(ngModel)]="form.title" />
            </label>
            <label class="field"><span>Category</span>
              <select class="input" [(ngModel)]="form.category">
                @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
              </select>
            </label>
            <label class="field"><span>Content</span>
              <textarea class="input" rows="5" placeholder="Content" [(ngModel)]="form.content"></textarea>
            </label>
            <div class="form-actions">
              <button class="btn-secondary" type="button" [disabled]="saving()" (click)="cancelForm()">Cancel</button>
              <button class="btn-primary" type="button" [disabled]="saving() || !form.title.trim() || !form.content.trim()" (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .notes { padding: 2rem; max-width: 1100px; margin: 0 auto; }
    .notes-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.25rem; }
    .notes-header h1 { margin: 0; font-size: 1.5rem; }
    .subtitle { margin: 0.2rem 0 0; color: var(--muted); font-size: 0.9rem; }

    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
    .search { max-width: 280px; margin: 0; }
    .sort { max-width: 180px; margin-left: auto; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .chip {
      background: var(--surface); color: var(--muted); border: 1px solid var(--border);
      border-radius: 99px; padding: 0.3rem 0.85rem; font-size: 0.82rem; cursor: pointer;
      text-transform: capitalize; transition: .12s;
    }
    .chip:hover { border-color: var(--brand); color: var(--brand); }
    .chip.active { background: var(--brand); color: var(--brand-text); border-color: var(--brand); }
    .chip span { opacity: .72; margin-left: .2rem; }

    .input {
      display: block; width: 100%; margin-bottom: 0; padding: 0.5rem 0.75rem;
      border: 1px solid var(--border); background: var(--surface); color: var(--text);
      border-radius: 6px; font-size: 1rem; box-sizing: border-box;
    }
    textarea.input { resize: vertical; }
    .field { display: block; margin-bottom: 0.85rem; }
    .field span { display: block; margin-bottom: 0.3rem; font-size: 0.85rem; color: var(--muted); }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem; }

    .notes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
    .note-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
      padding: 1.25rem; box-shadow: var(--shadow-sm); transition: transform .15s, box-shadow .15s;
      display: flex; flex-direction: column;
    }
    .note-card:hover { transform: translateY(-3px); box-shadow: 0 6px 18px rgba(19, 35, 58, 0.16); }
    .note-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
    .badge { background: var(--brand); color: var(--brand-text); padding: 0.15rem 0.6rem; border-radius: 99px; font-size: 0.75rem; text-transform: capitalize; }
    .updated { color: var(--muted); }
    .note-card h3 { margin: 0 0 0.4rem; }
    .note-card .content {
      margin: 0 0 1rem; color: var(--muted); flex: 1;
      display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
    }
    .note-card .content.expanded { display: block; overflow: visible; white-space: pre-wrap; }
    .note-actions { display: flex; justify-content: flex-end; gap: 0.4rem; }
    .text-btn { margin-right: auto; border: 0; background: transparent; color: var(--brand); cursor: pointer; font-size: .82rem; }
    .icon-btn {
      display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 30px;
      border: 1px solid var(--border); background: var(--surface); border-radius: 7px; cursor: pointer; transition: .12s;
    }
    .icon-btn:hover { border-color: var(--brand); }
    .icon-btn.danger:hover { border-color: var(--danger-border); }

    .btn-primary { background: var(--brand); color: var(--brand-text); border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
    .btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
    button:disabled { opacity: .55; cursor: default; }
    .pagination { display: flex; align-items: center; justify-content: flex-end; gap: .75rem; margin-top: 1rem; color: var(--muted); font-size: .82rem; }

    .loading, .empty { color: var(--muted); }
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
      padding: 3rem 1rem; color: var(--muted); text-align: center;
    }
    .empty-icon { font-size: 2.5rem; }
    .error-banner { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-border); border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1rem; }

    .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .dialog { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 440px; box-shadow: var(--shadow-sm); }
    .dialog h2 { margin: 0 0 1rem; }
  `]
})
export class NotesComponent implements OnInit {
  readonly categories = CATEGORIES;

  notes = signal<Note[]>([]);
  loading = signal(false);
  saving = signal(false);
  showForm = signal(false);
  errorMessage = signal<string | null>(null);
  editingNote: Note | null = null;

  search = signal('');
  categoryFilter = signal<Category | 'all'>('all');
  sortOrder = signal<'updated' | 'created' | 'title'>('updated');
  page = signal(1);
  expandedId = signal<string | null>(null);

  readonly filteredNotes = computed(() => {
    const term = this.search().trim().toLowerCase();
    const category = this.categoryFilter();
    return this.notes().filter((note) => {
      const matchesCategory = category === 'all' || note.category === category;
      const matchesSearch = !term
        || note.title.toLowerCase().includes(term)
        || note.content.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    }).sort((a, b) => {
      if (this.sortOrder() === 'title') return a.title.localeCompare(b.title);
      const field = this.sortOrder() === 'created' ? 'createdAt' : 'updatedAt';
      return String(b[field] ?? '').localeCompare(String(a[field] ?? ''));
    });
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredNotes().length / 9)));
  readonly pagedNotes = computed(() => this.filteredNotes().slice((this.page() - 1) * 9, this.page() * 9));

  form: Note = { title: '', content: '', category: 'general' };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadNotes();
  }

  loadNotes() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.getNotes().subscribe({
      next: (data) => { this.notes.set(data); this.loading.set(false); },
      error: () => {
        this.errorMessage.set('Failed to load notes. Please try again.');
        this.loading.set(false);
      }
    });
  }

  openForm() {
    this.editingNote = null;
    this.form = { title: '', content: '', category: 'general' };
    this.showForm.set(true);
  }

  selectCategory(category: Category | 'all') { this.categoryFilter.set(category); this.page.set(1); }
  categoryCount(category: Category) { return this.notes().filter((note) => note.category === category).length; }
  toggleExpanded(id: string) { this.expandedId.update((current) => current === id ? null : id); }

  edit(note: Note) {
    this.editingNote = note;
    this.form = { ...note };
    this.showForm.set(true);
  }

  cancelForm() {
    this.showForm.set(false);
    this.editingNote = null;
  }

  save() {
    this.form.title = this.form.title.trim();
    this.form.content = this.form.content.trim();
    if (!this.form.title || !this.form.content) return;
    this.saving.set(true);
    if (this.editingNote?.id) {
      const id = this.editingNote.id;
      this.api.updateNote(id, this.form).subscribe({
        next: () => { this.notes.update((notes) => notes.map((note) => note.id === id ? { ...note, ...this.form, updatedAt: new Date().toISOString() } : note)); this.saving.set(false); this.cancelForm(); },
        error: () => { this.saving.set(false); this.errorMessage.set('Failed to update note. Please try again.'); }
      });
    } else {
      this.api.createNote(this.form).subscribe({
        next: (created) => { this.notes.update((notes) => [created, ...notes]); this.saving.set(false); this.cancelForm(); },
        error: () => { this.saving.set(false); this.errorMessage.set('Failed to create note. Please try again.'); }
      });
    }
  }

  delete(id: string) {
    if (confirm('Delete this note?')) {
      this.api.deleteNote(id).subscribe({
        next: () => { this.notes.update((notes) => notes.filter((note) => note.id !== id)); if (this.page() > this.pageCount()) this.page.set(this.pageCount()); },
        error: () => this.errorMessage.set('Failed to delete note. Please try again.')
      });
    }
  }
}
