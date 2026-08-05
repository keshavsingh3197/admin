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
  {
    path: 'messages',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/messages/messages.component').then((m) => m.MessagesComponent),
  },
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
    path: 'contact-inbox',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/contact/contact-inbox.component').then((m) => m.ContactInboxComponent),
  },
  {
    path: 'security',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/security/security.component').then(
        (m) => m.SecurityComponent
      ),
  },
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
  { path: '**', redirectTo: '' },
];
