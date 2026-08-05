import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';

/**
 * The launcher: the home of the identity provider. Signed in once here, every linked app is
 * reachable without a second login (external links open the sibling *.keshavsingh.in sites,
 * which silently pick up the shared SSO session).
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    <div class="dashboard">
      <h1>Welcome{{ firstName() ? ', ' + firstName() : '' }} 👋</h1>
      <p class="subtitle">Your apps — one sign-in for all of them.</p>

      <div class="cards">
        @if (hasAdminAccess()) {
          <a class="card" routerLink="/analytics">
            <span class="card-icon">📊</span>
            <h2>Analytics</h2>
            <p>View website health and usage metrics by site.</p>
          </a>
        }

        <a class="card" routerLink="/notes">
          <span class="card-icon">📝</span>
          <h2>Notes</h2>
          <p>Manage your notes and important information.</p>
        </a>

        <a class="card" routerLink="/inbox">
          <span class="card-icon">💬</span>
          <h2>Inbox</h2>
          <p>Team chat, visitors on the public sites, and the contact form — all in one place.</p>
        </a>

        <a class="card" routerLink="/files">
          <span class="card-icon">🗂️</span>
          <h2>Documents</h2>
          <p>Private folders &amp; documents — organize, preview, and share by permission.</p>
        </a>

        <a class="card" routerLink="/finance">
          <span class="card-icon">💰</span>
          <h2>Finance</h2>
          <p>Household income, investments &amp; goals — with suggestions to improve them.</p>
        </a>

        @if (blogAdminUrl()) {
          <a class="card" [href]="blogAdminUrl()" target="_blank" rel="noopener">
            <span class="card-icon">✍️</span>
            <h2>Blog Admin</h2>
            <p>Write and manage content for the blog.</p>
          </a>
        }

        @if (blogUrl()) {
          <a class="card" [href]="blogUrl()" target="_blank" rel="noopener">
            <span class="card-icon">🌐</span>
            <h2>Blog</h2>
            <p>Open the public blog.</p>
          </a>
        }
      </div>
    </div>
  `,
  styles: [`
    .dashboard { padding: 2rem; }
    .subtitle { color: #666; margin-bottom: 2rem; }
    .cards { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .card {
      display: flex; flex-direction: column; align-items: center;
      padding: 2rem; border-radius: 8px; border: 1px solid #e0e0e0;
      text-decoration: none; color: inherit; min-width: 160px; max-width: 220px;
      transition: box-shadow 0.2s;
    }
    .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    .card-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
    h2 { margin: 0 0 0.5rem; }
    p { margin: 0; color: #666; font-size: 0.9rem; text-align: center; }
  `]
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  private config = inject(ConfigService);

  // Launcher targets come from the IdP's central config (GET /api/config), not a hard-coded env.
  readonly blogUrl = computed(() => this.config.config()?.blogUrl ?? '');
  readonly blogAdminUrl = computed(() => this.config.config()?.blogAdminUrl ?? '');

  ngOnInit(): void {
    if (!this.config.config()) this.config.load().subscribe({ error: () => { /* links stay hidden */ } });
  }

  firstName(): string {
    return this.auth.user()?.displayName?.split(' ')[0] ?? '';
  }

  hasAdminAccess(): boolean {
    return this.auth.hasRole('Admin');
  }
}
