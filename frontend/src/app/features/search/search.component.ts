import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { RbacService } from '../../core/services/rbac.service';
import { SearchResult } from '../../core/models/rbac.models';

/** Global search across notes, users, websites, roles and groups, with click-to-visit navigation. */
@Component({
  selector: 'app-search',
  imports: [FormsModule],
  template: `
    <div class="wrap">
      <h1 class="page-title">Search</h1>
      <input
        class="input"
        type="search"
        placeholder="Search notes, users, websites, roles, groups…"
        [(ngModel)]="query"
        (ngModelChange)="onQueryChange($event)"
        autofocus
      />

      @if (loading()) {
        <p class="muted">Searching…</p>
      } @else if (query.trim().length > 0 && query.trim().length < 2) {
        <p class="muted">Keep typing… (min 2 characters)</p>
      } @else if (error()) {
        <p class="muted">{{ error() }}</p>
      } @else if (query.trim().length >= 2 && !results().length) {
        <p class="muted">No results for "{{ query }}".</p>
      } @else {
        <ul class="results">
          @for (r of results(); track r.type + r.id) {
            <li class="result" (click)="visit(r)">
              <span class="type">{{ r.type }}</span>
              <span class="title">{{ r.title }}</span>
              @if (r.subtitle) { <span class="subtitle">{{ r.subtitle }}</span> }
              <span class="visit">Visit →</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .wrap { max-width: 720px; margin: 0 auto; padding: 1rem; }
    .page-title { font-size: 1.5rem; margin: 0 0 1rem; color: var(--text); }
    .input { width: 100%; padding: 0.65rem 0.8rem; border: 1px solid var(--border); border-radius: 8px; font-size: 1rem; background: var(--surface); color: var(--text); }
    .input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 25%, transparent); }
    .muted { color: var(--muted); margin-top: 1rem; }
    .results { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .result {
      display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.9rem;
      background: var(--surface); border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
    }
    .result:hover { border-color: var(--brand); }
    .type {
      font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em;
      background: color-mix(in srgb, var(--brand) 16%, var(--surface)); color: var(--brand);
      border-radius: 6px; padding: 0.15rem 0.45rem; flex-shrink: 0;
    }
    .title { font-weight: 600; color: var(--text); }
    .subtitle { color: var(--muted); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .visit { margin-left: auto; color: var(--brand); font-size: 0.85rem; flex-shrink: 0; }
  `]
})
export class SearchComponent {
  private api = inject(RbacService);
  private router = inject(Router);
  private query$ = new Subject<string>();

  query = '';
  readonly results = signal<SearchResult[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.query$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < 2) { this.loading.set(false); return []; }
        this.loading.set(true);
        return this.api.search(q.trim());
      })
    ).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.error.set(null);
        if (res) this.results.set(res.results);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(typeof err.error?.error === 'string' ? err.error.error : 'Search failed.');
      },
    });
  }

  onQueryChange(q: string): void {
    if (q.trim().length < 2) this.results.set([]);
    this.query$.next(q);
  }

  visit(r: SearchResult): void {
    this.router.navigateByUrl(r.route);
  }
}
