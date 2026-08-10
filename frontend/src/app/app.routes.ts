import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
  },
  {
    path: 'notes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/notes/notes.component').then(
        (m) => m.NotesComponent
      ),
  },
  {
    path: 'files',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/files/files.component').then((m) => m.FilesComponent),
  },
  {
    path: 'short-links',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/short-links/short-links.component').then((m) => m.ShortLinksComponent),
  },
  {
    path: 'finance',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/finance/finance-dashboard.component').then((m) => m.FinanceDashboardComponent),
  },
  {
    path: 'finance/manage',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/finance/finance-manage.component').then((m) => m.FinanceManageComponent),
  },
  /**
   * One page for everything anyone said to you: team chat, visitor chat and the contact form as tabs
   * of a single Inbox rather than three near-identical pages. Each tab keeps its own component — they
   * only look alike from the outside.
   */
  {
    path: 'inbox',
    canActivate: [authGuard],
    loadComponent: () => import('./features/inbox/inbox.component').then((m) => m.InboxComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'team' },
      {
        path: 'team',
        loadComponent: () =>
          import('./features/messages/messages.component').then((m) => m.MessagesComponent),
      },
      {
        path: 'visitors',
        loadComponent: () =>
          import('./features/visitor-chat/visitor-chat.component').then((m) => m.VisitorChatComponent),
      },
      {
        path: 'contact',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/contact/contact-inbox.component').then((m) => m.ContactInboxComponent),
      },
    ],
  },
  // The old addresses still work — bookmarks and anything linking to them shouldn't break.
  { path: 'messages', pathMatch: 'full', redirectTo: 'inbox/team' },
  { path: 'visitor-chat', pathMatch: 'full', redirectTo: 'inbox/visitors' },
  { path: 'contact-inbox', pathMatch: 'full', redirectTo: 'inbox/contact' },
  {
    path: 'messages/moderation',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/messages/moderation.component').then((m) => m.MessagesModerationComponent),
  },
  {
    path: 'meetings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/meetings/meetings.component').then((m) => m.MeetingsComponent),
  },
  {
    path: 'website',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/website/website-manage.component').then((m) => m.WebsiteManageComponent),
  },
  {
    path: 'database',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/database/db-console.component').then((m) => m.DbConsoleComponent),
  },
  /**
   * The self-service account area: one "Profile" entry with tabs, replacing three separate top-level
   * routes. The old addresses still work (bookmarks, the account menu on another cached build).
   */
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'info' },
      {
        path: 'info',
        loadComponent: () =>
          import('./features/profile/profile-info.component').then((m) => m.ProfileInfoComponent),
      },
      {
        path: 'security',
        loadComponent: () =>
          import('./features/security/security.component').then((m) => m.SecurityComponent),
      },
      {
        path: 'sessions',
        loadComponent: () =>
          import('./features/sessions/sessions.component').then((m) => m.SessionsComponent),
      },
    ],
  },
  { path: 'security', pathMatch: 'full', redirectTo: 'profile/security' },
  { path: 'sessions', pathMatch: 'full', redirectTo: 'profile/sessions' },
  {
    path: 'users',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/users/users.component').then((m) => m.UsersComponent),
  },
  {
    path: 'roles',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/roles/roles.component').then((m) => m.RolesComponent),
  },
  {
    path: 'groups',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/groups/groups.component').then((m) => m.GroupsComponent),
  },
  {
    path: 'search',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/search/search.component').then((m) => m.SearchComponent),
  },
  /**
   * Languages, translations and the runtime config registry. Editors may translate; only an Admin can
   * add a language or change a config key, which the API enforces per endpoint — this guard is the
   * outer layer, not the only one.
   */
  {
    path: 'localization',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/localization/localization.component').then((m) => m.LocalizationComponent),
  },
  {
    path: 'settings',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'analytics',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/analytics/analytics.component').then((m) => m.AnalyticsComponent),
  },
  {
    path: 'data-retention',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/data-retention/data-retention.component').then((m) => m.DataRetentionComponent),
  },
  {
    path: 'health',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/health/health.component').then((m) => m.HealthComponent),
  },
  {
    path: 'packages',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/packages/packages.component').then((m) => m.PackagesComponent),
  },
  { path: '**', redirectTo: '' },
];
