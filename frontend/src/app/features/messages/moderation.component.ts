import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../core/services/chat.service';
import { CallService, formatDuration } from '../../core/services/call.service';
import { AdminBlock, AdminConversation, Message } from '../../core/models/chat.models';
import { AdminCall } from '../../core/models/call.models';

@Component({
  selector: 'app-messages-moderation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mod">
      <header class="head">
        <h1>Chat moderation</h1>
        <div class="tabs">
          <button class="tab" [class.on]="tab() === 'conversations'" (click)="tab.set('conversations')">Conversations</button>
          <button class="tab" [class.on]="tab() === 'blocks'" (click)="loadBlocks()">Blocks &amp; reports</button>
          <button class="tab" [class.on]="tab() === 'calls'" (click)="loadCalls()">Calls</button>
        </div>
      </header>

      @if (tab() === 'conversations') {
        <label class="chk"><input type="checkbox" [(ngModel)]="flaggedOnly" (ngModelChange)="loadConversations()" /> Show only spam-flagged</label>
        <div class="grid">
          <div class="col">
            @for (c of conversations(); track c.id) {
              <button class="row" [class.on]="c.id === activeId()" (click)="openThread(c.id)">
                <span class="names">{{ c.participantNames.join(' ↔ ') }}</span>
                <span class="tags">
                  @if (c.flaggedSpam) { <span class="tag spam">spam</span> }
                  <span class="tag">{{ c.status }}</span>
                  <span class="count">{{ c.messageCount }} msg</span>
                </span>
              </button>
            }
            @if (!conversations().length) { <p class="muted pad">No conversations.</p> }
          </div>
          <div class="col thread">
            @if (activeId()) {
              @for (m of messages(); track m.id) {
                <div class="msg">
                  <div class="msg-top"><span class="sender">{{ m.senderUserId }}</span><span class="time">{{ m.sentAt | date:'short' }}</span></div>
                  @if (m.deleted) { <em class="deleted">removed</em> }
                  @else {
                    @if (m.body) { <span class="body">{{ m.body }}</span> }
                    @if (m.attachment) { <span class="attach">📎 {{ m.attachment.fileName }}</span> }
                    <button class="del" (click)="deleteMessage(m)">Delete</button>
                  }
                </div>
              }
              @if (!messages().length) { <p class="muted pad">No messages.</p> }
            } @else { <p class="muted pad">Select a conversation to review its messages.</p> }
          </div>
        </div>
      } @else if (tab() === 'blocks') {
        <table class="tbl">
          <thead><tr><th>Blocker</th><th>Blocked</th><th>Reason</th><th>When</th></tr></thead>
          <tbody>
            @for (b of blocks(); track $index) {
              <tr><td>{{ b.blockerName }}</td><td>{{ b.blockedName }}</td>
                <td><span class="tag" [class.spam]="b.reason === 'spam'">{{ b.reason }}</span></td>
                <td>{{ b.createdAt | date:'short' }}</td></tr>
            }
            @if (!blocks().length) { <tr><td colspan="4" class="muted">No blocks or spam reports.</td></tr> }
          </tbody>
        </table>
      } @else {
        <!-- Call log: who called whom and for how long. Calls are peer-to-peer and end-to-end
             encrypted, so there is no audio to review — only these records. -->
        <p class="muted note">Audio and video are peer-to-peer and end-to-end encrypted — never recorded. This is the call log only.</p>
        <table class="tbl">
          <thead><tr><th>Participants</th><th>Kind</th><th>State</th><th>Started</th><th>Answered</th><th>Duration</th></tr></thead>
          <tbody>
            @for (c of calls(); track c.callId) {
              <tr>
                <td>{{ c.participantNames.join(' → ') }}</td>
                <td>{{ c.media === 'video' ? '📹 Video' : '📞 Audio' }}</td>
                <td><span class="tag" [class.spam]="c.endReason === 'failed'">{{ c.endReason ?? c.state }}</span></td>
                <td>{{ c.startedAt | date:'short' }}</td>
                <td>{{ c.answeredAt ? (c.answeredAt | date:'shortTime') : '—' }}</td>
                <td>{{ c.durationSeconds ? duration(c.durationSeconds) : '—' }}</td>
              </tr>
            }
            @if (!calls().length) { <tr><td colspan="6" class="muted">No calls yet.</td></tr> }
          </tbody>
        </table>
      }

      @if (error()) { <div class="toast">{{ error() }}</div> }
    </div>
  `,
  styles: [`
    .mod { padding: 1.5rem; max-width: 1100px; margin: 0 auto; }
    .head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .5rem; }
    h1 { margin: 0; }
    .tabs { display: flex; gap: .25rem; }
    .tab { background: var(--bg); border: 1px solid var(--border); border-radius: 7px; padding: .4rem .8rem; cursor: pointer; color: var(--text); }
    .tab.on { background: var(--brand); color: var(--brand-text); border-color: transparent; }
    .chk { display: inline-flex; align-items: center; gap: .4rem; margin: 1rem 0; color: var(--muted); font-size: .9rem; }
    .grid { display: grid; grid-template-columns: 360px 1fr; gap: 1rem; }
    .col { border: 1px solid var(--border); border-radius: 12px; background: var(--surface); overflow: hidden; max-height: 70vh; overflow-y: auto; }
    .row { display: flex; flex-direction: column; gap: .3rem; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--border); padding: .6rem .8rem; cursor: pointer; color: var(--text); }
    .row:hover { background: var(--bg); } .row.on { background: color-mix(in srgb, var(--brand) 10%, var(--surface)); }
    .names { font-weight: 600; font-size: .9rem; }
    .tags { display: flex; align-items: center; gap: .4rem; }
    .tag { font-size: .72rem; background: var(--bg); border: 1px solid var(--border); border-radius: 99px; padding: .05rem .5rem; text-transform: capitalize; }
    .tag.spam { background: #fce8e6; color: #c5221f; border-color: #f5c6c6; }
    .count { font-size: .72rem; color: var(--muted); }
    .thread { padding: .75rem; }
    .msg { border-bottom: 1px solid var(--border); padding: .5rem 0; display: flex; flex-direction: column; gap: .2rem; }
    .msg-top { display: flex; justify-content: space-between; font-size: .72rem; color: var(--muted); }
    .body { white-space: pre-wrap; word-break: break-word; font-size: .9rem; }
    .attach { font-size: .82rem; color: var(--muted); }
    .del { align-self: flex-start; background: transparent; border: 1px solid color-mix(in srgb, #d93025 40%, transparent); color: #d93025; border-radius: 6px; padding: .15rem .5rem; cursor: pointer; font-size: .76rem; }
    .deleted { opacity: .7; }
    .tbl { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    .tbl th, .tbl td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid var(--border); font-size: .88rem; }
    .muted { color: var(--muted); } .pad { padding: 1rem; }
    .note { font-size: .84rem; margin: 1rem 0 0; }
    .toast { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); background: #fce8e6; color: #c5221f; border: 1px solid #f5c6c6; border-radius: 8px; padding: .6rem 1rem; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class MessagesModerationComponent implements OnInit {
  private chat = inject(ChatService);
  private callsApi = inject(CallService);

  tab = signal<'conversations' | 'blocks' | 'calls'>('conversations');
  conversations = signal<AdminConversation[]>([]);
  activeId = signal<string | null>(null);
  messages = signal<Message[]>([]);
  blocks = signal<AdminBlock[]>([]);
  calls = signal<AdminCall[]>([]);
  error = signal<string | null>(null);
  flaggedOnly = false;

  duration = formatDuration;

  ngOnInit(): void { this.loadConversations(); }

  loadConversations(): void {
    this.tab.set('conversations');
    this.chat.adminConversations(this.flaggedOnly).subscribe({
      next: c => this.conversations.set(c),
      error: () => this.error.set('Could not load conversations.'),
    });
  }

  openThread(id: string): void {
    this.activeId.set(id);
    this.chat.adminMessages(id).subscribe({ next: m => this.messages.set(m), error: () => this.error.set('Could not load messages.') });
  }

  deleteMessage(m: Message): void {
    if (!confirm('Delete this message? The content and any attachment will be removed.')) return;
    this.chat.adminDeleteMessage(m.id).subscribe({
      next: () => { if (this.activeId()) this.openThread(this.activeId()!); },
      error: () => this.error.set('Could not delete the message.'),
    });
  }

  loadBlocks(): void {
    this.tab.set('blocks');
    this.chat.adminBlocks().subscribe({ next: b => this.blocks.set(b), error: () => this.error.set('Could not load blocks.') });
  }

  loadCalls(): void {
    this.tab.set('calls');
    this.callsApi.adminCalls().subscribe({ next: c => this.calls.set(c), error: () => this.error.set('Could not load the call log.') });
  }
}
