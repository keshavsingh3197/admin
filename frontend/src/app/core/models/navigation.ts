/**
 * The application's navigation map — the single declaration of which pages exist, what gates them,
 * and how they are grouped.
 *
 * <para>Both the sidebar and the command palette render from this list, so a new page appears in
 * both by adding one entry here. Keeping it out of the shell component is what stops the two from
 * drifting apart.</para>
 */
export interface NavLink {
  path: string;
  /**
   * Translation key resolved through `I18nService`, so the nav follows the chosen language. The
   * English text lives in the catalogue (namespace `admin`), not here.
   */
  labelKey: string;
  /**
   * Fallback glyph only: the live one comes from the config registry (`ui.icon.*`) when an admin has
   * configured it.
   */
  icon: string;
  /**
   * The `PermissionCatalog` "page.*" key that gates this page server-side (see
   * `RequirePagePermissionAttribute`). Undefined means every signed-in user can see it (nothing
   * server-side gates it beyond `[Authorize]`). Admin role always sees everything regardless.
   */
  permissionKey?: string;
  /**
   * True when the ROUTE is behind `adminGuard` — the Admin role and nothing else opens it.
   *
   * <para>Separate from {@link permissionKey} because they are different gates and a page can have
   * both. Without this the sidebar advertised eleven Admin-only pages (the database console among
   * them) to any signed-in user with a single unrelated grant, who would then be bounced back to
   * the launcher by the guard. Keep it in step with `app.routes.ts`: an entry marked here must be
   * the one guarded there.</para>
   */
  adminOnly?: boolean;
  /** Extra words the command palette matches on, for pages people call something else. */
  keywords?: string[];
}

export interface NavGroup {
  /** Section heading in the sidebar. Deliberately short — it sits above the links in small caps. */
  labelKey: string;
  /** English fallback, used until the translation catalogue has loaded. */
  fallback: string;
  links: NavLink[];
}

/**
 * Grouped by what the page is FOR, not by who may see it: an Editor with a single grant should still
 * find that page under a heading that means something. Empty groups are dropped at render time.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'admin.nav.group.workspace',
    fallback: 'Workspace',
    links: [
      // One entry for every conversation — team chat, visitors and the contact form are tabs inside it.
      { path: '/inbox', labelKey: 'admin.nav.inbox', icon: '💬', permissionKey: 'page.inbox', keywords: ['chat', 'messages', 'visitors', 'contact'] },
      { path: '/meetings', labelKey: 'admin.nav.meetings', icon: '📅', keywords: ['calendar', 'call', 'schedule'] },
      { path: '/notes', labelKey: 'admin.nav.notes', icon: '📝', permissionKey: 'page.notes' },
      { path: '/files', labelKey: 'admin.nav.files', icon: '📁', permissionKey: 'page.files', keywords: ['documents', 'storage', 'upload'] },
      { path: '/short-links', labelKey: 'admin.nav.shortLinks', icon: '🔗', permissionKey: 'page.shortLinks', keywords: ['url', 'redirect'] },
      { path: '/finance', labelKey: 'admin.nav.finance', icon: '💰', permissionKey: 'page.finance', keywords: ['money', 'budget', 'ledger'] },
    ],
  },
  {
    labelKey: 'admin.nav.group.content',
    fallback: 'Content',
    links: [
      { path: '/localization', labelKey: 'admin.nav.localization', icon: '🌍', keywords: ['i18n', 'translations', 'strings', 'config'] },
      { path: '/website', adminOnly: true, labelKey: 'admin.nav.websites', icon: '🌐', keywords: ['sites', 'registry', 'links'] },
    ],
  },
  {
    labelKey: 'admin.nav.group.people',
    fallback: 'People',
    links: [
      { path: '/users', adminOnly: true, labelKey: 'admin.nav.users', icon: '👤', permissionKey: 'page.users', keywords: ['accounts', 'members'] },
      { path: '/account-requests', adminOnly: true, labelKey: 'admin.nav.accountRequests', icon: '🙋', keywords: ['signup', 'pending', 'approve'] },
      { path: '/groups', adminOnly: true, labelKey: 'admin.nav.groups', icon: '👪', permissionKey: 'page.groups', keywords: ['teams', 'family'] },
      { path: '/roles', adminOnly: true, labelKey: 'admin.nav.roles', icon: '🎫', permissionKey: 'page.roles', keywords: ['permissions', 'rbac', 'access'] },
    ],
  },
  {
    labelKey: 'admin.nav.group.platform',
    fallback: 'Platform',
    links: [
      { path: '/analytics', adminOnly: true, labelKey: 'admin.nav.analytics', icon: '📊', permissionKey: 'page.analytics', keywords: ['visits', 'traffic', 'stats'] },
      { path: '/audit', labelKey: 'admin.nav.audit', icon: '🧾', permissionKey: 'page.audit', keywords: ['log', 'history', 'who did what', 'events', 'security'] },
      { path: '/database', adminOnly: true, labelKey: 'admin.nav.database', icon: '🗃️', keywords: ['mongo', 'console', 'query', 'backup'] },
      { path: '/data-retention', adminOnly: true, labelKey: 'admin.nav.dataRetention', icon: '🗄️', keywords: ['purge', 'privacy', 'cleanup'] },
      { path: '/health', adminOnly: true, labelKey: 'admin.nav.health', icon: '❤️', permissionKey: 'page.health', keywords: ['status', 'diagnostics', 'uptime'] },
      { path: '/packages', adminOnly: true, labelKey: 'admin.nav.packages', icon: '📦', keywords: ['versions', 'nuget', 'npm', 'releases'] },
      { path: '/settings', adminOnly: true, labelKey: 'admin.nav.settings', icon: '⚙️', permissionKey: 'page.settings', keywords: ['configuration', 'branding', 'auth'] },
    ],
  },
];
