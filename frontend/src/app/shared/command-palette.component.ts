import {
  Component, ElementRef, computed, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { I18nService } from '../core/services/i18n.service';
import { RbacService } from '../core/services/rbac.service';
import { SearchResult } from '../core/models/rbac.models';
import { NavLink } from '../core/models/navigation';

/** One row in the palette: a page from the nav, or a record from global search. */
interface PaletteItem {
  kind: 'page' | 'record';
  icon: string;
  label: string;
  /** Second line — the record type, or the page's route. */
  detail: string;
  route: string;
  /** Higher sorts first. Pages beat records so navigation stays predictable. */
  score: number;
}

/**
 * Ctrl/Cmd-K palette: type to jump anywhere.
 *
 * <para>With 27 feature areas no navigation design makes every page one click away, so the palette
 * is the escape hatch that does. It searches two sources at once — the pages this identity may open
 * (the same filtered list the sidebar renders, passed in rather than re-derived, so the palette can
 * never offer a page the sidebar hides) and, once the query is worth a round trip, actual records
 * through <c>/api/search</c>. Authorization stays server-side: the records endpoint filters by the
 * caller's grants exactly as it does for the Search page.</para>
 */
@Component({
  selector: 'app-command-palette',
  imports: [FormsModule],
  template: `
    @if (open()) {
      <div class="palette-backdrop" (click)="close()">
        <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette"
             (click)="$event.stopPropagation()">
          <div class="palette-input">
            <span aria-hidden="true">🔍</span>
            <input #queryInput type="text" role="combobox" aria-expanded="true"
                   aria-controls="palette-results" [attr.aria-activedescendant]="activeId()"
                   [placeholder]="'Jump to a page, or search notes, users, websites…'"
                   [ngModel]="query()" (ngModelChange)="onQuery($event)"
                   (keydown)="onKeydown($event)" />
            <kbd>esc</kbd>
          </div>

          <ul class="palette-results" id="palette-results" role="listbox">
            @for (item of items(); track item.kind + item.route + item.label; let i = $index) {
              <li role="option" [id]="'palette-item-' + i" [attr.aria-selected]="i === activeIndex()"
                  [class.active]="i === activeIndex()"
                  (mouseenter)="activeIndex.set(i)" (click)="go(item)">
                <span class="palette-ico" aria-hidden="true">{{ item.icon }}</span>
                <span class="palette-text">
                  <span class="palette-label">{{ item.label }}</span>
                  <span class="palette-detail">{{ item.detail }}</span>
                </span>
                @if (item.kind === 'page') { <span class="palette-tag">Page</span> }
              </li>
            } @empty {
              <li class="palette-empty">
                {{ searching() ? 'Searching…' : 'Nothing matches “' + query() + '”.' }}
              </li>
            }
          </ul>

          <div class="palette-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> open</span>
            @if (searching()) { <span class="grow">Searching records…</span> }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .palette-backdrop {
      position: fixed; inset: 0; z-index: 60;
      display: grid; align-items: start; justify-items: center;
      padding: 10vh var(--space-4) var(--space-4);
      background: var(--overlay);
      backdrop-filter: blur(2px);
    }
    .palette {
      width: min(620px, 100%);
      display: grid;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      overflow: hidden;
    }
    .palette-input {
      display: flex; align-items: center; gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--border);
    }
    .palette-input input {
      flex: 1; border: 0; background: transparent; padding: 0;
      font-size: var(--text-md); color: var(--text);
    }
    .palette-input input:focus { outline: none; box-shadow: none; }
    .palette-results { list-style: none; margin: 0; padding: var(--space-1); max-height: 46vh; overflow-y: auto; }
    .palette-results li {
      display: flex; align-items: center; gap: var(--space-3);
      padding: 0.5rem var(--space-3);
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .palette-results li.active { background: var(--brand-soft); }
    .palette-ico { flex: 0 0 1.25rem; text-align: center; }
    .palette-text { display: grid; min-width: 0; }
    .palette-label { color: var(--text); font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .palette-detail { color: var(--faint); font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .palette-tag {
      margin-left: auto; padding: 0.05rem 0.4rem;
      border-radius: var(--radius-pill);
      background: var(--surface-3); color: var(--muted);
      font-size: var(--text-xs); font-weight: 600;
    }
    .palette-empty { color: var(--muted); justify-content: center; cursor: default; padding: var(--space-5) !important; }
    .palette-foot {
      display: flex; align-items: center; gap: var(--space-4);
      padding: var(--space-2) var(--space-4);
      border-top: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--faint); font-size: var(--text-xs);
    }
    .palette-foot kbd { margin-right: 2px; }
  `],
})
export class CommandPaletteComponent {
  private router = inject(Router);
  private rbac = inject(RbacService);
  private i18n = inject(I18nService);

