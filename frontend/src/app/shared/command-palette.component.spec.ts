import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentRef } from '@angular/core';
import { CommandPaletteComponent } from './command-palette.component';
import { NavLink } from '../core/models/navigation';

const LINKS: NavLink[] = [
  { path: '/users', labelKey: 'admin.nav.users', icon: '👤', keywords: ['accounts'] },
  { path: '/notes', labelKey: 'admin.nav.notes', icon: '📝' },
  { path: '/short-links', labelKey: 'admin.nav.shortLinks', icon: '🔗', keywords: ['url'] },
];

/**
 * The palette resolves labels through I18nService, which returns the KEY when no catalogue is
 * loaded — so in these tests a link's visible label is "admin.nav.users". Ranking is asserted
 * against that, which is fine: the point under test is the ORDER, not the wording.
 */
function make() {
  const fixture = TestBed.createComponent(CommandPaletteComponent);
  const ref = fixture.componentRef as ComponentRef<CommandPaletteComponent>;
  ref.setInput('links', LINKS);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('CommandPaletteComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommandPaletteComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('lists every page when the query is empty, so it doubles as a menu', () => {
    const palette = make();
    expect(palette.items().map(i => i.route).sort()).toEqual(['/notes', '/short-links', '/users']);
  });

  it('matches on the label', () => {
    const palette = make();
    palette.onQuery('notes');
    expect(palette.items().map(i => i.route)).toEqual(['/notes']);
  });

  it('matches on a keyword when the label does not', () => {
    // "url" appears nowhere in the Short links label or path — only in its keywords.
    const palette = make();
    palette.onQuery('url');
    expect(palette.items().map(i => i.route)).toEqual(['/short-links']);
  });

  it('ranks a label match above a keyword match', () => {
    const palette = make();
    palette.onQuery('short');
    expect(palette.items()[0].route).toBe('/short-links');
  });

  it('returns nothing for a query that matches nothing', () => {
    const palette = make();
    palette.onQuery('zzzznomatch');
    expect(palette.items()).toEqual([]);
  });

  it('wraps the keyboard selection at both ends', () => {
    const palette = make();
    expect(palette.activeIndex()).toBe(0);

    palette.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(palette.activeIndex()).toBe(2); // wrapped backwards to the last row

    palette.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(palette.activeIndex()).toBe(0); // and forwards to the first
  });

  it('emits closed on Escape', () => {
    const palette = make();
    let closed = false;
    palette.closed.subscribe(() => (closed = true));
    palette.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(true);
  });
});
