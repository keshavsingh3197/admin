import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoadingService } from '../core/services/loading.service';

@Component({
  selector: 'app-global-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading.active()) {
      <div class="adm-top-bar" role="progressbar" aria-label="Loading in progress">
        <div class="adm-top-bar-fill"></div>
      </div>
    }

    @if (loading.slow()) {
      <aside class="adm-cold-banner" role="status" aria-live="polite">
        <span class="adm-cold-spinner" aria-hidden="true"></span>
        <div class="adm-cold-copy">
          <strong>
            {{ loading.reason() === 'route' ? 'Loading admin section…' : 'Waking up Admin Console…' }}
          </strong>
          <span>
            Connecting to backend &amp; identity services ({{ loading.elapsedSec() }}s)
          </span>
        </div>
        <button
          type="button"
          class="adm-cold-close"
          title="Hide notice"
          aria-label="Hide loading notice"
          (click)="loading.dismissSlow()"
        >&times;</button>
      </aside>
    }
  `,
  styles: [`
    .adm-top-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      z-index: 1200;
      overflow: hidden;
      background: color-mix(in srgb, var(--brand) 18%, transparent);
      pointer-events: none;
    }
    .adm-top-bar-fill {
      width: 38%;
      height: 100%;
      background: linear-gradient(90deg, transparent, var(--brand), transparent);
      animation: admIndeterminate 1.15s ease-in-out infinite;
    }
    .adm-cold-banner {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      z-index: 1190;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      max-width: min(390px, calc(100vw - 2rem));
      padding: 0.75rem 0.9rem;
      border-radius: var(--radius-md, 10px);
      border: 1px solid var(--border);
      border-left: 3px solid var(--brand);
      background: var(--surface);
      color: var(--text);
      box-shadow: 0 12px 32px rgba(10, 16, 32, 0.22);
      font-size: var(--text-sm, 0.82rem);
    }
    .adm-cold-spinner {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--brand) 25%, transparent);
      border-top-color: var(--brand);
      flex-shrink: 0;
      animation: admSpin 0.75s linear infinite;
    }
    .adm-cold-copy {
      display: flex;
      flex-direction: column;
      gap: 0.12rem;
    }
    .adm-cold-copy strong { color: var(--text-strong); font-size: 0.85rem; }
    .adm-cold-copy span { color: var(--muted); font-size: var(--text-xs, 0.75rem); }
    .adm-cold-close {
      margin-left: auto;
      border: 0;
      background: transparent;
      color: var(--muted);
      font-size: 1.15rem;
      line-height: 1;
      cursor: pointer;
      padding: 0.15rem 0.3rem;
    }
    .adm-cold-close:hover { color: var(--text); }
    @keyframes admIndeterminate {
      0% { transform: translateX(-110%); }
      100% { transform: translateX(310%); }
    }
    @media (max-width: 600px) {
      .adm-cold-banner {
        left: 0.75rem;
        right: 0.75rem;
        bottom: 0.75rem;
        max-width: none;
      }
    }
  `],
})
export class GlobalLoaderComponent {
  readonly loading = inject(LoadingService);
}
