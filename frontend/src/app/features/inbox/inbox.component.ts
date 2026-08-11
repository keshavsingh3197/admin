import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { ContactInboxService } from '../../core/services/contact.service';
import { VisitorChatService } from '../../core/services/visitor-chat.service';

/** How often the tab counts refresh while the page is open, in milliseconds. */
const COUNT_POLL_MS = 20_000;

interface InboxTab {
  path: string;
  label: string;
  icon: string;
  /** Undefined means everyone signed in; otherwise the role required to see the tab. */
  adminOnly?: boolean;
  count: () => number;
  hint: string;
}

/**
 * Everything anyone said to you, in one place.
 *
 * Team chat, visitor chat and the contact form were three separate pages with the same shape — a list,
 * a thread, a reply box — which meant three places to check and three unread counts to hold in your
 * head. This is the shell around them: it owns the tabs and the counts, and each tab is still its own
 * component, because a team chat with calls and attachments and a contact form you answer by email are
 * genuinely different underneath.
 *
 * Tabs you have no business seeing aren't rendered: the contact inbox holds strangers' personal data
 * and stays Admin-only, exactly as its API does.
 */
@Component({
  selector: 'app-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="inbox">
      <nav class="sources" aria-label="Message sources">
        @for (tab of visibleTabs(); track tab.path) {
          <a class="source" [routerLink]="tab.path" routerLinkActive="on" [title]="tab.hint">
            <span class="ico" aria-hidden="true">{{ tab.icon }}</span>
            <span class="label">{{ tab.label }}</span>
            @if (tab.count() > 0) {
              <span class="badge" [attr.aria-label]="tab.count() + ' waiting'">{{ tab.count() }}</span>
            }
          </a>
        }
      </nav>

      <router-outlet />
    </div>
  `,
  styles: [`
    .inbox { display: block; }
    /* A segmented switch, not folder tabs: each tab body is a full page of its own underneath. */
    .sources { display: flex; gap: .3rem; flex-wrap: wrap; align-items: center;
      padding: 1.25rem 1.5rem .75rem; border-bottom: 1px solid var(--border); }
    .source { display: inline-flex; align-items: center; gap: .45rem; text-decoration: none;
      border: 1px solid var(--border); border-radius: 99px; padding: .35rem .85rem;
      color: var(--muted); background: var(--bg); font-size: .86rem; }
    .source:hover { color: var(--text); }
    .source.on { background: var(--brand); color: var(--brand-text); border-color: transparent; font-weight: 600; }
    .badge { min-width: 1.2rem; text-align: center; background: var(--brand); color: var(--brand-text);
      border-radius: 99px; padding: 0 .35rem; font-size: .72rem; font-weight: 700; }
    .source.on .badge { background: var(--brand-text); color: var(--brand); }
    @media (max-width: 560px) { .sources { padding-inline: .75rem; } }
  `],
})
export class InboxComponent implements OnInit {
  private auth = inject(AuthService);
  private chat = inject(ChatService);
  private contact = inject(ContactInboxService);
  private visitors = inject(VisitorChatService);
  private destroyRef = inject(DestroyRef);

  private readonly teamUnread = signal(0);
  private readonly visitorWaiting = signal(0);
  private readonly contactUnread = signal(0);

  private readonly tabs: InboxTab[] = [
    {
      path: 'team', label: 'Team', icon: '💬',
      count: () => this.teamUnread(),
      hint: 'Chat with people who have an account here',
    },
    {
      path: 'visitors', label: 'Visitors', icon: '🙋',
      count: () => this.visitorWaiting(),
      hint: 'Live chat from the public sites',
    },
    {
      path: 'contact', label: 'Contact form', icon: '✉️', adminOnly: true,
      count: () => this.contactUnread(),
      hint: 'Messages sent through the portfolio contact form',
    },
    {
      path: 'moderation', label: 'Moderation', icon: '🛡️', adminOnly: true,
      count: () => 0,
      hint: 'Review flagged messages and manage blocked users',
    },
  ];

  readonly visibleTabs = computed(() => this.tabs.filter(t => !t.adminOnly || this.auth.hasRole('Admin')));

  ngOnInit(): void {
    this.refreshCounts();
    interval(COUNT_POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshCounts());
  }

  /** Counts come from each source's own summary — cheap calls, and none of them block the page. */
  private refreshCounts(): void {
    this.chat.conversations().subscribe({
      next: list => this.teamUnread.set(list.reduce((total, c) => total + (c.unreadCount ?? 0), 0)),
      error: () => {},
    });

    this.visitors.summary().subscribe({
      next: s => this.visitorWaiting.set(s.waiting),
      error: () => {},
    });

    if (this.auth.hasRole('Admin')) {
      this.contact.summary().subscribe({
        next: s => this.contactUnread.set(s.unread),
        error: () => {},
      });
    }
  }
}
