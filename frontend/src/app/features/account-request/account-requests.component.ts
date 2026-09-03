import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AccountRequest,
  AccountRequestStatus,
  AccountRequestsService,
} from '../../core/services/account-requests.service';

/**
 * The approval queue.
 *
 * Approving is the only thing in the system that turns a stranger into a user, so it is deliberately
 * a deliberate act: one row, one decision, with the applicant's own words in front of you. The role
 * defaults to Viewer — enough to sign in and comment, nothing more — and anything beyond that has to
 * be chosen on purpose.
 */
@Component({
  selector: 'app-account-requests',
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page">
      <header class="page-head">
        <div>
          <h1>Account requests</h1>
          <p class="sub">
            People asking for access. Nobody can sign in until you approve them.
          </p>
        </div>
        <button class="btn" (click)="reload()" [disabled]="loading()">Refresh</button>
      </header>

      <nav class="tabs">
        @for (tab of tabs; track tab.value) {
          <button
            class="tab"
            [class.active]="filter() === tab.value"
            (click)="setFilter(tab.value)">
            {{ tab.label }}
            @if (tab.value === 'Pending' && pendingCount() > 0) {
              <span class="badge">{{ pendingCount() }}</span>
            }
          </button>
        }
      </nav>

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (!requests().length) {
        <p class="muted">Nothing here.</p>
      } @else {
        <ul class="request-list">
          @for (r of requests(); track r.id) {
            <li class="request-row">
              <div class="request-main">
                <strong>{{ r.displayName }}</strong>
                <span class="email">{{ r.email }}</span>
                @if (r.reason) {
                  <p class="reason">“{{ r.reason }}”</p>
                }
                <small class="muted">Requested {{ r.createdAt | date: 'medium' }}</small>
                @if (r.decidedAt) {
                  <small class="muted">
                    {{ r.status }} {{ r.decidedAt | date: 'medium' }}
                    @if (r.decisionNote) { — {{ r.decisionNote }} }
                  </small>
                }
              </div>

              @if (r.status === 'Pending') {
                <div class="request-actions">
                  <label class="role-pick">
                    <span>Role</span>
                    <select [(ngModel)]="roleChoice[r.id]">
                      <option value="Viewer">Viewer</option>
                      <option value="Editor">Editor</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </label>
                  <button class="btn btn-approve" [disabled]="deciding() === r.id"
                          (click)="approve(r)">Approve</button>
                  <button class="btn btn-reject" [disabled]="deciding() === r.id"
                          (click)="reject(r)">Reject</button>
                </div>
              } @else {
                <span class="status" [class.approved]="r.status === 'Approved'">{{ r.status }}</span>
              }
            </li>
          }
        </ul>
      }

      @if (message()) { <p class="notice">{{ message() }}</p> }
    </section>
  `,
  styles: [`
    .page { padding: 1.5rem; }
    .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
    .page-head h1 { margin: 0 0 0.25rem; font-size: 1.35rem; }
    .sub { margin: 0 0 1rem; color: var(--muted); font-size: 0.9rem; }
    .muted { color: var(--muted); font-size: 0.88rem; }

    .tabs { display: flex; gap: 0.4rem; margin: 0.5rem 0 1.25rem; flex-wrap: wrap; }
    .tab {
      padding: 0.4rem 0.85rem; border-radius: 999px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text); font-size: 0.85rem; cursor: pointer;
      display: inline-flex; align-items: center; gap: 0.4rem;
    }
    .tab.active { background: var(--brand); color: var(--brand-text); border-color: var(--brand); }
    .badge {
      min-width: 1.3rem; padding: 0 0.35rem; border-radius: 999px;
      background: color-mix(in srgb, currentColor 18%, transparent); font-size: 0.75rem; font-weight: 700;
    }

    .request-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
    .request-row {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 1.25rem;
      padding: 1rem 1.15rem; border: 1px solid var(--border); border-radius: 10px;
      background: var(--surface); flex-wrap: wrap;
    }
    .request-main { display: flex; flex-direction: column; gap: 0.25rem; min-width: 16rem; flex: 1; }
    .email { font-size: 0.88rem; color: var(--muted); }
    .reason { margin: 0.35rem 0; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; }

    .request-actions { display: flex; align-items: flex-end; gap: 0.5rem; flex-wrap: wrap; }
    .role-pick { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.78rem; color: var(--muted); }
    .role-pick select {
      padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text); font: inherit; font-size: 0.85rem;
    }

    .btn {
      padding: 0.45rem 0.9rem; border-radius: 6px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text); font-size: 0.88rem; cursor: pointer;
    }
    .btn:disabled { opacity: 0.55; cursor: default; }
    .btn-approve { background: var(--success); border-color: var(--success-border); color: var(--on-accent); }
    .btn-reject { background: var(--surface); border-color: var(--danger-border); color: var(--danger); }

    .status { font-size: 0.85rem; color: var(--danger); font-weight: 600; }
    .status.approved { color: var(--success); }

    .notice { margin-top: 1rem; font-size: 0.88rem; color: var(--muted); }
  `]
})
export class AccountRequestsComponent implements OnInit {
  readonly tabs: { label: string; value: AccountRequestStatus | 'All' }[] = [
    { label: 'Pending', value: 'Pending' },
    { label: 'Approved', value: 'Approved' },
    { label: 'Rejected', value: 'Rejected' },
    { label: 'All', value: 'All' },
  ];

  readonly filter = signal<AccountRequestStatus | 'All'>('Pending');
  readonly requests = signal<AccountRequest[]>([]);
  readonly loading = signal(false);
  readonly deciding = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  /** Role chosen per row, so approving several in a row does not carry one choice into the next. */
  roleChoice: Record<string, string> = {};

  readonly pendingCount = computed(() =>
    this.requests().filter(r => r.status === 'Pending').length);

  private readonly api = inject(AccountRequestsService);

  ngOnInit(): void {
    this.reload();
  }

  setFilter(value: AccountRequestStatus | 'All'): void {
    this.filter.set(value);
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.message.set(null);
    const status = this.filter();

    this.api.list(status === 'All' ? undefined : status).subscribe({
      next: rows => {
        this.requests.set(rows);
        for (const r of rows) this.roleChoice[r.id] ??= 'Viewer';
        this.loading.set(false);
      },
      error: () => {
        this.message.set('Could not load requests.');
        this.loading.set(false);
      },
    });
  }

  approve(r: AccountRequest): void {
    const role = this.roleChoice[r.id] || 'Viewer';
    if (!confirm(`Create an account for ${r.displayName} (${r.email}) with the ${role} role?`)) return;

    const note = prompt('Note for the record (optional)') ?? undefined;
    this.deciding.set(r.id);

    this.api.approve(r.id, [role], note).subscribe({
      next: () => {
        this.deciding.set(null);
        this.message.set(`${r.displayName} can now sign in.`);
        this.reload();
      },
      error: err => {
        this.deciding.set(null);
        this.message.set(err?.error?.error ?? 'Could not approve that request.');
      },
    });
  }

  reject(r: AccountRequest): void {
    if (!confirm(`Reject the request from ${r.displayName}?`)) return;

    const note = prompt('Reason (optional, for the record)') ?? undefined;
    this.deciding.set(r.id);

    this.api.reject(r.id, note).subscribe({
      next: () => {
        this.deciding.set(null);
        this.message.set('Request rejected.');
        this.reload();
      },
      error: () => {
        this.deciding.set(null);
        this.message.set('Could not reject that request.');
      },
    });
  }
}
