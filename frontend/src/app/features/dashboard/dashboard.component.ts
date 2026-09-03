import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { I18nService } from '../../core/services/i18n.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

/**
 * The launcher: the home of the identity provider. Signed in once here, every linked app is
 * reachable without a second login (external links open the sibling *.keshavsingh.in sites,
 * which silently pick up the shared SSO session).
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="dashboard">
      <h1>{{ (firstName() ? i18n.t('admin.dashboard.welcomeNamed', { name: firstName() }) : i18n.t('admin.dashboard.welcome')) }} 👋</h1>
      <p class="subtitle">{{ 'admin.dashboard.subtitle' | t }}</p>

      <div class="cards">
        @if (hasAdminAccess()) {
          <a class="card" routerLink="/analytics">
            <span class="card-icon">📊</span>
            <h2>{{ 'admin.nav.analytics' | t }}</h2>
            <p>{{ 'admin.dashboard.analytics.desc' | t }}</p>
          </a>
        }

        <a class="card" routerLink="/notes">
          <span class="card-icon">📝</span>
          <h2>{{ 'admin.nav.notes' | t }}</h2>
          <p>{{ 'admin.dashboard.notes.desc' | t }}</p>
        </a>

        <a class="card" routerLink="/inbox">
          <span class="card-icon">💬</span>
          <h2>{{ 'admin.nav.inbox' | t }}</h2>
          <p>{{ 'admin.dashboard.inbox.desc' | t }}</p>
        </a>

        <a class="card" routerLink="/files">
          <span class="card-icon">🗂️</span>
          <h2>{{ 'admin.dashboard.documents' | t }}</h2>
          <p>{{ 'admin.dashboard.documents.desc' | t }}</p>
        </a>

        <a class="card" routerLink="/finance">
          <span class="card-icon">💰</span>
          <h2>{{ 'admin.nav.finance' | t }}</h2>
          <p>{{ 'admin.dashboard.finance.desc' | t }}</p>
        </a>

        @if (blogAdminUrl()) {
          <a class="card" [href]="blogAdminUrl()" target="_blank" rel="noopener">
            <span class="card-icon">✍️</span>
            <h2>{{ 'admin.dashboard.blogAdmin' | t }}</h2>
            <p>{{ 'admin.dashboard.blogAdmin.desc' | t }}</p>
          </a>
        }

        @if (blogUrl()) {
          <a class="card" [href]="blogUrl()" target="_blank" rel="noopener">
            <span class="card-icon">🌐</span>
            <h2>{{ 'admin.dashboard.blog' | t }}</h2>
            <p>{{ 'admin.dashboard.blog.desc' | t }}</p>
          </a>
        }
      </div>
    </div>
  `,
  styles: [`
    .dashboard { padding: 2rem; }
    .subtitle { color: var(--muted); margin-bottom: 2rem; }
    .cards { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .card {
      display: flex; flex-direction: column; align-items: center;
      padding: 2rem; border-radius: 8px; border: 1px solid var(--border);
      text-decoration: none; color: inherit; min-width: 160px; max-width: 220px;
      transition: box-shadow 0.2s;
    }
    .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    .card-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
    h2 { margin: 0 0 0.5rem; }
    p { margin: 0; color: var(--muted); font-size: 0.9rem; text-align: center; }
  `]
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  private config = inject(ConfigService);
  protected readonly i18n = inject(I18nService);

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
