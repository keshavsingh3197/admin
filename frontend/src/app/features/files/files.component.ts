import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FilesService } from '../../core/services/files.service';
import { UsersService } from '../../core/services/users.service';
import { RbacService } from '../../core/services/rbac.service';
import {
  AccessLevel, BreadcrumbItem, BrowseView, FolderDto, FolderShareDto, ShareLevel, SubjectType, UserFile,
} from '../../core/models/file.models';
import { UserListItem } from '../../core/models/user.models';
import { GroupView } from '../../core/models/rbac.models';

interface UploadItem { ref: number; name: string; progress: number; error?: string; }
interface FileKind { label: string; cls: string; }
type PreviewKind = 'image' | 'pdf' | 'text';

@Component({
  selector: 'app-files',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="docs">
      <header class="head">
        <div>
          <h1>Documents</h1>
          <nav class="crumbs">
            <button class="crumb" (click)="open(null)">🏠 Home</button>
            @for (c of breadcrumb(); track c.id) {
              <span class="sep">›</span>
              <button class="crumb" (click)="open(c.id)">{{ c.name }}</button>
            }
          </nav>
        </div>
        <div class="tools">
          @if (canEdit()) {
            <button class="btn secondary" (click)="toggleNewFolder()">
              <svg class="ico" viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Zm2 6a1 1 0 0 1 1 1v2h2a1 1 0 1 1 0 2h-2v2a1 1 0 1 1-2 0v-2H9a1 1 0 1 1 0-2h2v-2a1 1 0 0 1 1-1Z"/></svg>
              New folder
            </button>
            <button class="btn primary" (click)="picker.click()">
              <svg class="ico" viewBox="0 0 24 24"><path d="M12 3a1 1 0 0 1 1 1v9.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.4l3.3 3.3V4a1 1 0 0 1 1-1Zm-7 15a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z"/></svg>
              Upload
            </button>
            <input #picker type="file" hidden multiple (change)="onPick($event)">
          }
          @if (folderId() && canManage()) {
            <button class="btn secondary" (click)="openShare(currentAsFolder())">
              <svg class="ico" viewBox="0 0 24 24"><path d="M18 8a3 3 0 1 0-2.8-4H15a3 3 0 0 0 .1 2l-6 3.5a3 3 0 1 0 0 5L15 18a3 3 0 1 0 .8-1.7L9.9 13a3 3 0 0 0 0-2l6-3.5c.5.9 1.4 1.5 2.4 1.5Z"/></svg>
              Share this folder
            </button>
          }
        </div>
      </header>

      @if (newFolderOpen()) {
        <div class="newfolder">
          <input class="input" placeholder="Folder name" [(ngModel)]="newFolderName" name="nf"
                 (keyup.enter)="createFolder()" />
          <button class="btn primary" [disabled]="!newFolderName.trim()" (click)="createFolder()">Create</button>
          <button class="btn secondary" (click)="toggleNewFolder()">Cancel</button>
        </div>
      }

      @if (canEdit()) {
        <label class="dropzone" [class.drag]="dragging()"
               (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
          <svg class="ico xl" viewBox="0 0 24 24"><path d="M12 3a1 1 0 0 1 1 1v9.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.4l3.3 3.3V4a1 1 0 0 1 1-1Z"/></svg>
          <strong>Drop files here, click Upload, or paste</strong>
          <small>Into {{ folderName() }} · up to {{ maxMb }} MB each</small>
        </label>
      }

      @if (uploads().length) {
        <ul class="uploads">
          @for (u of uploads(); track u.ref) {
            <li [class.failed]="u.error">
              <span class="u-name">{{ u.name }}</span>
              @if (u.error) { <span class="u-err">{{ u.error }}</span> }
              @else {
                <span class="bar"><span class="fill" [style.width.%]="u.progress"></span></span>
                <span class="pct">{{ u.progress }}%</span>
              }
            </li>
          }
        </ul>
      }

      @if (error()) { <div class="banner">{{ error() }}</div> }

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (view(); as v) {
        @if (!v.folders.length && !v.files.length && !v.sharedWithMe.length) {
          <div class="empty">
            <svg class="ico xl" viewBox="0 0 24 24"><path d="M4 6a2 2 0 0 1 2-2h5l2 3h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"/></svg>
            <p>This folder is empty.</p>
          </div>
        }

        @if (v.folders.length) {
          <div class="grid">
            @for (f of v.folders; track f.id) {
              <figure class="card folder" (dblclick)="open(f.id)">
                <button class="tile" (click)="open(f.id)" title="Open">
                  <svg class="ico folder-ico" viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"/></svg>
                  @if (f.shareCount) { <span class="shared-tag" title="Shared">👥 {{ f.shareCount }}</span> }
                </button>
                <figcaption>
                  <span class="name" [title]="f.name">{{ f.name }}</span>
                </figcaption>
                <div class="actions">
                  @if (canEdit()) {
                    <button class="icon-btn" (click)="renameFolder(f)" title="Rename">
                      <svg class="ico" viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4Zm14.7-11.3a1 1 0 0 0 0-1.4l-2-2a1 1 0 0 0-1.4 0L14 6.6 17.4 10l1.3-1.3Z"/></svg>
                    </button>
                  }
                  @if (canManage()) {
                    <button class="icon-btn" (click)="openShare(f)" title="Share">
                      <svg class="ico" viewBox="0 0 24 24"><path d="M18 8a3 3 0 1 0-2.8-4H15a3 3 0 0 0 .1 2l-6 3.5a3 3 0 1 0 0 5L15 18a3 3 0 1 0 .8-1.7L9.9 13a3 3 0 0 0 0-2l6-3.5c.5.9 1.4 1.5 2.4 1.5Z"/></svg>
                    </button>
                    <button class="icon-btn danger" (click)="deleteFolder(f)" title="Delete">
                      <svg class="ico" viewBox="0 0 24 24"><path d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7H4a1 1 0 0 1 0-2h4V4a1 1 0 0 1 1-1Z"/></svg>
                    </button>
                  }
                </div>
              </figure>
            }
          </div>
        }

        @if (v.sharedWithMe.length) {
          <h2 class="section">Shared with me</h2>
          <div class="grid">
            @for (f of v.sharedWithMe; track f.id) {
              <figure class="card folder" (click)="open(f.id)">
                <button class="tile shared" (click)="open(f.id)" title="Open">
                  <svg class="ico folder-ico" viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"/></svg>
                  <span class="shared-tag">👥</span>
                </button>
                <figcaption><span class="name" [title]="f.name">{{ f.name }}</span></figcaption>
              </figure>
            }
          </div>
        }

        @if (v.files.length) {
          @if (v.folders.length || v.sharedWithMe.length) { <h2 class="section">Files</h2> }
          <div class="grid">
            @for (d of v.files; track d.id) {
              <figure class="card">
                <button class="tile doc" [attr.data-kind]="kind(d).cls" (click)="preview(d)" title="Preview">
                  <span class="type">{{ kind(d).label }}</span>
                </button>
                <figcaption>
                  <span class="name" [title]="d.fileName">{{ d.fileName }}</span>
                  <span class="meta">{{ size(d.size) }} · {{ d.createdAt | date:'mediumDate' }}</span>
                </figcaption>
                <div class="actions">
                  <button class="icon-btn" (click)="downloadFile(d)" [disabled]="busy().has(d.id)" title="Download">
                    <svg class="ico" viewBox="0 0 24 24"><path d="M12 3a1 1 0 0 1 1 1v9.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.4l3.3 3.3V4a1 1 0 0 1 1-1Zm-7 15a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z"/></svg>
                  </button>
                  @if (canEdit()) {
                    <button class="icon-btn danger" (click)="deleteFile(d)" title="Delete">
                      <svg class="ico" viewBox="0 0 24 24"><path d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7H4a1 1 0 0 1 0-2h4V4a1 1 0 0 1 1-1Z"/></svg>
                    </button>
                  }
                </div>
              </figure>
            }
          </div>
        }
      }
    </div>

    <!-- Preview overlay -->
    @if (previewFile(); as pf) {
      <div class="overlay" (click)="closePreview()">
        <div class="panel" (click)="$event.stopPropagation()">
          <header class="p-head">
            <span class="p-title" [title]="pf.fileName">{{ pf.fileName }}</span>
            <span class="p-tools">
              <button class="btn secondary" (click)="downloadFile(pf)">Download</button>
              <button class="icon-btn" (click)="closePreview()" title="Close">✕</button>
            </span>
          </header>
          <div class="p-body">
            @switch (previewKind()) {
              @case ('image') { <img [src]="previewUrl()" [alt]="pf.fileName" /> }
              @case ('pdf') { <iframe [src]="previewSafeUrl()" title="PDF preview"></iframe> }
              @case ('text') { <pre>{{ previewText() }}</pre> }
            }
          </div>
        </div>
      </div>
    }

    <!-- Share dialog -->
    @if (shareFolder(); as sf) {
      <div class="overlay" (click)="closeShare()">
        <div class="panel narrow" (click)="$event.stopPropagation()">
          <header class="p-head">
            <span class="p-title">Share "{{ sf.name }}"</span>
            <button class="icon-btn" (click)="closeShare()" title="Close">✕</button>
          </header>
          <div class="p-body pad">
            <p class="muted sm">People and groups you add can access this folder and everything inside it.</p>
            <div class="share-add">
              <select class="input sm" [(ngModel)]="addType" name="at" (ngModelChange)="addSubjectId=''">
                <option value="user">Person</option>
                <option value="group">Group</option>
              </select>
              <select class="input" [(ngModel)]="addSubjectId" name="asid">
                <option value="">Choose {{ addType === 'group' ? 'a group' : 'a person' }}…</option>
                @if (addType === 'user') {
                  @for (u of availableUsers(); track u.id) { <option [value]="u.id">{{ u.displayName }} ({{ u.email }})</option> }
                } @else {
                  @for (g of availableGroups(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }
                }
              </select>
              <select class="input sm" [(ngModel)]="addLevel" name="al">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button class="btn primary" [disabled]="!addSubjectId" (click)="addShare()">Add</button>
            </div>

            @if (shares().length) {
              <ul class="share-list">
                @for (s of shares(); track s.subjectType + s.subjectId) {
                  <li>
                    <span class="s-ico">{{ s.subjectType === 'group' ? '👥' : '👤' }}</span>
                    <span class="s-name">{{ s.subjectName }}</span>
                    <span class="badge">{{ s.level }}</span>
                    <button class="icon-btn danger sm" (click)="removeShare(s)" title="Remove">✕</button>
                  </li>
                }
              </ul>
            } @else { <p class="muted sm">Not shared with anyone yet.</p> }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .docs { padding: 2rem; max-width: 1100px; margin: 0 auto; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    h1 { margin: 0 0 .35rem; }
    .crumbs { display: flex; align-items: center; gap: .1rem; flex-wrap: wrap; }
    .crumb { background: none; border: none; color: var(--brand); cursor: pointer; padding: .15rem .35rem; border-radius: 5px; font-size: .92rem; }
    .crumb:hover { background: color-mix(in srgb, var(--brand) 12%, transparent); }
    .sep { color: var(--muted); }
    .tools { display: flex; gap: .5rem; flex-wrap: wrap; }
    .ico { width: 18px; height: 18px; fill: currentColor; flex: none; }
    .ico.xl { width: 40px; height: 40px; fill: color-mix(in srgb, var(--brand) 45%, var(--muted)); }
    .btn { display: inline-flex; align-items: center; gap: .45rem; border: 1px solid transparent; border-radius: 7px; padding: .5rem .9rem; font-size: .9rem; cursor: pointer; }
    .btn.primary { background: var(--brand); color: var(--brand-text); }
    .btn.secondary { background: var(--bg); color: var(--text); border-color: var(--border); }
    .btn:disabled { opacity: .5; cursor: default; }
    .newfolder { display: flex; gap: .5rem; margin-bottom: 1rem; }
    .input { padding: .5rem .7rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); font-size: .92rem; }
    .input:focus { outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 25%, transparent); }
    .input.sm { flex: none; width: auto; }
    .newfolder .input { flex: 1; }
    .dropzone { display: flex; flex-direction: column; align-items: center; gap: .3rem; text-align: center;
      border: 2px dashed var(--border); border-radius: 12px; padding: 1.5rem; color: var(--muted); cursor: pointer; transition: .15s; margin-bottom: 1rem; }
    .dropzone:hover, .dropzone.drag { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 6%, var(--surface)); }
    .dropzone strong { color: var(--text); }
    .uploads { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
    .uploads li { display: flex; align-items: center; gap: .75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: .5rem .85rem; font-size: .9rem; }
    .uploads li.failed { border-color: #f3c9c6; }
    .u-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .u-err { color: #c5221f; }
    .bar { width: 140px; height: 6px; background: var(--border); border-radius: 99px; overflow: hidden; }
    .fill { display: block; height: 100%; background: var(--brand); transition: width .2s; }
    .pct { width: 3ch; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
    .banner { margin-bottom: 1rem; background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c6; border-radius: 6px; padding: .7rem 1rem; }
    .muted { color: var(--muted); }
    .muted.sm { font-size: .85rem; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: .5rem; color: var(--muted); padding: 3rem 0; }
    .section { font-size: 1rem; color: var(--muted); margin: 1.5rem 0 .5rem; }
    .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
    .card { margin: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
      display: flex; flex-direction: column; transition: box-shadow .15s, transform .15s; }
    .card:hover { box-shadow: var(--shadow-sm); transform: translateY(-2px); }
    .tile { position: relative; height: 96px; width: 100%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .folder .tile { background: color-mix(in srgb, var(--brand) 10%, var(--surface)); }
    .folder-ico { width: 44px; height: 44px; fill: color-mix(in srgb, var(--brand) 70%, var(--muted)); }
    .tile.shared .folder-ico { fill: color-mix(in srgb, #7a54c0 70%, var(--muted)); }
    .shared-tag { position: absolute; top: 8px; right: 8px; font-size: .72rem; background: var(--surface); border: 1px solid var(--border); border-radius: 99px; padding: .05rem .4rem; color: var(--muted); }
    .tile.doc .type { font-weight: 700; letter-spacing: .06em; color: #fff; font-size: 1.05rem; }
    .tile.doc[data-kind=img]   { background: linear-gradient(135deg,#3a8dde,#5ea9f0); }
    .tile.doc[data-kind=pdf]   { background: linear-gradient(135deg,#d64541,#e06b64); }
    .tile.doc[data-kind=sheet] { background: linear-gradient(135deg,#1e8e50,#39a869); }
    .tile.doc[data-kind=doc]   { background: linear-gradient(135deg,#2b5dc0,#4a7ce0); }
    .tile.doc[data-kind=txt]   { background: linear-gradient(135deg,#5a6472,#78838f); }
    .tile.doc[data-kind=file]  { background: linear-gradient(135deg,#7a54c0,#9670d6); }
    figcaption { display: flex; flex-direction: column; gap: .15rem; padding: .6rem .75rem; }
    .name { font-weight: 600; font-size: .88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { color: var(--muted); font-size: .76rem; }
    .actions { display: flex; gap: .35rem; padding: 0 .75rem .75rem; opacity: 0; transition: opacity .15s; }
    .card:hover .actions, .card:focus-within .actions { opacity: 1; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 30px;
      border: 1px solid var(--border); background: var(--surface); border-radius: 7px; color: var(--text); cursor: pointer; transition: .12s; }
    .icon-btn:hover { border-color: var(--brand); color: var(--brand); }
    .icon-btn.danger:hover { border-color: #d93025; color: #d93025; }
    .icon-btn.sm { width: 26px; height: 26px; }
    .icon-btn:disabled { opacity: .5; cursor: default; }

    /* Overlays (modelled on the app's route-loader backdrop). */
    .overlay { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
      background: color-mix(in srgb, #0a1020 55%, transparent); backdrop-filter: blur(2px); padding: 1.5rem; }
    .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-sm);
      width: min(920px, 100%); max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
    .panel.narrow { width: min(480px, 100%); }
    .p-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .75rem 1rem; border-bottom: 1px solid var(--border); }
    .p-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .p-tools { display: flex; align-items: center; gap: .5rem; }
    .p-body { flex: 1; overflow: auto; display: flex; align-items: center; justify-content: center; background: var(--bg); }
    .p-body.pad { display: block; padding: 1rem; background: var(--surface); }
    .p-body img { max-width: 100%; max-height: 82vh; object-fit: contain; }
    .p-body iframe { width: 100%; height: 82vh; border: none; background: #fff; }
    .p-body pre { width: 100%; margin: 0; padding: 1rem; white-space: pre-wrap; word-break: break-word; font-size: .85rem; color: var(--text); }
    .share-add { display: flex; gap: .5rem; margin: .75rem 0; flex-wrap: wrap; }
    .share-add .input:nth-child(2) { flex: 1; min-width: 140px; }
    .share-list { list-style: none; margin: .5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: .4rem; }
    .share-list li { display: flex; align-items: center; gap: .5rem; padding: .4rem .5rem; border: 1px solid var(--border); border-radius: 8px; }
    .s-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badge { font-size: .75rem; background: color-mix(in srgb, var(--brand) 14%, var(--surface)); color: var(--brand); border-radius: 99px; padding: .05rem .5rem; text-transform: capitalize; }
  `],
})
export class FilesComponent implements OnInit {
  private api = inject(FilesService);
  private usersApi = inject(UsersService);
  private rbac = inject(RbacService);
  private sanitizer = inject(DomSanitizer);

  readonly maxMb = 10;
  readonly maxBytes = 10 * 1024 * 1024;

  view = signal<BrowseView | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  uploads = signal<UploadItem[]>([]);
  dragging = signal(false);
  busy = signal<Set<string>>(new Set());

  folderId = computed<string | null>(() => this.view()?.folderId ?? null);
  breadcrumb = computed<BreadcrumbItem[]>(() => this.view()?.breadcrumb ?? []);
  myAccess = computed<AccessLevel>(() => this.view()?.myAccess ?? 'viewer');
  canEdit = computed(() => this.myAccess() !== 'viewer');
  canManage = computed(() => this.myAccess() === 'owner');
  folderName = computed(() => {
    const bc = this.breadcrumb();
    return bc.length ? bc[bc.length - 1].name : 'My documents';
  });

  // New-folder inline form
  newFolderOpen = signal(false);
  newFolderName = '';

  // Preview overlay
  previewFile = signal<UserFile | null>(null);
  previewKind = signal<PreviewKind>('image');
  previewUrl = signal<string | null>(null);
  previewSafeUrl = signal<SafeResourceUrl | null>(null);
  previewText = signal<string>('');

  // Share dialog
  shareFolder = signal<FolderDto | null>(null);
  shares = signal<FolderShareDto[]>([]);
  users = signal<UserListItem[]>([]);
  groups = signal<GroupView[]>([]);
  addType: SubjectType = 'user';
  addSubjectId = '';
  addLevel: ShareLevel = 'viewer';

  private uploadSeq = 0;

  ngOnInit(): void { this.open(null); }

  open(folderId: string | null): void {
    this.loading.set(true);
    this.error.set(null);
    this.newFolderOpen.set(false);
    this.api.browse(folderId).subscribe({
      next: v => { this.view.set(v); this.loading.set(false); },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(e.status === 404 ? 'That folder is no longer available.' : 'Could not load documents.');
        if (e.status === 404 && folderId) this.open(null);
      },
    });
  }

  reload(): void { this.open(this.folderId()); }

  currentAsFolder(): FolderDto {
    const bc = this.breadcrumb();
    const last = bc[bc.length - 1];
    return { id: last.id, name: last.name, parentId: null, shareCount: 0, createdAt: '' };
  }

  // ---- Folders ----
  toggleNewFolder(): void { this.newFolderName = ''; this.newFolderOpen.update(v => !v); }

  createFolder(): void {
    const name = this.newFolderName.trim();
    if (!name) return;
    this.api.createFolder(name, this.folderId()).subscribe({
      next: () => { this.newFolderOpen.set(false); this.reload(); },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not create the folder.'),
    });
  }

  renameFolder(f: FolderDto): void {
    const name = prompt('Rename folder', f.name)?.trim();
    if (!name || name === f.name) return;
    this.api.renameFolder(f.id, name).subscribe({ next: () => this.reload(), error: () => this.error.set('Could not rename.') });
  }

  deleteFolder(f: FolderDto): void {
    if (!confirm(`Delete "${f.name}" and everything inside it? This cannot be undone.`)) return;
    this.api.deleteFolder(f.id).subscribe({ next: () => this.reload(), error: () => this.error.set('Could not delete the folder.') });
  }

  // ---- Uploads ----
  onDragOver(e: DragEvent): void { e.preventDefault(); this.dragging.set(true); }
  onDrop(e: DragEvent): void { e.preventDefault(); this.dragging.set(false); if (e.dataTransfer?.files?.length) this.uploadFiles(e.dataTransfer.files); }
  onPick(e: Event): void { const i = e.target as HTMLInputElement; if (i.files?.length) this.uploadFiles(i.files); i.value = ''; }

  @HostListener('document:paste', ['$event'])
  onPaste(e: ClipboardEvent): void {
    if (this.canEdit() && !this.previewFile() && !this.shareFolder() && e.clipboardData?.files?.length)
      this.uploadFiles(e.clipboardData.files);
  }

  private uploadFiles(list: FileList): void {
    this.error.set(null);
    Array.from(list).forEach(f => this.uploadOne(f));
  }

  private uploadOne(file: File): void {
    const ref = ++this.uploadSeq;
    this.uploads.update(u => [...u, { ref, name: file.name, progress: 0 }]);
    if (file.size > this.maxBytes) { this.setUpload(ref, { error: `Exceeds ${this.maxMb} MB.` }); this.dropLater(ref); return; }

    this.api.upload(file, this.folderId()).subscribe({
      next: ev => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) this.setUpload(ref, { progress: Math.round((ev.loaded / ev.total) * 100) });
        else if (ev.type === HttpEventType.Response) { this.uploads.update(u => u.filter(x => x.ref !== ref)); this.reload(); }
      },
      error: (e: HttpErrorResponse) => { this.setUpload(ref, { error: e.error?.error ?? 'Upload failed.' }); this.dropLater(ref); },
    });
  }

  private setUpload(ref: number, patch: Partial<UploadItem>): void { this.uploads.update(u => u.map(x => x.ref === ref ? { ...x, ...patch } : x)); }
  private dropLater(ref: number): void { setTimeout(() => this.uploads.update(u => u.filter(x => x.ref !== ref)), 6000); }

  // ---- Documents ----
  downloadFile(d: UserFile): void {
    this.busy.update(s => new Set(s).add(d.id));
    this.api.download(d.id).subscribe({
      next: blob => { this.saveBlob(blob, d.fileName); this.clearBusy(d.id); },
      error: () => { this.error.set(`Could not download ${d.fileName}.`); this.clearBusy(d.id); },
    });
  }

  deleteFile(d: UserFile): void {
    if (!confirm(`Delete ${d.fileName}?`)) return;
    this.api.delete(d.id).subscribe({ next: () => this.reload(), error: () => this.error.set(`Could not delete ${d.fileName}.`) });
  }

  private saveBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  private clearBusy(id: string): void { this.busy.update(s => { const n = new Set(s); n.delete(id); return n; }); }

  // ---- Preview ----
  preview(d: UserFile): void {
    const pk = this.toPreviewKind(d.contentType);
    if (!pk) { this.downloadFile(d); return; } // no inline renderer → just download
    this.api.download(d.id).subscribe({
      next: blob => {
        this.previewFile.set(d);
        this.previewKind.set(pk);
        if (pk === 'text') {
          blob.text().then(t => this.previewText.set(t.length > 200_000 ? t.slice(0, 200_000) + '\n…(truncated)' : t));
        } else {
          const url = URL.createObjectURL(blob);
          this.previewUrl.set(url);
          if (pk === 'pdf') this.previewSafeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        }
      },
      error: () => this.error.set(`Could not preview ${d.fileName}.`),
    });
  }

  closePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null); this.previewSafeUrl.set(null); this.previewText.set(''); this.previewFile.set(null);
  }

  private toPreviewKind(t: string): PreviewKind | null {
    if (t.startsWith('image/')) return 'image';
    if (t === 'application/pdf') return 'pdf';
    if (t.startsWith('text/')) return 'text';
    return null;
  }

  // ---- Sharing ----
  openShare(f: FolderDto): void {
    this.shareFolder.set(f);
    this.addType = 'user'; this.addSubjectId = ''; this.addLevel = 'viewer';
    this.loadShares(f.id);
    if (!this.users().length) this.usersApi.list().subscribe({ next: u => this.users.set(u), error: () => {} });
    if (!this.groups().length) this.rbac.listGroups().subscribe({ next: g => this.groups.set(g), error: () => {} });
  }

  closeShare(): void { this.shareFolder.set(null); this.shares.set([]); this.reload(); }

  private loadShares(id: string): void {
    this.api.listShares(id).subscribe({ next: s => this.shares.set(s), error: () => this.shares.set([]) });
  }

  availableUsers = computed(() => {
    const taken = new Set(this.shares().filter(s => s.subjectType === 'user').map(s => s.subjectId));
    return this.users().filter(u => !taken.has(u.id));
  });
  availableGroups = computed(() => {
    const taken = new Set(this.shares().filter(s => s.subjectType === 'group').map(s => s.subjectId));
    return this.groups().filter(g => !taken.has(g.id));
  });

  addShare(): void {
    const f = this.shareFolder();
    if (!f || !this.addSubjectId) return;
    this.api.addShare(f.id, { subjectType: this.addType, subjectId: this.addSubjectId, level: this.addLevel }).subscribe({
      next: () => { this.addSubjectId = ''; this.loadShares(f.id); },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not add the share.'),
    });
  }

  removeShare(s: FolderShareDto): void {
    const f = this.shareFolder();
    if (!f) return;
    this.api.removeShare(f.id, s.subjectType, s.subjectId).subscribe({ next: () => this.loadShares(f.id), error: () => this.error.set('Could not remove the share.') });
  }

  // ---- Helpers ----
  kind(f: UserFile): FileKind {
    const t = f.contentType;
    if (t.startsWith('image/')) return { label: 'IMG', cls: 'img' };
    if (t === 'application/pdf') return { label: 'PDF', cls: 'pdf' };
    if (t === 'text/csv' || t.includes('spreadsheet') || t === 'application/vnd.ms-excel') return { label: 'XLS', cls: 'sheet' };
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
