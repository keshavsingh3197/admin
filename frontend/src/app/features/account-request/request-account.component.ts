import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AccountRequestsService } from '../../core/services/account-requests.service';

/**
 * The public "request an account" form.
 *
 * Nobody self-registers here: submitting this creates an application, not an account, and no sign-in
 * is possible until an admin approves it. The password chosen now is hashed immediately and carried
 * over on approval, which is what lets the whole flow work without an outbound mail path.
 *
 * The confirmation is identical whatever the server found — including for an address that already
 * has an account — so the form cannot be used to discover who has one.
 */
@Component({
  selector: 'app-request-account',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="request-wrap">
      <div class="request-card">
        <h1 class="request-title">Request an account</h1>
        <p class="request-sub">
          Accounts here are approved by hand. Tell us who you are, and you will be able to sign in
          once someone has said yes.
        </p>

        @if (sent()) {
          <div class="info-banner">
            <p><strong>Request sent.</strong></p>
            <p>{{ sentMessage() }}</p>
          </div>
          <a class="linkish back" routerLink="/login">← Back to sign in</a>
        } @else {

          @if (errorMessage()) {
            <div class="error-banner">{{ errorMessage() }}</div>
          }

          <form (ngSubmit)="submit()">
            <label class="field">
              <span class="field-label">Your name</span>
              <input
                type="text"
                name="displayName"
                autocomplete="name"
                maxlength="120"
                required
                [(ngModel)]="displayName" />
            </label>

            <label class="field">
              <span class="field-label">Email</span>
              <input
                type="email"
                name="email"
                autocomplete="email"
                maxlength="256"
                required
                [(ngModel)]="email" />
            </label>

            <label class="field">
              <span class="field-label">Choose a password</span>
              <input
                type="password"
                name="password"
                autocomplete="new-password"
                minlength="12"
                maxlength="256"
                required
                [(ngModel)]="password" />
              <small class="field-hint">
                At least 12 characters. You will use this to sign in once approved.
              </small>
            </label>

            <label class="field">
              <span class="field-label">Why do you want an account? <em>(optional)</em></span>
              <textarea
                name="reason"
                rows="3"
                maxlength="1000"
                [(ngModel)]="reason"></textarea>
            </label>

            <button class="btn-primary" type="submit" [disabled]="loading() || !isValid()">
              {{ loading() ? 'Sending…' : 'Send request' }}
            </button>
          </form>

          <a class="linkish back" routerLink="/login">← Back to sign in</a>
        }
      </div>
    </div>
  `,
  styles: [`
    /* Tokens and the banner/button classes match login.component.ts — this is the same doorway. */
    .request-wrap { display: flex; justify-content: center; padding: 3rem 1rem; }
    .request-card {
      width: 100%; max-width: 420px; background: var(--surface); color: var(--text);
      border: 1px solid var(--border); border-radius: 8px; padding: 2rem; box-shadow: var(--shadow-sm);
    }
    .request-title { margin: 0 0 0.25rem; font-size: 1.5rem; }
    .request-sub { margin: 0 0 1.5rem; color: var(--muted); font-size: 0.9rem; line-height: 1.5; }

    .field { display: block; margin-bottom: 1rem; }
    .field-label { display: block; margin-bottom: 0.35rem; font-size: 0.85rem; color: var(--muted); }
    .field input, .field textarea {
      width: 100%; padding: 0.6rem 0.75rem; border: 1px solid var(--border); border-radius: 6px;
      font: inherit; font-size: 1rem; background: var(--surface); color: var(--text); resize: vertical;
    }
    .field input:focus, .field textarea:focus {
      outline: none; border-color: var(--brand);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 20%, transparent);
    }
    .field-hint { display: block; margin-top: 0.3rem; color: var(--muted); font-size: 0.78rem; }

    .btn-primary {
      width: 100%; padding: 0.65rem 1rem; background: var(--brand); color: var(--brand-text); border: none;
      border-radius: 6px; font-size: 1rem; cursor: pointer; transition: filter 0.2s;
    }
    .btn-primary:hover:not(:disabled) { filter: brightness(0.92); }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }

    .error-banner {
      background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c3;
      border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; font-size: 0.9rem;
    }
    .info-banner {
      background: #e6f4ea; color: #137333; border: 1px solid #ceead6;
      border-radius: 6px; padding: 0.75rem; margin-bottom: 1rem; font-size: 0.9rem;
    }
    .info-banner p { margin: 0 0 0.4rem; }
    .info-banner p:last-child { margin-bottom: 0; }

    .linkish {
      background: none; border: none; color: var(--brand); cursor: pointer; padding: 0;
      font-size: 0.85rem; text-decoration: none;
    }
    .linkish:hover { text-decoration: underline; }
    .back { display: inline-block; margin-top: 1.25rem; color: var(--muted); }
  `]
})
export class RequestAccountComponent {
  displayName = '';
  email = '';
  password = '';
  reason = '';

  readonly loading = signal(false);
  readonly sent = signal(false);
  readonly sentMessage = signal('');
  readonly errorMessage = signal<string | null>(null);

  private readonly requests = inject(AccountRequestsService);

  isValid(): boolean {
    return this.displayName.trim().length > 0
      && this.email.trim().length > 3
      && this.email.includes('@')
      && this.password.length >= 12;
  }

  submit(): void {
    if (!this.isValid() || this.loading()) return;

    this.loading.set(true);
    this.errorMessage.set(null);

    this.requests.submit({
      email: this.email.trim(),
      displayName: this.displayName.trim(),
      password: this.password,
      reason: this.reason.trim() || undefined,
    }).subscribe({
      next: result => {
        // Clear the password from the component the moment it is no longer needed.
        this.password = '';
        this.sentMessage.set(result.message);
        this.sent.set(true);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.errorMessage.set(err.status === 429
          ? 'Too many requests from here. Please try again in a little while.'
          : 'Something went wrong sending that. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