  /** Pages this identity may open — already permission-filtered by the shell. */
  readonly links = input.required<NavLink[]>();
  readonly open = input(false);
  readonly closed = output<void>();

  private readonly queryInput = viewChild<ElementRef<HTMLInputElement>>('queryInput');

  readonly query = signal('');
  readonly activeIndex = signal(0);
  readonly searching = signal(false);
  private readonly records = signal<SearchResult[]>([]);
  private readonly typed = new Subject<string>();

  /** Pages first, then records; both ranked, capped so the list stays scannable. */
  readonly items = computed<PaletteItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    const pages = this.links()
      .map(link => ({ link, score: this.rank(link, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || a.link.path.localeCompare(b.link.path))
      .slice(0, 8)
      .map(({ link, score }): PaletteItem => ({
        kind: 'page',
        icon: link.icon,
        label: this.i18n.t(link.labelKey),
        detail: link.path,
        route: link.path,
        score,
      }));

    const records = this.records().slice(0, 8).map((r): PaletteItem => ({
      kind: 'record',
      icon: '↗',
      label: r.title,
      detail: r.subtitle ? `${r.type} · ${r.subtitle}` : r.type,
      route: r.route,
      score: 0,
    }));

    return [...pages, ...records];
  });

  /** The active row's DOM id, for `aria-activedescendant`. */
  readonly activeId = computed(() => `palette-item-${this.activeIndex()}`);

  constructor() {
    // Opening resets to a clean slate — a palette that reopens showing the last query is a palette
    // you have to clear before you can use it.
    effect(() => {
      if (!this.open()) return;
      this.query.set('');
      this.records.set([]);
      this.activeIndex.set(0);
      queueMicrotask(() => this.queryInput()?.nativeElement.focus());
    });

    // Records are a round trip, so they are debounced and only fetched once the query is specific
    // enough to be worth one. Pages filter locally on every keystroke regardless.
    this.typed
      .pipe(
        debounceTime(180),
        distinctUntilChanged(),
        switchMap(q => {
          if (q.trim().length < 2) { this.searching.set(false); return of({ results: [] }); }
          this.searching.set(true);
          return this.rbac.search(q.trim()).pipe(catchError(() => of({ results: [] })));
        }),
        takeUntilDestroyed(),
      )
      .subscribe(response => {
        this.searching.set(false);
        this.records.set(response.results ?? []);
      });
  }

  onQuery(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
    this.typed.next(value);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.items().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count) this.activeIndex.update(i => (i + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.activeIndex.update(i => (i - 1 + count) % count);
        break;
      case 'Enter': {
        event.preventDefault();
        const item = this.items()[this.activeIndex()];
        if (item) this.go(item);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  go(item: PaletteItem): void {
    this.close();
    void this.router.navigateByUrl(item.route);
  }

  close(): void {
    this.closed.emit();
  }

  /**
   * Ranks a page against the query. An empty query lists everything (the palette doubles as a menu),
   * a prefix match beats a substring match, and a keyword match ranks below both — so typing "us"
   * offers Users before it offers the page that merely mentions users.
   */
  private rank(link: NavLink, q: string): number {
    if (!q) return 1;
    const label = this.i18n.t(link.labelKey).toLowerCase();
    if (label.startsWith(q)) return 100;
    if (label.includes(q)) return 70;
    if (link.path.toLowerCase().includes(q)) return 50;
    if (link.keywords?.some(k => k.includes(q))) return 30;
    return 0;
  }
}
