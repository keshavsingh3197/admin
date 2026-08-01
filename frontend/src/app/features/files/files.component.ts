import { ChangeDetectionStrategy, Component, HostListener, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { FilesService } from '../../core/services/files.service';
import { UserFile } from '../../core/models/file.models';

interface UploadItem {
  ref: number;
  name: string;
  progress: number;
  error?: string;
}

/** A file-type tile: short label + colour class, derived from the MIME type. */
interface FileKind {
  label: string;
  cls: string;
}

@Component({
  selector: 'app-files',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="files">
      <header class="head">
        <div>
          <h1>My Files</h1>
          <p class="sub">
            <svg class="ico lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 0 1 6 0v3Z"/></svg>
            Private to you. Encrypted at rest, never shared.
          </p>
        </div>
        <button class="btn primary" (click)="picker.click()">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V4a1 1 0 0 1 1-1Z"/><path d="M5 19a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z" transform="translate(0 1)"/></svg>
          Upload
        </button>
        <input #picker type="file" hidden multiple (change)="onPick($event)">
      </header>

      <label class="dropzone" [class.drag]="dragging()"
             (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
        <svg class="ico xl" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V4a1 1 0 0 1 1-1Z"/></svg>
        <strong>Drop files here, click Upload, or paste</strong>
        <small>Images, PDF, Word, Excel or text · up to {{ maxMb }} MB each</small>
      </label>

      @if (uploads().length) {
        <ul class="uploads">
          @for (u of uploads(); track u.ref) {
            <li [class.failed]="u.error">
              <span class="u-name">{{ u.name }}</span>
              @if (u.error) {
                <span class="u-err">{{ u.error }}</span>
              } @else {
                <span class="bar"><span class="fill" [style.width.%]="u.progress"></span></span>
                <span class="pct">{{ u.progress }}%</span>
              }
            </li>
          }
        </ul>
      }

      @if (error()) {
        <div class="banner">{{ error() }}</div>
      }

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (files().length === 0) {
        <div class="empty">
          <svg class="ico xl" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4a2 2 0 0 1 2-2h5l2 3h5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z"/></svg>
          <p>No files yet. Upload your first one.</p>
        </div>
      } @else {
        <div class="grid">
          @for (f of files(); track f.id) {
            <figure class="card">
              <div class="thumb" [attr.data-kind]="kind(f).cls">
                <span class="type">{{ kind(f).label }}</span>
                <span class="badge" title="Private">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 0 1 6 0v3Z"/></svg>
                </span>
              </div>
              <figcaption>
                <span class="name" [title]="f.fileName">{{ f.fileName }}</span>
                <span class="meta">{{ size(f.size) }} · {{ f.createdAt | date:'mediumDate' }}</span>
              </figcaption>
              <div class="actions">
                <button class="icon-btn" (click)="download(f)" [disabled]="busy().has(f.id)" title="Download">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V4a1 1 0 0 1 1-1Zm-7 15a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z"/></svg>
                </button>
                <button class="icon-btn danger" (click)="remove(f)" title="Delete">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7H4a1 1 0 0 1 0-2h4V4a1 1 0 0 1 1-1Zm1 6a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Z"/></svg>
                </button>
              </div>
            </figure>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .files { padding: 2rem; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    h1 { margin: 0 0 .25rem; }
    .sub { margin: 0; color: #666; font-size: .9rem; display: flex; align-items: center; gap: .4rem; }
    .sub .lock { width: 15px; height: 15px; fill: #1a73e8; }
    .ico { width: 18px; height: 18px; fill: currentColor; flex: none; }
    .ico.xl { width: 40px; height: 40px; fill: #b7c4d6; }
    .btn { display: inline-flex; align-items: center; gap: .5rem; border: none; border-radius: 6px; padding: .55rem 1rem; font-size: .95rem; cursor: pointer; }
    .btn.primary { background: #1a73e8; color: #fff; }
    .btn.primary:hover { background: #1666d0; }
    .dropzone { display: flex; flex-direction: column; align-items: center; gap: .35rem; text-align: center;
      border: 2px dashed #cdd6e2; border-radius: 12px; padding: 1.75rem; color: #667; cursor: pointer; transition: .15s; }
    .dropzone:hover, .dropzone.drag { border-color: #1a73e8; background: #f5f9ff; }
    .dropzone strong { color: #334; font-weight: 600; }
    .dropzone small { color: #889; }
    .uploads { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
    .uploads li { display: flex; align-items: center; gap: .75rem; background: #f7f9fc; border: 1px solid #e6ebf2; border-radius: 8px; padding: .5rem .85rem; font-size: .9rem; }
    .uploads li.failed { background: #fdf1f0; border-color: #f3c9c6; }
    .u-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .u-err { color: #c5221f; }
    .bar { width: 140px; height: 6px; background: #e4e9f1; border-radius: 99px; overflow: hidden; }
    .fill { display: block; height: 100%; background: #1a73e8; transition: width .2s; }
    .pct { width: 3ch; text-align: right; color: #556; font-variant-numeric: tabular-nums; }
    .banner { margin-top: 1rem; background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c6; border-radius: 6px; padding: .7rem 1rem; }
    .muted { color: #666; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: .5rem; color: #889; padding: 3rem 0; }
    .grid { margin-top: 1.5rem; display: grid; gap: 1.1rem; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .card { margin: 0; background: #fff; border: 1px solid #e6ebf2; border-radius: 12px; overflow: hidden;
      display: flex; flex-direction: column; transition: box-shadow .15s, transform .15s; }
    .card:hover { box-shadow: 0 6px 22px rgba(20,40,80,.12); transform: translateY(-2px); }
    .thumb { position: relative; height: 104px; display: flex; align-items: center; justify-content: center; }
    .thumb .type { font-weight: 700; letter-spacing: .06em; color: #fff; font-size: 1.05rem; }
    .thumb[data-kind=img]   { background: linear-gradient(135deg,#3a8dde,#5ea9f0); }
    .thumb[data-kind=pdf]   { background: linear-gradient(135deg,#d64541,#e06b64); }
    .thumb[data-kind=sheet] { background: linear-gradient(135deg,#1e8e50,#39a869); }
    .thumb[data-kind=doc]   { background: linear-gradient(135deg,#2b5dc0,#4a7ce0); }
    .thumb[data-kind=txt]   { background: linear-gradient(135deg,#5a6472,#78838f); }
    .thumb[data-kind=file]  { background: linear-gradient(135deg,#7a54c0,#9670d6); }
    .badge { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border-radius: 50%;
      background: rgba(255,255,255,.9); display: flex; align-items: center; justify-content: center; }
    .badge .ico { width: 13px; height: 13px; fill: #33415a; }
    figcaption { display: flex; flex-direction: column; gap: .2rem; padding: .7rem .8rem; }
    .name { font-weight: 600; font-size: .9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { color: #889; font-size: .78rem; }
    .actions { display: flex; gap: .4rem; padding: 0 .8rem .8rem; opacity: 0; transition: opacity .15s; }
    .card:hover .actions, .card:focus-within .actions { opacity: 1; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 32px;
      border: 1px solid #dbe2ec; background: #fff; border-radius: 7px; color: #445; cursor: pointer; transition: .12s; }
    .icon-btn:hover { background: #f0f5fc; border-color: #1a73e8; color: #1a73e8; }
    .icon-btn.danger:hover { background: #fdecec; border-color: #d93025; color: #d93025; }
    .icon-btn:disabled { opacity: .5; cursor: default; }
  `],
})
export class FilesComponent implements OnInit {
  readonly maxBytes = 10 * 1024 * 1024;
  readonly maxMb = 10;

  files = signal<UserFile[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  uploads = signal<UploadItem[]>([]);
  dragging = signal(false);
  busy = signal<Set<string>>(new Set()); // file ids with an in-flight download

  private uploadSeq = 0;

  constructor(private api: FilesService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: f => { this.files.set(f); this.loading.set(false); },
      error: () => { this.error.set('Could not load your files.'); this.loading.set(false); },
    });
  }

  onDragOver(e: DragEvent): void { e.preventDefault(); this.dragging.set(true); }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    if (e.dataTransfer?.files?.length) this.uploadFiles(e.dataTransfer.files);
  }

  onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.uploadFiles(input.files);
    input.value = '';
  }

  @HostListener('document:paste', ['$event'])
  onPaste(e: ClipboardEvent): void {
    if (e.clipboardData?.files?.length) this.uploadFiles(e.clipboardData.files);
  }

  private uploadFiles(list: FileList): void {
    this.error.set(null);
    Array.from(list).forEach(file => this.uploadOne(file));
  }

  private uploadOne(file: File): void {
    const ref = ++this.uploadSeq;
    const item: UploadItem = { ref, name: file.name, progress: 0 };
    this.uploads.update(u => [...u, item]);

    if (file.size > this.maxBytes) {
      this.setUpload(ref, { error: `Exceeds ${this.maxMb} MB limit.` });
      this.dropUploadLater(ref);
      return;
    }

    this.api.upload(file).subscribe({
      next: ev => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) {
          this.setUpload(ref, { progress: Math.round((ev.loaded / ev.total) * 100) });
        } else if (ev.type === HttpEventType.Response) {
          if (ev.body) this.files.update(f => [ev.body as UserFile, ...f]);
          this.uploads.update(u => u.filter(x => x.ref !== ref));
        }
      },
      error: (err: HttpErrorResponse) => {
        this.setUpload(ref, { error: err.error?.error ?? 'Upload failed.' });
        this.dropUploadLater(ref);
      },
    });
  }

  private setUpload(ref: number, patch: Partial<UploadItem>): void {
    this.uploads.update(u => u.map(x => (x.ref === ref ? { ...x, ...patch } : x)));
  }

  private dropUploadLater(ref: number): void {
    // Leave failed rows visible briefly, then clear them.
    setTimeout(() => this.uploads.update(u => u.filter(x => x.ref !== ref)), 6000);
  }

  download(f: UserFile): void {
    this.busy.update(s => new Set(s).add(f.id));
    this.api.download(f.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.fileName;
        a.click();
        URL.revokeObjectURL(url);
        this.clearBusy(f.id);
      },
      error: () => { this.error.set(`Could not download ${f.fileName}.`); this.clearBusy(f.id); },
    });
  }

  private clearBusy(id: string): void {
    this.busy.update(s => { const n = new Set(s); n.delete(id); return n; });
  }

  remove(f: UserFile): void {
    if (!confirm(`Delete ${f.fileName}? This cannot be undone.`)) return;
    this.api.delete(f.id).subscribe({
      next: () => this.files.update(list => list.filter(x => x.id !== f.id)),
      error: () => this.error.set(`Could not delete ${f.fileName}.`),
    });
  }

  kind(f: UserFile): FileKind {
    const t = f.contentType;
    if (t.startsWith('image/')) return { label: 'IMG', cls: 'img' };
    if (t === 'application/pdf') return { label: 'PDF', cls: 'pdf' };
    if (t === 'text/csv' || t.includes('spreadsheet') || t === 'application/vnd.ms-excel')
      return { label: 'XLS', cls: 'sheet' };
    if (t.includes('word') || t === 'application/msword') return { label: 'DOC', cls: 'doc' };
    if (t.startsWith('text/')) return { label: 'TXT', cls: 'txt' };
    return { label: 'FILE', cls: 'file' };
  }

  size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
