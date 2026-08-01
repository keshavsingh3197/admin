import {
  AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, ViewChild,
  computed, effect, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ChatService } from '../../core/services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { Conversation, DirectoryUser, Message, PresenceState } from '../../core/models/chat.models';

@Component({
  selector: 'app-messages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="chat">
      <!-- Left: conversation list -->
      <aside class="side">
        <div class="side-head">
          <h1>Messages</h1>
          <button class="btn primary sm" (click)="openDirectory()">＋ New</button>
        </div>

        @if (requests().length) {
          <div class="reqs">
            <div class="reqs-title">Chat requests</div>
            @for (c of requests(); track c.id) {
              <div class="req">
                <span class="who"><span class="dot" [class]="presenceOf(c)"></span>{{ c.partnerName }}</span>
                <div class="req-actions">
                  <button class="btn primary xs" (click)="accept(c)">Accept</button>
                  <button class="btn secondary xs" (click)="decline(c)">Decline</button>
                  <button class="btn danger xs" (click)="block(c)">Block</button>
                </div>
              </div>
            }
          </div>
        }

        <div class="list">
          @for (c of threads(); track c.id) {
            <button class="conv" [class.active]="c.id === activeId()" (click)="openConversation(c)">
              <span class="dot" [class]="presenceOf(c)"></span>
              <span class="conv-main">
                <span class="conv-top"><span class="conv-name">{{ c.partnerName }}</span>
                  @if (c.unreadCount) { <span class="unread">{{ c.unreadCount }}</span> }</span>
                <span class="conv-prev">{{ c.status === 'pending' && c.isInitiator ? 'Request sent…' : (c.lastMessagePreview || 'No messages yet') }}</span>
              </span>
            </button>
          }
          @if (!threads().length && !requests().length) {
            <p class="muted pad">No conversations yet. Start one with ＋ New.</p>
          }
        </div>
      </aside>

      <!-- Right: active thread -->
      <section class="thread-pane">
        @if (active(); as a) {
          <header class="t-head">
            <span class="who"><span class="dot" [class]="presenceOf(a)"></span>
              <strong>{{ a.partnerName }}</strong>
              <span class="pstate">{{ presenceOf(a) }}</span></span>
            <span class="t-tools">
              <button class="btn secondary xs" (click)="block(a)">Block</button>
              <button class="btn danger xs" (click)="reportSpam(a)">Report spam</button>
            </span>
          </header>

          <div class="thread" #thread>
            @for (m of messages(); track m.id) {
              <div class="bubble-row" [class.mine]="isMine(m)">
                <div class="bubble" [class.mine]="isMine(m)">
                  @if (m.deleted) { <em class="deleted">message removed</em> }
                  @else {
                    @if (m.body) { <span class="body">{{ m.body }}</span> }
                    @if (m.attachment) {
                      <button class="attach" (click)="downloadAttachment(m)">📎 {{ m.attachment.fileName }}</button>
                    }
                  }
                  <span class="time">{{ m.sentAt | date:'shortTime' }}@if (isMine(m)) { <span class="rcpt">{{ m.readAt ? '✓✓' : '✓' }}</span> }</span>
                </div>
              </div>
            }
          </div>

          @if (a.status === 'declined') {
            <div class="closed">This conversation is closed.</div>
          } @else if (a.status === 'pending' && !a.isInitiator) {
            <div class="accept-bar">
              <span>{{ a.partnerName }} wants to chat.</span>
              <button class="btn primary xs" (click)="accept(a)">Accept</button>
              <button class="btn secondary xs" (click)="decline(a)">Decline</button>
              <button class="btn danger xs" (click)="block(a)">Block</button>
            </div>
          } @else {
            <form class="composer" (ngSubmit)="sendMessage()">
              @if (file()) { <span class="file-chip">📎 {{ file()!.name }} <button type="button" (click)="clearFile()">✕</button></span> }
              <button type="button" class="icon-btn" (click)="attach.click()" title="Attach">📎</button>
              <input #attach type="file" hidden (change)="onFile($event)">
              <input class="input" placeholder="Type a message…" [(ngModel)]="draft" name="draft" autocomplete="off" />
              <button class="btn primary" type="submit" [disabled]="!draft.trim() && !file()">Send</button>
            </form>
          }
        } @else {
          <div class="placeholder">
            <p>Select a conversation, or start a new one.</p>
            @if (!chat.connected()) { <p class="muted sm">Connecting…</p> }
          </div>
        }
      </section>
    </div>

    @if (error()) { <div class="toast">{{ error() }}</div> }

    <!-- Directory picker -->
    @if (directoryOpen()) {
      <div class="overlay" (click)="directoryOpen.set(false)">
        <div class="panel" (click)="$event.stopPropagation()">
          <header class="p-head"><span class="p-title">Start a chat</span>
            <button class="icon-btn" (click)="directoryOpen.set(false)">✕</button></header>
          <div class="p-body">
            @for (u of directory(); track u.id) {
              <button class="dir-row" (click)="startChat(u)">
                <span class="dot" [class]="u.presence"></span>{{ u.displayName }}
              </button>
            }
            @if (!directory().length) { <p class="muted pad">No one else to chat with.</p> }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .chat { display: grid; grid-template-columns: 300px 1fr; gap: 1rem; height: calc(100vh - 120px); padding: 1.5rem; }
    .side { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); overflow: hidden; }
    .side-head { display: flex; align-items: center; justify-content: space-between; padding: .75rem 1rem; border-bottom: 1px solid var(--border); }
    .side-head h1 { margin: 0; font-size: 1.1rem; }
    .reqs { padding: .5rem; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--brand) 6%, var(--surface)); }
    .reqs-title { font-size: .75rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin: .1rem .25rem .4rem; }
    .req { display: flex; flex-direction: column; gap: .35rem; padding: .4rem; }
    .req-actions { display: flex; gap: .3rem; }
    .list { flex: 1; overflow: auto; }
    .conv { display: flex; align-items: center; gap: .6rem; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--border); padding: .65rem .8rem; cursor: pointer; color: var(--text); }
    .conv:hover { background: var(--bg); }
    .conv.active { background: color-mix(in srgb, var(--brand) 10%, var(--surface)); }
    .conv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .1rem; }
    .conv-top { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
    .conv-name { font-weight: 600; font-size: .9rem; }
    .conv-prev { color: var(--muted); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .unread { background: var(--brand); color: var(--brand-text); border-radius: 99px; font-size: .7rem; padding: .05rem .4rem; }
    .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: #9aa5b1; }
    .dot.online { background: #2ecc71; } .dot.idle { background: #f1c40f; } .dot.offline { background: #9aa5b1; }
    .thread-pane { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); overflow: hidden; }
    .t-head { display: flex; align-items: center; justify-content: space-between; padding: .6rem 1rem; border-bottom: 1px solid var(--border); }
    .who { display: inline-flex; align-items: center; gap: .5rem; }
    .pstate { color: var(--muted); font-size: .78rem; text-transform: capitalize; }
    .t-tools { display: flex; gap: .4rem; }
    .thread { flex: 1; overflow: auto; padding: 1rem; display: flex; flex-direction: column; gap: .5rem; background: var(--bg); }
    .bubble-row { display: flex; }
    .bubble-row.mine { justify-content: flex-end; }
    .bubble { max-width: 70%; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: .5rem .7rem; display: flex; flex-direction: column; gap: .25rem; }
    .bubble.mine { background: var(--brand); color: var(--brand-text); border-color: transparent; }
    .body { white-space: pre-wrap; word-break: break-word; font-size: .9rem; }
    .attach { background: color-mix(in srgb, #000 6%, transparent); border: none; border-radius: 6px; padding: .25rem .5rem; cursor: pointer; font-size: .82rem; color: inherit; text-align: left; }
    .time { font-size: .68rem; opacity: .7; align-self: flex-end; }
    .rcpt { margin-left: .25rem; }
    .deleted { opacity: .7; }
    .closed, .accept-bar { padding: .75rem 1rem; border-top: 1px solid var(--border); display: flex; align-items: center; gap: .5rem; color: var(--muted); }
    .composer { display: flex; align-items: center; gap: .5rem; padding: .6rem .8rem; border-top: 1px solid var(--border); }
    .composer .input { flex: 1; }
    .input { padding: .55rem .75rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font-size: .9rem; }
    .input:focus { outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 25%, transparent); }
    .file-chip { display: inline-flex; align-items: center; gap: .35rem; font-size: .8rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: .2rem .5rem; }
    .file-chip button { background: none; border: none; cursor: pointer; }
    .btn { display: inline-flex; align-items: center; gap: .4rem; border: 1px solid transparent; border-radius: 7px; padding: .5rem .85rem; font-size: .88rem; cursor: pointer; }
    .btn.sm { padding: .35rem .7rem; font-size: .82rem; } .btn.xs { padding: .25rem .55rem; font-size: .78rem; }
    .btn.primary { background: var(--brand); color: var(--brand-text); }
    .btn.secondary { background: var(--bg); color: var(--text); border-color: var(--border); }
    .btn.danger { background: transparent; color: #d93025; border-color: color-mix(in srgb, #d93025 40%, transparent); }
    .btn:disabled { opacity: .5; cursor: default; }
    .icon-btn { background: var(--bg); border: 1px solid var(--border); border-radius: 7px; width: 34px; height: 34px; cursor: pointer; }
    .placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--muted); }
    .muted { color: var(--muted); } .muted.sm { font-size: .82rem; } .pad { padding: 1rem; }
    .toast { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c6; border-radius: 8px; padding: .6rem 1rem; z-index: 50; }
    .overlay { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, #0a1020 55%, transparent); backdrop-filter: blur(2px); }
    .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; width: min(420px, 92%); max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; }
    .p-head { display: flex; align-items: center; justify-content: space-between; padding: .75rem 1rem; border-bottom: 1px solid var(--border); }
    .p-title { font-weight: 600; }
    .p-body { overflow: auto; }
    .dir-row { display: flex; align-items: center; gap: .5rem; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--border); padding: .6rem 1rem; cursor: pointer; color: var(--text); }
    .dir-row:hover { background: var(--bg); }
    @media (max-width: 720px) { .chat { grid-template-columns: 1fr; height: auto; } }
  `],
})
export class MessagesComponent implements AfterViewChecked {
  chat = inject(ChatService);
  private auth = inject(AuthService);
  @ViewChild('thread') threadEl?: ElementRef<HTMLElement>;

  conversations = signal<Conversation[]>([]);
  activeId = signal<string | null>(null);
  messages = signal<Message[]>([]);
  directory = signal<DirectoryUser[]>([]);
  directoryOpen = signal(false);
  error = signal<string | null>(null);
  draft = '';
  file = signal<File | null>(null);

  private shouldScroll = false;

  readonly myId = computed(() => this.auth.user()?.id ?? '');
  readonly active = computed(() => this.conversations().find(c => c.id === this.activeId()) ?? null);
  readonly requests = computed(() => this.conversations().filter(c => c.status === 'pending' && !c.isInitiator));
  readonly threads = computed(() => this.conversations().filter(c => !(c.status === 'pending' && !c.isInitiator)));

  constructor() {
    this.chat.connect();
    // Refresh the list whenever the server signals a change (also runs once on init).
    effect(() => { this.chat.conversationsDirty(); this.loadConversations(); });
    // Append a pushed message to the open thread.
    effect(() => { const m = this.chat.incoming(); if (m) this.onIncoming(m); });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.threadEl) {
      this.threadEl.nativeElement.scrollTop = this.threadEl.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }

  presenceOf(c: Conversation): PresenceState {
    return this.chat.presence()[c.partnerId] ?? c.presence;
  }

  isMine(m: Message): boolean { return m.senderUserId === this.myId(); }

  private loadConversations(): void {
    this.chat.conversations().subscribe({
      next: cs => this.conversations.set(cs),
      error: () => this.error.set('Could not load conversations.'),
    });
  }

  openConversation(c: Conversation): void {
    this.activeId.set(c.id);
    this.chat.messages(c.id).subscribe({
      next: ms => { this.messages.set(ms); this.shouldScroll = true; },
      error: () => this.error.set('Could not load this conversation.'),
    });
    if (c.unreadCount) this.chat.markRead(c.id).subscribe({ next: () => this.loadConversations(), error: () => {} });
  }

  private onIncoming(m: Message): void {
    if (m.conversationId === this.activeId()) {
      this.messages.update(list => list.some(x => x.id === m.id) ? list : [...list, m]);
      this.shouldScroll = true;
      if (!this.isMine(m)) this.chat.markRead(m.conversationId).subscribe({ next: () => {}, error: () => {} });
    }
  }

  sendMessage(): void {
    const id = this.activeId();
    const text = this.draft.trim();
    if (!id || (!text && !this.file())) return;
    this.chat.send(id, text, this.file()).subscribe({
      next: m => {
        this.draft = ''; this.file.set(null);
        this.messages.update(list => list.some(x => x.id === m.id) ? list : [...list, m]);
        this.shouldScroll = true;
      },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not send the message.'),
    });
  }

  onFile(e: Event): void { const i = e.target as HTMLInputElement; this.file.set(i.files?.[0] ?? null); i.value = ''; }
  clearFile(): void { this.file.set(null); }

  accept(c: Conversation): void { this.act(this.chat.accept(c.id), c.id); }
  decline(c: Conversation): void { this.act(this.chat.decline(c.id)); }
  block(c: Conversation): void {
    if (!confirm(`Block ${c.partnerName}? They won't be able to message you.`)) return;
    this.act(this.chat.block(c.id));
  }
  reportSpam(c: Conversation): void {
    if (!confirm(`Report ${c.partnerName} for spam and block them?`)) return;
    this.act(this.chat.reportSpam(c.id));
  }

  private act(obs: Observable<void>, openAfter: string | null = null): void {
    obs.subscribe({
      next: () => { this.loadConversations(); if (openAfter) this.activeId.set(openAfter); },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Action failed.'),
    });
  }

  openDirectory(): void {
    this.directoryOpen.set(true);
    this.chat.directory().subscribe({ next: d => this.directory.set(d), error: () => this.error.set('Could not load the directory.') });
  }

  startChat(u: DirectoryUser): void {
    this.directoryOpen.set(false);
    this.chat.start(u.id).subscribe({
      next: c => { this.loadConversations(); this.activeId.set(c.id); this.messages.set([]); },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not start the chat.'),
    });
  }

  downloadAttachment(m: Message): void {
    if (!m.attachment) return;
    this.chat.downloadAttachment(m.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = m.attachment!.fileName; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.error.set('Could not download the attachment.'),
    });
  }
}
