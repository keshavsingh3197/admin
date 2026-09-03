import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DbConsoleService } from '../../core/services/db-console.service';
import {
  DbConsoleCapabilities, MongoCollectionSummary, MongoConsolePage,
} from '../../core/models/db-console.models';

type Operation = 'find' | 'aggregate' | 'distinct';
type ResultView = 'table' | 'json';

/** How many top-level fields the table view shows before it stops adding columns. */
const MAX_COLUMNS = 12;

/**
 * A query editor for the app's own MongoDB — what a SQL console is for a relational app.
 *
 * Nothing here decides what is safe to run: the API validates every query (no server-side JavaScript,
 * read-only aggregations, secret fields redacted) and caps every result. Edits and deletes are one
 * document at a time, by `_id`, because a mistyped filter that rewrites a collection is the classic way
 * to lose data from a console.
 */
@Component({
  selector: 'app-db-console',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1>Database</h1>
          <p class="subtitle">
            Query and edit <strong>{{ caps()?.database || 'the app database' }}</strong> directly.
            @if (caps() && !caps()!.canWrite) { <span class="tag">read-only</span> }
          </p>
        </div>
        <div class="ops">
          @if (caps()?.canWrite && collection()) {
            <button class="btn secondary sm" (click)="openInsert()">+ Insert document</button>
          }
          <button class="btn secondary sm" (click)="loadCollections()" [disabled]="busy()">Refresh</button>
        </div>
      </header>

      <div class="grid">
        <aside class="col list">
          @for (c of collections(); track c.name) {
            <button class="row" [class.on]="c.name === collection()" (click)="select(c.name)">
              <span class="name">{{ c.name }}</span>
              <span class="count">{{ c.estimatedCount }}</span>
            </button>
          }
          @if (!collections().length) { <p class="muted pad">No collections.</p> }
        </aside>

        <section class="col editor">
          @if (collection(); as name) {
            <div class="tabs">
              @for (op of operations; track op) {
                <button class="tab" [class.on]="operation() === op" (click)="setOperation(op)">{{ op }}</button>
              }
              <span class="spacer"></span>
              <button class="btn ghost xs" (click)="showIndexes()">Indexes</button>
            </div>

            @if (operation() === 'find') {
              <label class="field"><span>Filter (JSON) — <code>&#123;&#125;</code> matches everything</span>
                <textarea class="input mono" rows="3" [(ngModel)]="filter" spellcheck="false"
                          placeholder='{ "status": "new" }'></textarea></label>
              <div class="grid-2">
                <label class="field"><span>Sort</span>
                  <input class="input mono" [(ngModel)]="sort" spellcheck="false" placeholder='{ "createdAt": -1 }'></label>
                <label class="field"><span>Projection</span>
                  <input class="input mono" [(ngModel)]="projection" spellcheck="false" placeholder='{ "name": 1 }'></label>
              </div>
              <div class="grid-2">
                <label class="field"><span>Skip</span>
                  <input class="input" type="number" min="0" [(ngModel)]="skip"></label>
                <label class="field"><span>Limit (max {{ caps()?.maxLimit ?? 200 }})</span>
                  <input class="input" type="number" min="1" [(ngModel)]="limit"></label>
              </div>
              <div class="run">
                <button class="btn primary" (click)="run()" [disabled]="busy()">Run</button>
                <button class="btn secondary" (click)="runCount()" [disabled]="busy()">Count</button>
              </div>
            }

            @if (operation() === 'aggregate') {
              <label class="field"><span>Pipeline (JSON array) — read-only stages only</span>
                <textarea class="input mono" rows="8" [(ngModel)]="pipeline" spellcheck="false"
                          placeholder='[ { "$match": {} }, { "$group": { "_id": "$status", "n": { "$sum": 1 } } } ]'></textarea></label>
              <label class="field"><span>Limit</span>
                <input class="input" type="number" min="1" [(ngModel)]="limit"></label>
              <div class="run"><button class="btn primary" (click)="run()" [disabled]="busy()">Run</button></div>
            }

            @if (operation() === 'distinct') {
              <div class="grid-2">
                <label class="field"><span>Field</span>
                  <input class="input mono" [(ngModel)]="field" spellcheck="false" placeholder="status"></label>
                <label class="field"><span>Filter</span>
                  <input class="input mono" [(ngModel)]="filter" spellcheck="false" placeholder='{ }'></label>
              </div>
              <div class="run"><button class="btn primary" (click)="run()" [disabled]="busy()">Run</button></div>
            }

            @if (message()) { <p class="message">{{ message() }}</p> }

            @if (page(); as p) {
              <div class="result-head">
                <span class="muted">{{ p.returned }} document(s) in {{ p.elapsedMilliseconds }} ms
                  @if (p.hasMore) { · more available, raise the limit or skip }
                  @if (p.redacted) { · <strong>secret fields redacted</strong> }
                </span>
                <span class="views">
                  @for (v of views; track v) {
                    <button class="tab xs" [class.on]="view() === v" (click)="view.set(v)">{{ v }}</button>
                  }
                </span>
              </div>

              @if (view() === 'table') {
                <div class="table-scroll">
                  <table class="results">
                    <thead><tr>
                      @for (c of columns(); track c) { <th>{{ c }}</th> }
                      @if (caps()?.canWrite) { <th class="actions-head">Actions</th> }
                    </tr></thead>
                    <tbody>
                      @for (row of rows(); track $index) {
                        <tr>
                          @for (c of columns(); track c) { <td [title]="cell(row, c)">{{ cell(row, c) }}</td> }
                          @if (caps()?.canWrite) {
                            <td class="actions">
                              <button class="btn ghost xs" (click)="openEdit($index)">Edit</button>
                              <button class="btn danger xs" (click)="remove($index)">Delete</button>
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <pre class="json">{{ prettyDocuments() }}</pre>
              }
            }

            @if (values().length) {
              <pre class="json">{{ values().join('\n') }}</pre>
            }
          } @else {
            <p class="muted pad">Pick a collection to query it.</p>
          }
        </section>
      </div>

      @if (editing() !== null) {
        <div class="scrim" (click)="closeEditor()">
          <div class="dialog" (click)="$event.stopPropagation()">
            <h2>{{ editing() === -1 ? 'Insert document' : 'Edit document' }}</h2>
            <p class="muted small">
              @if (editing() === -1) {
                A new document in <strong>{{ collection() }}</strong>. Leave out <code>_id</code> to have one generated.
              } @else {
                Saved as a <code>$set</code> of the fields you changed, plus <code>$unset</code> for any you
                removed. <code>_id</code> cannot be changed. Redacted values are not written back.
              }
            </p>
            <textarea class="input mono" rows="16" [(ngModel)]="draft" spellcheck="false"></textarea>
            @if (dialogError()) { <p class="message error">{{ dialogError() }}</p> }
            <div class="form-actions">
              <button class="btn primary" (click)="save()" [disabled]="busy()">Save</button>
              <button class="btn secondary" (click)="closeEditor()">Cancel</button>
            </div>
          </div>
        </div>
      }

      @if (error()) { <div class="toast" (click)="error.set(null)">{{ error() }}</div> }
    </div>
  `,
  styles: [`
    .page { padding: 1.5rem; max-width: 1250px; margin: 0 auto; }
    .head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
    h1 { margin:0; }
    .subtitle { color:var(--muted); font-size:.88rem; margin:.2rem 0 0; }
    .ops { display:flex; gap:.4rem; }
    .grid { display:grid; grid-template-columns:260px 1fr; gap:1rem; margin-top:1rem; align-items:start; }
    .col { border:1px solid var(--border); border-radius:12px; background:var(--surface); overflow:hidden; }
    .list { max-height:78vh; overflow-y:auto; }
    .row { display:flex; justify-content:space-between; gap:.5rem; width:100%; text-align:left; background:none;
      border:none; border-bottom:1px solid var(--border); padding:.5rem .7rem; cursor:pointer; color:var(--text); font-size:.85rem; }
    .row:hover { background:var(--bg); }
    .row.on { background:color-mix(in srgb, var(--brand) 12%, var(--surface)); font-weight:600; }
    .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .count { color:var(--muted); font-size:.75rem; }
    .editor { padding:.9rem; }
    .tabs { display:flex; gap:.3rem; align-items:center; margin-bottom:.8rem; }
    .tabs .spacer { flex:1; }
    .tab { background:var(--bg); border:1px solid var(--border); border-radius:7px; padding:.3rem .7rem;
      cursor:pointer; color:var(--text); font-size:.82rem; text-transform:capitalize; }
    .tab.on { background:var(--brand); color:var(--brand-text); border-color:transparent; }
    .tab.xs { padding:.15rem .5rem; font-size:.74rem; }
    .field { display:block; margin-bottom:.6rem; }
    .field span { display:block; font-size:.78rem; color:var(--muted); margin-bottom:.2rem; }
    .input { display:block; width:100%; box-sizing:border-box; padding:.45rem .6rem; border:1px solid var(--border);
      border-radius:7px; background:var(--bg); color:var(--text); font-size:.86rem; font-family:inherit; }
    .mono { font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.8rem; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:.6rem; }
    .run { display:flex; gap:.4rem; margin:.4rem 0 .8rem; }
    .result-head { display:flex; justify-content:space-between; align-items:center; gap:.5rem; flex-wrap:wrap;
      border-top:1px solid var(--border); padding-top:.6rem; margin-top:.4rem; }
    .views { display:flex; gap:.25rem; }
    .table-scroll { max-height:46vh; overflow:auto; border:1px solid var(--border); border-radius:8px; margin-top:.5rem; }
    .results { border-collapse:collapse; width:100%; font-size:.78rem; }
    .results th, .results td { border-bottom:1px solid var(--border); border-right:1px solid var(--border);
      padding:.3rem .5rem; text-align:left; white-space:nowrap; max-width:22rem; overflow:hidden; text-overflow:ellipsis; }
    .results th { position:sticky; top:0; background:var(--surface); color:var(--muted); font-weight:600; z-index:1; }
    .results .actions { white-space:nowrap; } .results .actions-head { width:1%; }
    .json { max-height:46vh; overflow:auto; background:var(--bg); border:1px solid var(--border); border-radius:8px;
      padding:.6rem; font-size:.76rem; margin-top:.5rem; white-space:pre; }
    .message { color:var(--muted); font-size:.82rem; margin:.3rem 0; }
    .message.error { color:var(--danger); }
    .tag { font-size:.7rem; background:var(--bg); border:1px solid var(--border); border-radius:99px; padding:0 .45rem; }
    .btn { display:inline-flex; align-items:center; gap:.3rem; border:1px solid transparent; border-radius:7px;
      padding:.45rem .8rem; font-size:.85rem; cursor:pointer; }
    .btn.sm { padding:.35rem .7rem; font-size:.82rem; } .btn.xs { padding:.2rem .5rem; font-size:.74rem; }
    .btn.primary { background:var(--brand); color:var(--brand-text); }
    .btn.secondary { background:var(--bg); color:var(--text); border-color:var(--border); }
    .btn.ghost { background:transparent; color:var(--text); border-color:var(--border); }
    .btn.danger { background:transparent; color:var(--danger); border-color:color-mix(in srgb, var(--danger-border) 40%, transparent); }
    .btn:disabled { opacity:.5; cursor:default; }
    .muted { color:var(--muted); } .small { font-size:.78rem; } .pad { padding:1rem; }
    .scrim { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center;
      justify-content:center; z-index:1000; padding:1rem; }
    .dialog { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
      padding:1.25rem; width:100%; max-width:640px; max-height:90vh; overflow-y:auto; }
    .dialog h2 { margin:0 0 .5rem; }
    .form-actions { display:flex; gap:.5rem; margin-top:.75rem; }
    .toast { position:fixed; bottom:1rem; left:50%; transform:translateX(-50%); background:var(--danger-soft); color:var(--danger);
      border:1px solid var(--danger-border); border-radius:8px; padding:.6rem 1rem; z-index:1100; cursor:pointer; }
    @media (max-width: 900px) { .grid { grid-template-columns:1fr; } .list { max-height:30vh; } }
  `],
})
export class DbConsoleComponent implements OnInit {
  private api = inject(DbConsoleService);

  readonly operations: Operation[] = ['find', 'aggregate', 'distinct'];
  readonly views: ResultView[] = ['table', 'json'];

  caps = signal<DbConsoleCapabilities | null>(null);
  collections = signal<MongoCollectionSummary[]>([]);
  collection = signal<string | null>(null);
  operation = signal<Operation>('find');
  view = signal<ResultView>('table');
  page = signal<MongoConsolePage | null>(null);
  /** Distinct values / index definitions — a flat list rather than documents. */
  values = signal<string[]>([]);
  message = signal<string | null>(null);
  error = signal<string | null>(null);
  busy = signal(false);

  /** -1 means "insert"; 0+ is the index of the row being edited; null means the dialog is closed. */
  editing = signal<number | null>(null);
  dialogError = signal<string | null>(null);
  draft = '';

  filter = '{}';
  sort = '';
  projection = '';
  pipeline = '[\n  { "$match": {} }\n]';
  field = '';
  skip = 0;
  limit = 50;

  /** The returned documents, parsed once so the table and the editor share the same objects. */
  readonly rows = computed<Record<string, unknown>[]>(() => {
    const documents = this.page()?.documents ?? [];
    return documents.map(json => {
      try { return JSON.parse(json) as Record<string, unknown>; }
      catch { return { _raw: json }; }
    });
  });

  /** Every top-level field seen in the result, `_id` first, capped so the table stays readable. */
  readonly columns = computed<string[]>(() => {
    const seen = new Set<string>();
    for (const row of this.rows()) for (const key of Object.keys(row)) seen.add(key);
    const keys = [...seen].filter(k => k !== '_id').slice(0, MAX_COLUMNS - 1);
    return seen.has('_id') ? ['_id', ...keys] : keys;
  });

  readonly prettyDocuments = computed(() =>
    this.rows().map(row => JSON.stringify(row, null, 2)).join('\n\n'));

  ngOnInit(): void {
    this.api.capabilities().subscribe({
      next: c => { this.caps.set(c); this.limit = c.defaultLimit; },
      error: () => this.error.set('Could not read the console settings.'),
    });
    this.loadCollections();
  }

  loadCollections(): void {
    this.busy.set(true);
    this.api.collections().subscribe({
      next: list => { this.collections.set(list); this.busy.set(false); },
      error: () => { this.busy.set(false); this.error.set('Could not list the collections.'); },
    });
  }

  select(name: string): void {
    this.collection.set(name);
    this.clearResults();
  }

  setOperation(op: Operation): void {
    this.operation.set(op);
    this.clearResults();
  }

  run(): void {
    const name = this.collection();
    if (!name) return;
    this.clearResults();
    this.busy.set(true);

    const request =
      this.operation() === 'find'
        ? this.api.find({
            collection: name,
            filter: this.filter || null,
            projection: this.projection || null,
            sort: this.sort || null,
            skip: this.skip || 0,
            limit: this.limit || null,
          })
        : this.operation() === 'aggregate'
          ? this.api.aggregate(name, this.pipeline, this.limit || null)
          : null;

    if (request) {
      request.subscribe({
        next: p => { this.busy.set(false); this.page.set(p); },
        error: (e: HttpErrorResponse) => this.failed(e),
      });
      return;
    }

    this.api.distinct(name, this.field, this.filter || null).subscribe({
      next: v => {
        this.busy.set(false);
        this.values.set(v);
        this.message.set(`${v.length} distinct value(s).`);
      },
      error: (e: HttpErrorResponse) => this.failed(e),
    });
  }

  runCount(): void {
    const name = this.collection();
    if (!name) return;
    this.busy.set(true);
    this.api.count(name, this.filter || null).subscribe({
      next: n => { this.busy.set(false); this.message.set(`${n} document(s) match.`); },
      error: (e: HttpErrorResponse) => this.failed(e),
    });
  }

  showIndexes(): void {
    const name = this.collection();
    if (!name) return;
    this.clearResults();
    this.api.indexes(name).subscribe({
      next: v => { this.values.set(v); this.message.set(`${v.length} index(es) on ${name}.`); },
      error: (e: HttpErrorResponse) => this.failed(e),
    });
  }

  /** One cell of the table: scalars as they are, anything nested as compact JSON. */
  cell(row: Record<string, unknown>, key: string): string {
    const value = row[key];
    if (value === null || value === undefined) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  // ---- Editing ----

  openInsert(): void {
    this.editing.set(-1);
    this.dialogError.set(null);
    this.draft = '{\n  \n}';
  }

  openEdit(index: number): void {
    this.editing.set(index);
    this.dialogError.set(null);
    this.draft = JSON.stringify(this.rows()[index], null, 2);
  }

  closeEditor(): void {
    this.editing.set(null);
    this.draft = '';
    this.dialogError.set(null);
  }

  save(): void {
    const name = this.collection();
    const index = this.editing();
    if (!name || index === null) return;

    let edited: Record<string, unknown>;
    try {
      edited = JSON.parse(this.draft);
    } catch {
      this.dialogError.set('That is not valid JSON.');
      return;
    }

    this.busy.set(true);
    if (index === -1) {
      this.api.insertOne(name, JSON.stringify(edited)).subscribe({
        next: r => { this.busy.set(false); this.closeEditor(); this.message.set(`Inserted ${r.insertedId ?? 'document'}.`); this.run(); },
        error: (e: HttpErrorResponse) => { this.busy.set(false); this.dialogError.set(this.reason(e)); },
      });
      return;
    }

    const original = this.rows()[index];
    const id = this.idOf(original);
    if (!id) {
      this.busy.set(false);
      this.dialogError.set('That document has no _id, so it cannot be edited here.');
      return;
    }

    const update = this.buildUpdate(original, edited);
    if (!update) {
      this.busy.set(false);
      this.dialogError.set('Nothing changed.');
      return;
    }

    this.api.updateOne(name, id, update).subscribe({
      next: r => {
        this.busy.set(false);
        this.closeEditor();
        this.message.set(`Updated ${r.modified} document(s).`);
        this.run();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.dialogError.set(this.reason(e)); },
    });
  }

  remove(index: number): void {
    const name = this.collection();
    const id = this.idOf(this.rows()[index]);
    if (!name || !id) return;
    if (!confirm(`Delete document ${id} from ${name}? This cannot be undone.`)) return;

    this.busy.set(true);
    this.api.deleteOne(name, id).subscribe({
      next: r => { this.busy.set(false); this.message.set(`Deleted ${r.deleted} document(s).`); this.run(); },
      error: (e: HttpErrorResponse) => this.failed(e),
    });
  }

  /**
   * Turns "here is the document as I want it" into an update: `$set` for what changed, `$unset` for what
   * was removed. `_id` is left out — the API refuses to change it, and so does Mongo.
   */
  private buildUpdate(original: Record<string, unknown>, edited: Record<string, unknown>): string | null {
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};

    for (const [key, value] of Object.entries(edited)) {
      if (key === '_id') continue;
      if (JSON.stringify(original[key]) !== JSON.stringify(value)) set[key] = value;
    }
    for (const key of Object.keys(original)) {
      if (key !== '_id' && !(key in edited)) unset[key] = '';
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update['$set'] = set;
    if (Object.keys(unset).length) update['$unset'] = unset;
    return Object.keys(update).length ? JSON.stringify(update) : null;
  }

  /** The document's id as the API wants it — extended JSON wraps an ObjectId as `{ "$oid": … }`. */
  private idOf(row: Record<string, unknown>): string | null {
    const id = row['_id'];
    if (id === null || id === undefined) return null;
    if (typeof id === 'object') {
      const oid = (id as Record<string, unknown>)['$oid'];
      return typeof oid === 'string' ? oid : null;
    }
    return String(id);
  }

  private clearResults(): void {
    this.page.set(null);
    this.values.set([]);
    this.message.set(null);
  }

  private failed(e: HttpErrorResponse): void {
    this.busy.set(false);
    this.error.set(this.reason(e));
  }

  /** The API explains rejected queries in words meant for whoever typed them; show that. */
  private reason(e: HttpErrorResponse): string {
    return e.error?.error ?? 'That request could not be completed.';
  }
}
