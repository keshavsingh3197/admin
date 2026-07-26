import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Note } from '../../core/services/api.service';

@Component({
  selector: 'app-notes',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="notes">
      <div class="notes-header">
        <h1>Notes</h1>
        <button class="btn-primary" (click)="openForm()">+ New Note</button>
      </div>

      @if (showForm()) {
        <div class="form-card">
          <h2>{{ editingNote ? 'Edit Note' : 'New Note' }}</h2>
          <input class="input" placeholder="Title" [(ngModel)]="form.title" />
          <select class="input" [(ngModel)]="form.category">
            <option value="general">General</option>
            <option value="family">Family</option>
            <option value="finance">Finance</option>
            <option value="work">Work</option>
          </select>
          <textarea class="input" rows="4" placeholder="Content" [(ngModel)]="form.content"></textarea>
          <div class="form-actions">
            <button class="btn-primary" (click)="save()">Save</button>
            <button class="btn-secondary" (click)="cancelForm()">Cancel</button>
          </div>
        </div>
      }

      @if (loading()) {
        <p class="loading">Loading notes…</p>
      } @else if (notes().length === 0) {
        <p class="empty">No notes yet. Create your first one!</p>
      } @else {
        <div class="notes-list">
          @for (note of notes(); track note.id) {
            <div class="note-card">
              <div class="note-meta">
                <span class="badge">{{ note.category }}</span>
                <small>{{ note.updatedAt | date:'short' }}</small>
              </div>
              <h3>{{ note.title }}</h3>
              <p>{{ note.content }}</p>
              <div class="note-actions">
                <button class="btn-secondary" (click)="edit(note)">Edit</button>
                <button class="btn-danger" (click)="delete(note.id!)">Delete</button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .notes { padding: 2rem; }
    .notes-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .form-card { background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; }
    .form-card h2 { margin: 0 0 1rem; }
    .input { display: block; width: 100%; margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; box-sizing: border-box; }
    textarea.input { resize: vertical; }
    .form-actions { display: flex; gap: 0.75rem; }
    .notes-list { display: flex; flex-direction: column; gap: 1rem; }
    .note-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 1.25rem; }
    .note-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .badge { background: #e8f0fe; color: #1a73e8; padding: 0.15rem 0.6rem; border-radius: 99px; font-size: 0.8rem; text-transform: capitalize; }
    .note-card h3 { margin: 0 0 0.5rem; }
    .note-card p { margin: 0 0 1rem; color: #555; }
    .note-actions { display: flex; gap: 0.5rem; }
    .btn-primary { background: #1a73e8; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
    .btn-secondary { background: transparent; border: 1px solid #ccc; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
    .btn-danger { background: transparent; border: 1px solid #d93025; color: #d93025; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
    .loading, .empty { color: #666; }
  `]
})
export class NotesComponent implements OnInit {
  notes = signal<Note[]>([]);
  loading = signal(false);
  showForm = signal(false);
  editingNote: Note | null = null;

  form: Note = { title: '', content: '', category: 'general' };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadNotes();
  }

  loadNotes() {
    this.loading.set(true);
    this.api.getNotes().subscribe({
      next: (data) => { this.notes.set(data); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  openForm() {
    this.editingNote = null;
    this.form = { title: '', content: '', category: 'general' };
    this.showForm.set(true);
  }

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
    if (this.editingNote?.id) {
      this.api.updateNote(this.editingNote.id, this.form).subscribe(() => {
        this.cancelForm();
        this.loadNotes();
      });
    } else {
      this.api.createNote(this.form).subscribe(() => {
        this.cancelForm();
        this.loadNotes();
      });
    }
  }

  delete(id: string) {
    if (confirm('Delete this note?')) {
      this.api.deleteNote(id).subscribe(() => this.loadNotes());
    }
  }
}
