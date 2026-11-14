import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type LoadingStateMode = 'cards' | 'list' | 'table' | 'inline';

@Component({
  selector: 'app-loading-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mode() === 'inline') {
      <div class="adm-inline" [class.compact]="compact()" role="status" aria-live="polite">
        <span class="adm-spinner" aria-hidden="true"></span>
        <span>{{ title() }}</span>
      </div>
    } @else {
      <div class="adm-state" [class.compact]="compact()" role="status" aria-live="polite">
        <div class="adm-head">
          <span class="adm-spinner" aria-hidden="true"></span>
          <div class="adm-copy">
            <strong>{{ title() }}</strong>
            @if (subtitle()) {
              <span>{{ subtitle() }}</span>
            }
          </div>
        </div>

        @if (mode() === 'cards') {
          <div class="adm-cards">
            @for (item of items(); track item) {
              <div class="adm-card">
                <div class="skeleton h14 w55"></div>
                <div class="skeleton h12 w35"></div>
              </div>
            }
          </div>
        } @else if (mode() === 'table') {
          <div class="adm-table">
            <div class="adm-row head">
              <span class="skeleton h12 w30"></span>
              <span class="skeleton h12 w40"></span>
              <span class="skeleton h12 w20"></span>
            </div>
            @for (item of items(); track item) {
              <div class="adm-row">
                <span class="skeleton h12 w30"></span>
                <span class="skeleton h12 w40"></span>
                <span class="skeleton h12 w20"></span>
              </div>
            }
          </div>
        } @else {
          <div class="adm-list">
            @for (item of items(); track item) {
              <div class="skeleton h34"></div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .adm-inline {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      color: var(--muted);
      font-size: var(--text-sm, 0.82rem);
      padding: 0.5rem 0;
    }
    .adm-inline.compact { padding: 0.25rem 0; }
    .adm-state {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      padding: 1rem;
      border-radius: var(--radius-lg, 14px);
      border: 1px solid var(--border);
      background: var(--surface);
      margin-bottom: 1rem;
    }
    .adm-state.compact { padding: 0.75rem; gap: 0.6rem; }
    .adm-head {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .adm-copy {
      display: flex;
      flex-direction: column;
      gap: 0.12rem;
    }
    .adm-copy strong { font-size: 0.9rem; color: var(--text-strong); }
    .adm-copy span { font-size: var(--text-xs, 0.75rem); color: var(--muted); }
    .adm-spinner {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--brand) 24%, transparent);
      border-top-color: var(--brand);
      flex-shrink: 0;
      animation: admSpin 0.75s linear infinite;
    }
    .adm-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.85rem;
    }
    .adm-card {
      padding: 0.95rem;
      border-radius: var(--radius-md, 10px);
      border: 1px solid var(--border);
      background: var(--bg);
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .adm-table, .adm-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .adm-row {
      display: flex;
      gap: 0.65rem;
      padding: 0.35rem 0;
    }
    .adm-row.head { opacity: 0.65; }
    .h12 { height: 12px; display: block; }
    .h14 { height: 14px; display: block; }
    .h34 { height: 34px; display: block; width: 100%; }
    .w20 { width: 20%; }
    .w30 { width: 30%; }
    .w35 { width: 35%; }
    .w40 { width: 40%; }
    .w55 { width: 55%; }
  `],
})
export class LoadingStateComponent {
  readonly mode = input<LoadingStateMode>('list');
  readonly count = input<number>(3);
  readonly title = input<string>('Loading…');
  readonly subtitle = input<string>('');
  readonly compact = input<boolean>(false);

  readonly items = computed(() =>
    Array.from({ length: Math.max(1, this.count()) }, (_, idx) => idx),
  );
}
