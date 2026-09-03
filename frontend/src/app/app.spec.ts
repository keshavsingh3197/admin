import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { NAV_GROUPS } from './core/models/navigation';

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders no chrome when signed out', async () => {
    // Login and the account-request page own the whole viewport: a sidebar full of links you
    // cannot open is worse than no sidebar.
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.sidebar')).toBeNull();
    expect(compiled.querySelector('.topbar')).toBeNull();
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('never advertises an Admin-only page to a non-Admin', () => {
    // The shell is not the authorization decision — the router and the API are — but it must not
    // offer a link that will bounce the user straight back to the launcher. This is the regression
    // that mattered: the old Manage menu listed all eleven Admin pages, the database console among
    // them, to anyone signed in with any grant at all.
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.pagePermissions.set(['page.notes', 'page.users']);

    const paths = app.visibleLinks().map(l => l.path);
    for (const adminPath of ['/database', '/settings', '/roles', '/users', '/analytics', '/packages']) {
      expect(paths).not.toContain(adminPath);
    }
  });

  it('shows a granted page, and drops the groups that empty out', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.pagePermissions.set(['page.notes']);

    const groups = app.visibleGroups();
    const paths = app.visibleLinks().map(l => l.path);

    expect(app.hasAppAccess()).toBe(true);
    expect(paths).toContain('/notes');
    expect(paths).not.toContain('/files');
    // People is entirely Admin-only, so it disappears rather than rendering an empty heading.
    expect(groups.map(g => g.fallback)).not.toContain('People');
    expect(groups.every(g => g.links.length > 0)).toBe(true);
  });
});

describe('Navigation map', () => {
  it('has no duplicate routes', () => {
    // Two entries for one path would render the page twice in the sidebar and twice in the palette.
    const paths = NAV_GROUPS.flatMap(g => g.links).map(l => l.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every link an absolute path and a label key', () => {
    for (const link of NAV_GROUPS.flatMap(g => g.links)) {
      expect(link.path.startsWith('/')).toBe(true);
      expect(link.labelKey).toMatch(/^admin\.nav\./);
    }
  });

  it('names only page.* permissions', () => {
    // A nav entry gated on an action.* or site.* key would never match, because the shell filters
    // against the adminPermissions list, which holds page keys.
    for (const link of NAV_GROUPS.flatMap(g => g.links)) {
      if (link.permissionKey) expect(link.permissionKey.startsWith('page.')).toBe(true);
    }
  });
});
