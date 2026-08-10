import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PackageStatus } from '../../core/models/package-inventory.models';
import { PackageInventoryService } from '../../core/services/package-inventory.service';

type StatusFilter = 'all' | PackageStatus;
type EcosystemFilter = 'all' | 'nuget' | 'npm';

@Component({
  selector: 'app-packages',
  imports: [DatePipe, FormsModule],
  template: `
    <div class="wrap">
      <header class="head">
        <div>
          <h1>Package inventory</h1>
          <p>Private package releases and every workspace project that consumes them.</p>
        </div>
        <button type="button" class="refresh" [disabled]="loading()" (click)="load(true)">Refresh</button>
      </header>

      @if (error()) { <div class="banner" role="alert">{{ error() }}</div> }

      @if (loading() && !inventory()) {
        <div class="loading"><span class="spinner"></span> Scanning package manifests...</div>
      } @else if (inventory(); as result) {
        @if (!result.workspaceAvailable) {
          <div class="banner">The workspace is not available to this deployment. Configure PackageInventory:WorkspaceRoot on a host that has the repositories.</div>
        } @else {
          <section class="summary" aria-label="Package summary">
            <div><strong>{{ result.packages.length }}</strong><span>Packages</span></div>
            <div><strong>{{ currentCount() }}</strong><span>Current</span></div>
            <div class="attention"><strong>{{ actionCount() }}</strong><span>Need action</span></div>
            <div><strong>{{ consumerCount() }}</strong><span>References</span></div>
            <small>Scanned {{ result.generatedAtUtc | date:'medium' }}</small>
          </section>

          <div class="filters">
            <label>Search <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Package or project"></label>
            <label>Ecosystem
              <select [ngModel]="ecosystem()" (ngModelChange)="ecosystem.set($event)">
                <option value="all">All</option><option value="nuget">NuGet</option><option value="npm">npm</option>
              </select>
            </label>
            <label>Status
              <select [ngModel]="status()" (ngModelChange)="status.set($event)">
                <option value="all">All</option><option value="upgrade-required">Upgrade required</option><option value="publish-required">Publish required</option><option value="current">Current</option>
              </select>
            </label>
            <label>Repository
              <select [ngModel]="repository()" (ngModelChange)="repository.set($event)">
                <option value="all">All</option>
                @for (name of repositories(); track name) { <option [value]="name">{{ name }}</option> }
              </select>
            </label>
          </div>

          <div class="table-shell" [class.refreshing]="loading()">
            <table>
              <thead><tr><th>Package</th><th>Source</th><th>Published</th><th>Status</th><th>Consumers</th></tr></thead>
              <tbody>
                @for (item of filtered(); track item.ecosystem + ':' + item.name) {
                  <tr>
                    <td><span class="ecosystem">{{ item.ecosystem }}</span><strong>{{ item.name }}</strong><small>{{ item.repository }}</small></td>
                    <td><code>{{ item.sourceVersion }}</code></td>
                    <td><code>{{ item.publishedVersion ?? 'Not detected' }}</code></td>
                    <td><span class="status" [class]="item.status">{{ statusLabel(item.status) }}</span></td>
                    <td>
                      @if (item.consumers.length === 0) { <span class="muted">No consumers</span> }
                      @for (consumer of item.consumers; track consumer.project) {
                        <div class="consumer" [class.drift]="!consumer.isCurrent"><span>{{ consumer.project }}</span><code>{{ consumer.requestedVersion }}</code></div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            @if (filtered().length === 0) { <p class="empty">No packages match these filters.</p> }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .wrap{max-width:1200px;margin:0 auto;padding:1rem}.head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}.head h1{margin:0;font-size:1.5rem;color:var(--text)}.head p{margin:.2rem 0 0;color:var(--muted);font-size:.9rem}.refresh{border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);padding:.5rem .85rem;cursor:pointer}.refresh:disabled{opacity:.55}.banner{border:1px solid color-mix(in srgb,#c5221f 35%,var(--border));background:color-mix(in srgb,#c5221f 9%,var(--surface));color:var(--text);padding:.75rem;border-radius:6px;margin-bottom:1rem}.loading{display:flex;justify-content:center;align-items:center;gap:.6rem;padding:2rem;color:var(--muted)}.spinner{width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.summary{display:grid;grid-template-columns:repeat(4,minmax(100px,1fr));border-block:1px solid var(--border);margin-bottom:1rem}.summary div{display:flex;flex-direction:column;padding:.8rem 1rem;border-right:1px solid var(--border)}.summary div:last-of-type{border-right:0}.summary strong{font-size:1.25rem;color:var(--text)}.summary span,.summary small{font-size:.78rem;color:var(--muted)}.summary .attention strong{color:#b06000}.summary small{grid-column:1/-1;padding:.45rem 1rem;border-top:1px solid var(--border)}.filters{display:grid;grid-template-columns:2fr repeat(3,1fr);gap:.65rem;margin-bottom:.8rem}.filters label{display:flex;flex-direction:column;gap:.25rem;color:var(--muted);font-size:.75rem}.filters input,.filters select{min-width:0;padding:.45rem .55rem;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text)}.table-shell{overflow:auto;border:1px solid var(--border);border-radius:7px;transition:opacity .15s}.table-shell.refreshing{opacity:.55}table{width:100%;border-collapse:collapse;min-width:850px}th{text-align:left;font-size:.72rem;text-transform:uppercase;color:var(--muted);background:var(--surface);padding:.65rem;border-bottom:1px solid var(--border)}td{padding:.7rem .65rem;border-bottom:1px solid var(--border);vertical-align:top;color:var(--text);font-size:.84rem}tbody tr:last-child td{border-bottom:0}td:first-child strong,td:first-child small{display:block}.ecosystem{display:inline-block;margin-bottom:.25rem;text-transform:uppercase;font-size:.62rem;font-weight:700;color:var(--brand)}td:first-child small{color:var(--muted);margin-top:.2rem}code{font-size:.78rem;color:var(--text)}.status{display:inline-block;padding:.2rem .45rem;border-radius:4px;font-size:.7rem;font-weight:700}.status.current{background:#e6f4ea;color:#137333}.status.publish-required{background:#fef7e0;color:#8a4b00}.status.upgrade-required{background:#fce8e6;color:#c5221f}.consumer{display:flex;justify-content:space-between;gap:1rem;padding:.18rem 0;color:var(--muted);font-size:.75rem}.consumer.drift{color:#c5221f}.muted,.empty{color:var(--muted)}.empty{text-align:center;padding:1rem}@media(max-width:760px){.head{align-items:flex-start}.summary{grid-template-columns:repeat(2,1fr)}.summary div:nth-child(2){border-right:0}.filters{grid-template-columns:1fr 1fr}.filters label:first-child{grid-column:1/-1}}@media(max-width:480px){.wrap{padding:.75rem}.head{flex-direction:column}.filters{grid-template-columns:1fr}.filters label:first-child{grid-column:auto}}
  `]
})
export class PackagesComponent implements OnInit {
  private readonly api = inject(PackageInventoryService);
  readonly inventory = signal<import('../../core/models/package-inventory.models').PackageInventory | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly query = signal('');
  readonly ecosystem = signal<EcosystemFilter>('all');
  readonly status = signal<StatusFilter>('all');
  readonly repository = signal('all');
  readonly repositories = computed(() => [...new Set(this.inventory()?.packages.map(x => x.repository) ?? [])].sort());
  readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    return (this.inventory()?.packages ?? []).filter(item =>
      (this.ecosystem() === 'all' || item.ecosystem === this.ecosystem()) &&
      (this.status() === 'all' || item.status === this.status()) &&
      (this.repository() === 'all' || item.repository === this.repository()) &&
      (!query || item.name.toLowerCase().includes(query) || item.consumers.some(x => x.project.toLowerCase().includes(query))));
  });
  readonly currentCount = computed(() => this.inventory()?.packages.filter(x => x.status === 'current').length ?? 0);
  readonly actionCount = computed(() => this.inventory()?.packages.filter(x => x.status !== 'current').length ?? 0);
  readonly consumerCount = computed(() => this.inventory()?.packages.reduce((sum, item) => sum + item.consumers.length, 0) ?? 0);

  ngOnInit(): void { this.load(); }
  load(refresh = false): void {
    this.loading.set(true); this.error.set(null);
    this.api.get(refresh).subscribe({
      next: result => { this.inventory.set(result); this.loading.set(false); },
      error: (error: HttpErrorResponse) => { this.loading.set(false); this.error.set(typeof error.error?.error === 'string' ? error.error.error : 'Could not load package inventory.'); }
    });
  }
  statusLabel(status: PackageStatus): string {
    return status === 'current' ? 'Current' : status === 'publish-required' ? 'Publish required' : 'Upgrade required';
  }
}
