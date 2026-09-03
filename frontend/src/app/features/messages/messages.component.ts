import {
  AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild,
  computed, effect, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ChatService } from '../../core/services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { CallService, formatDuration } from '../../core/services/call.service';
import { UsersService } from '../../core/services/users.service';
import {
  Attachment, ChatVisibility, Conversation, ConversationMember, DirectoryUser, Message, PresenceState,
} from '../../core/models/chat.models';
import { CallMedia, CallSummary } from '../../core/models/call.models';

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
          <div class="vis-toggle" title="Who can find you when searching the chat directory">
            <button type="button" class="vis-btn" [class.active]="visibility() === 'everyone'" (click)="setVisibility('everyone')">🌐 Everyone</button>
            <button type="button" class="vis-btn" [class.active]="visibility() === 'family'" (click)="setVisibility('family')">👪 Family</button>
          </div>
          <button class="btn primary sm" (click)="openDirectory()">＋ New</button>
          <button class="btn secondary sm" (click)="openGroupBuilder()" title="Create a group">👪 Group</button>
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
                <span class="conv-top"><span class="conv-name">{{ c.isGroup ? '👪 ' : '' }}{{ c.partnerName }}</span>
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
              <strong>{{ a.isGroup ? '👪 ' : '' }}{{ a.partnerName }}</strong>
              @if (a.isGroup) {
                <button class="pstate link" type="button" (click)="membersOpen.set(!membersOpen())"
                        title="Group members">{{ a.participants?.length ?? 0 }} members</button>
              } @else {
                <span class="pstate">{{ presenceOf(a) }}</span>
              }</span>
            <span class="t-tools">
              @if (a.status === 'accepted') {
                <button class="btn primary xs" [disabled]="calls.busy()" (click)="startCall(a)"
                        title="Start an audio call">📞 Call</button>
                <button class="btn primary xs" [disabled]="calls.busy()" (click)="startCall(a, 'video')"
                        title="Start a video call">📹 Video</button>
              }
              @if (a.isGroup) {
                @if (isOwner(a)) {
                  <button class="btn secondary xs" (click)="renameGroup(a)">Rename</button>
                }
                <button class="btn danger xs" (click)="leaveGroup(a)">Leave</button>
              } @else {
                <button class="btn secondary xs" (click)="block(a)">Block</button>
                <button class="btn danger xs" (click)="reportSpam(a)">Report spam</button>
              }
            </span>
          </header>

          @if (a.isGroup && membersOpen()) {
            <div class="members">
              @for (m of a.participants ?? []; track m.id) {
                <span class="member">
                  <span class="dot" [class]="chat.presence()[m.id] ?? m.presence"></span>{{ m.displayName }}
                  @if (m.isOwner) { <em class="tag">host</em> }
                  @if (isOwner(a) && !m.isOwner) {
                    <button class="mini-btn" type="button" (click)="removeMember(a, m)" title="Remove">✕</button>
                  }
                </span>
              }
              <button class="btn secondary xs" (click)="openAddMembers(a)">＋ Add people</button>
            </div>
          }

          <div class="thread" #thread>
            @for (m of messages(); track m.id) {
              @if (m.systemKind) {
                <div class="system-row"><span class="system">{{ m.body }}</span></div>
              } @else {
              <div class="bubble-row" [class.mine]="isMine(m)">
                <div class="bubble" [class.mine]="isMine(m)" [class.call-bubble]="!!m.call">
                  @if (a.isGroup && !isMine(m) && m.senderName) {
                    <span class="sender">{{ m.senderName }}</span>
                  }
                  @if (m.deleted) { <em class="deleted">message removed</em> }
                  @else if (m.call; as c) {
                    <span class="call-line">{{ callIcon(c) }} {{ callText(m, c) }}</span>
                    @if (c.participants?.length) {
                      <span class="call-breakdown">
                        @for (p of c.participants; track p.name) {
                          <span class="cb-row">{{ p.name }} — {{ duration(p.seconds) }}</span>
                        }
                      </span>
                    }
                  }
                  @else {
                    @if (m.forwarded) { <span class="fwd-tag">↪ Forwarded</span> }
                    @if (m.body) { <span class="body">{{ m.body }}</span> }
                    @if (m.attachment; as att) {
                      @if (isImage(att)) {
                        <img class="att-img" [src]="mediaUrl(m)" (click)="downloadAttachment(m)" alt="{{ att.fileName }}" />
                      } @else if (isAudio(att)) {
                        <audio class="att-audio" [src]="mediaUrl(m)" controls></audio>
                      } @else if (isVideo(att)) {
                        <video class="att-video" [src]="mediaUrl(m)" controls></video>
                      } @else {
                        <button class="attach" (click)="downloadAttachment(m)">📎 {{ att.fileName }}</button>
                      }
                      <div class="msg-tools">
                        <button class="mini-btn" type="button" (click)="openForward(m)" title="Forward">↪</button>
                        <button class="mini-btn" type="button" (click)="shareAttachment(m)" title="Copy share link">🔗</button>
                      </div>
                    } @else {
                      <div class="msg-tools">
                        <button class="mini-btn" type="button" (click)="openForward(m)" title="Forward">↪</button>
                      </div>
                    }
                  }
                  <span class="time">{{ m.sentAt | date:'shortTime' }}@if (isMine(m)) { <span class="rcpt">{{ m.readAt ? '✓✓' : '✓' }}</span> }</span>
                </div>
              </div>
              }
            }
            @if (typingLabel(); as label) {
              <div class="typing" aria-live="polite">{{ label }}</div>
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
              <button type="button" class="icon-btn" (click)="attach.click()" title="Attach a file or video">📎</button>
              <input #attach type="file" hidden (change)="onFile($event)">
              <button type="button" class="icon-btn" [class.recording]="recording()" (click)="toggleVoice()" title="Record a voice message">{{ recording() ? '⏹️' : '🎙️' }}</button>
              <input class="input" placeholder="Type a message…" [(ngModel)]="draft" name="draft"
                     autocomplete="off" (ngModelChange)="onDraftChanged()" />
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
    @if (notice()) { <div class="toast info">{{ notice() }}</div> }

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

    <!-- Group builder: also used to add people to an existing group -->
    @if (groupMode(); as mode) {
      <div class="overlay" (click)="closeGroupBuilder()">
        <div class="panel" (click)="$event.stopPropagation()">
          <header class="p-head">
            <span class="p-title">{{ mode === 'create' ? 'New group' : 'Add people' }}</span>
            <button class="icon-btn" (click)="closeGroupBuilder()">✕</button>
          </header>
          <div class="p-body">
            @if (mode === 'create') {
              <div class="pad">
                <input class="input wide" placeholder="Group name" [(ngModel)]="groupTitle" name="groupTitle" />
              </div>
            }
            @for (u of directory(); track u.id) {
              <button class="dir-row" (click)="togglePick(u)">
                <span class="pick" [class.on]="picked().includes(u.id)">{{ picked().includes(u.id) ? '☑' : '☐' }}</span>
                <span class="dot" [class]="u.presence"></span>{{ u.displayName }}
              </button>
            }
            @if (!directory().length) { <p class="muted pad">Nobody else to add.</p> }
          </div>
          <footer class="p-foot">
            <span class="muted sm">{{ picked().length }} selected</span>
            <button class="btn primary sm" [disabled]="!picked().length || (mode === 'create' && !groupTitle.trim())"
                    (click)="submitGroup()">{{ mode === 'create' ? 'Create group' : 'Add' }}</button>
          </footer>
        </div>
      </div>
    }

    @if (forwardTarget(); as fm) {
      <div class="overlay" (click)="forwardTarget.set(null)">
        <div class="panel" (click)="$event.stopPropagation()">
          <header class="p-head"><span class="p-title">Forward to…</span>
            <button class="icon-btn" (click)="forwardTarget.set(null)">✕</button></header>
          <div class="p-body">
            @for (c of threads(); track c.id) {
              <button class="dir-row" (click)="forwardTo(c)">
                <span class="dot" [class]="presenceOf(c)"></span>{{ c.partnerName }}
              </button>
            }
            @if (!threads().length) { <p class="muted pad">No other conversations to forward to.</p> }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .chat { display: grid; grid-template-columns: 300px 1fr; gap: 1rem; height: calc(100vh - 120px); padding: 1.5rem; }
    .side { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); overflow: hidden; }
    .side-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .75rem 1rem; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .side-head h1 { margin: 0; font-size: 1.1rem; }
    .vis-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 99px; overflow: hidden; }
    .vis-btn { border: none; background: var(--bg); color: var(--muted); padding: .3rem .6rem; font-size: .75rem; cursor: pointer; }
    .vis-btn.active { background: var(--brand); color: var(--brand-text); }
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
    .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--faint); }
    .dot.online { background: #2ecc71; } .dot.idle { background: #f1c40f; } .dot.offline { background: var(--faint); }
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
    .att-img { max-width: 100%; max-height: 220px; border-radius: 8px; cursor: pointer; display: block; }
    .att-audio { max-width: 100%; }
    .att-video { max-width: 100%; max-height: 260px; border-radius: 8px; display: block; }
    .pstate.link { background: none; border: none; color: var(--brand); cursor: pointer; padding: 0; font-size: .78rem; }
    .members { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; padding: .5rem 1rem;
               border-bottom: 1px solid var(--border); background: var(--bg); }
    .member { display: inline-flex; align-items: center; gap: .3rem; font-size: .8rem;
              background: var(--surface); border: 1px solid var(--border); border-radius: 99px; padding: .15rem .5rem; }
    .tag { font-size: .66rem; color: var(--muted); font-style: normal; }
    .sender { font-size: .74rem; font-weight: 600; opacity: .8; }
    .system-row { display: flex; justify-content: center; }
    .system { font-size: .74rem; color: var(--muted); background: var(--surface); border: 1px solid var(--border);
              border-radius: 99px; padding: .1rem .6rem; }
    .call-breakdown { display: flex; flex-direction: column; font-size: .74rem; opacity: .85; }
    .pick { width: 1rem; }
    .input.wide { width: 100%; box-sizing: border-box; }
    .p-foot { display: flex; align-items: center; justify-content: space-between; gap: .5rem;
              padding: .6rem 1rem; border-top: 1px solid var(--border); }
    .call-bubble { background: var(--bg); border-style: dashed; color: var(--text); }
    .call-bubble.mine { background: var(--bg); color: var(--text); border-color: var(--border); }
    .call-line { font-size: .84rem; }
    .fwd-tag { font-size: .72rem; opacity: .75; font-style: italic; }
    .msg-tools { display: flex; gap: .3rem; }
    .mini-btn { background: none; border: none; cursor: pointer; font-size: .78rem; opacity: .7; padding: 0 .15rem; color: inherit; }
    .mini-btn:hover { opacity: 1; }
    .icon-btn.recording { background: var(--danger); color: var(--on-accent); }
    .time { font-size: .68rem; opacity: .7; align-self: flex-end; }
    .rcpt { margin-left: .25rem; }
    .deleted { opacity: .7; }
    .closed, .accept-bar { padding: .75rem 1rem; border-top: 1px solid var(--border); display: flex; align-items: center; gap: .5rem; color: var(--muted); }
    .typing { padding: .2rem .3rem; color: var(--muted); font-size: .78rem; font-style: italic; }
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
    .btn.danger { background: transparent; color: var(--danger); border-color: color-mix(in srgb, var(--danger-border) 40%, transparent); }
    .btn:disabled { opacity: .5; cursor: default; }
    .icon-btn { background: var(--bg); border: 1px solid var(--border); border-radius: 7px; width: 34px; height: 34px; cursor: pointer; }
    .placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--muted); }
    .muted { color: var(--muted); } .muted.sm { font-size: .82rem; } .pad { padding: 1rem; }
    .toast { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-border); border-radius: 8px; padding: .6rem 1rem; z-index: 50; }
    .toast.info { background: var(--success-soft); color: var(--success); border-color: var(--success-border); }
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
export class MessagesComponent implements AfterViewChecked, OnDestroy {
  chat = inject(ChatService);
  calls = inject(CallService);
  private auth = inject(AuthService);
  private usersApi = inject(UsersService);
  @ViewChild('thread') threadEl?: ElementRef<HTMLElement>;

  conversations = signal<Conversation[]>([]);
  activeId = signal<string | null>(null);
  messages = signal<Message[]>([]);
  directory = signal<DirectoryUser[]>([]);
  directoryOpen = signal(false);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);
  draft = '';
  /** When the last "typing" ping went out, so keystrokes don't flood the hub. */
  private lastTypingPing = 0;
  file = signal<File | null>(null);
  visibility = signal<ChatVisibility>('everyone');
  mediaUrls = signal<Record<string, string>>({});
  recording = signal(false);
  forwardTarget = signal<Message | null>(null);
  membersOpen = signal(false);
  /** null = closed; 'create' = new group; 'add' = add people to the open group. */
  groupMode = signal<'create' | 'add' | null>(null);
  picked = signal<string[]>([]);
  groupTitle = '';

  readonly duration = formatDuration;

  private shouldScroll = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  readonly myId = computed(() => this.auth.user()?.id ?? '');
  readonly active = computed(() => this.conversations().find(c => c.id === this.activeId()) ?? null);
  readonly requests = computed(() => this.conversations().filter(c => c.status === 'pending' && !c.isInitiator));
  readonly threads = computed(() => this.conversations().filter(c => !(c.status === 'pending' && !c.isInitiator)));

  constructor() {
    this.chat.connect();
    this.usersApi.me().subscribe({ next: u => this.visibility.set(u.chatVisibility), error: () => {} });
    // Refresh the list whenever the server signals a change (also runs once on init).
    effect(() => { this.chat.conversationsDirty(); this.loadConversations(); });
    // Append a pushed message to the open thread.
    effect(() => { const m = this.chat.incoming(); if (m) this.onIncoming(m); });
  }

  ngOnDestroy(): void {
    for (const url of Object.values(this.mediaUrls())) URL.revokeObjectURL(url);
    this.mediaRecorder?.stream?.getTracks().forEach(t => t.stop());
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

  /**
   * Starts a call in this conversation — the other person for a 1:1 thread, everyone for a group. Group
   * calls opt into the per-person summary being posted back into the thread when the call ends.
   */
  startCall(c: Conversation, media: CallMedia = 'audio'): void {
    this.calls.start(c.id, c.partnerName, media, c.isGroup);
  }

  isOwner(c: Conversation): boolean {
    return !!c.participants?.some(m => m.id === this.myId() && m.isOwner);
  }

  // ---- Groups ----

  openGroupBuilder(): void {
    this.groupTitle = '';
    this.picked.set([]);
    this.groupMode.set('create');
    this.loadDirectory();
  }

  openAddMembers(c: Conversation): void {
    this.picked.set([]);
    this.groupMode.set('add');
    // Offer everyone who isn't already in the group.
    this.loadDirectory(new Set((c.participants ?? []).map(m => m.id)));
  }

  closeGroupBuilder(): void {
    this.groupMode.set(null);
    this.picked.set([]);
  }

  togglePick(u: DirectoryUser): void {
    this.picked.update(list => list.includes(u.id) ? list.filter(id => id !== u.id) : [...list, u.id]);
  }

  submitGroup(): void {
    const mode = this.groupMode();
    const members = this.picked();
    if (!mode || !members.length) return;

    if (mode === 'create') {
      const title = this.groupTitle.trim();
      if (!title) return;
      this.chat.createGroup(title, members).subscribe({
        next: c => { this.closeGroupBuilder(); this.loadConversations(); this.activeId.set(c.id); this.messages.set([]); },
        error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not create the group.'),
      });
      return;
    }

    const active = this.active();
    if (!active) return;
    this.chat.addMembers(active.id, members).subscribe({
      next: () => { this.closeGroupBuilder(); this.loadConversations(); },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not add them.'),
    });
  }

  removeMember(c: Conversation, m: ConversationMember): void {
    if (!confirm(`Remove ${m.displayName} from ${c.partnerName}?`)) return;
    this.chat.removeMember(c.id, m.id).subscribe({
      next: () => this.loadConversations(),
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not remove them.'),
    });
  }

  leaveGroup(c: Conversation): void {
    if (!confirm(`Leave ${c.partnerName}?`)) return;
    this.chat.removeMember(c.id, this.myId()).subscribe({
      next: () => { this.activeId.set(null); this.messages.set([]); this.loadConversations(); },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not leave the group.'),
    });
  }

  renameGroup(c: Conversation): void {
    const title = prompt('Group name', c.partnerName)?.trim();
    if (!title || title === c.partnerName) return;
    this.chat.renameGroup(c.id, title).subscribe({
      next: () => this.loadConversations(),
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not rename the group.'),
    });
  }

  private loadDirectory(exclude?: Set<string>): void {
    this.chat.directory().subscribe({
      next: d => this.directory.set(exclude ? d.filter(u => !exclude.has(u.id)) : d),
      error: () => this.error.set('Could not load the directory.'),
    });
  }

  /**
   * A call row reads from each side's point of view: the same missed call is "No answer" for the
   * caller and "Missed audio call" for the person who didn't pick up.
   */
  callIcon(c: CallSummary): string {
    if (c.outcome !== 'completed') return '📵';
    return c.media === 'video' ? '📹' : '📞';
  }

  callText(m: Message, c: CallSummary): string {
    const outgoing = this.isMine(m);
    const kind = c.media === 'video' ? 'Video' : 'Audio';
    switch (c.outcome) {
      case 'completed': return `${kind} call · ${formatDuration(c.durationSeconds)}`;
      case 'declined': return outgoing ? 'Call declined' : 'You declined the call';
      case 'failed': return 'Call failed to connect';
      default: return outgoing ? 'No answer' : `Missed ${kind.toLowerCase()} call`;
    }
  }

  private loadConversations(): void {
    this.chat.conversations().subscribe({
      next: cs => this.conversations.set(cs),
      error: () => this.error.set('Could not load conversations.'),
    });
  }

  openConversation(c: Conversation): void {
    this.activeId.set(c.id);
    this.chat.messages(c.id).subscribe({
      next: ms => { this.messages.set(ms); this.shouldScroll = true; this.ensureMediaUrls(ms); },
      error: () => this.error.set('Could not load this conversation.'),
    });
    if (c.unreadCount) this.chat.markRead(c.id).subscribe({ next: () => this.loadConversations(), error: () => {} });
  }

  private onIncoming(m: Message): void {
    if (m.conversationId === this.activeId()) {
      this.messages.update(list => list.some(x => x.id === m.id) ? list : [...list, m]);
      this.shouldScroll = true;
      this.ensureMediaUrls([m]);
      if (!this.isMine(m)) this.chat.markRead(m.conversationId).subscribe({ next: () => {}, error: () => {} });
    }
  }

  /**
   * "X is typing…" for the open conversation. Names come from the conversation itself — a group knows
   * its members, a 1:1 has exactly one partner — so an id we can't name is simply left out rather than
   * shown raw.
   */
  typingLabel(): string | null {
    const conversation = this.active();
    if (!conversation) return null;

    const typing = this.chat.typingUserIds(conversation.id);
    if (typing.length === 0) return null;

    const names = typing
      .map(id => conversation.isGroup
        ? conversation.participants?.find(m => m.id === id)?.displayName
        : conversation.partnerName)
      .filter((name): name is string => !!name);

    if (names.length === 0) return 'Someone is typing…';
    if (names.length === 1) return `${names[0]} is typing…`;
    return `${names.length} people are typing…`;
  }

  /**
   * Pings the hub while the user writes. Throttled: one notice every few seconds is enough to keep the
   * indicator alive, and the receiver expires it on its own if the pings stop.
   */
  onDraftChanged(): void {
    const id = this.activeId();
    if (!id) return;

    if (!this.draft.trim()) {
      this.chat.notifyTyping(id, false);
      this.lastTypingPing = 0;
      return;
    }

    const now = Date.now();
    if (now - this.lastTypingPing < 3000) return;
    this.lastTypingPing = now;
    this.chat.notifyTyping(id, true);
  }

  sendMessage(): void {
    const id = this.activeId();
    const text = this.draft.trim();
    if (!id || (!text && !this.file())) return;
    this.chat.send(id, text, this.file()).subscribe({
      next: m => {
        this.draft = ''; this.file.set(null);
        // Sending ends the sentence: stop the other side's dot straight away.
        this.chat.notifyTyping(id, false);
        this.lastTypingPing = 0;
        this.messages.update(list => list.some(x => x.id === m.id) ? list : [...list, m]);
        this.shouldScroll = true;
        this.ensureMediaUrls([m]);
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
    this.loadDirectory();
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

  setVisibility(v: ChatVisibility): void {
    if (this.visibility() === v) return;
    this.usersApi.updateChatVisibility(v).subscribe({
      next: () => this.visibility.set(v),
      error: () => this.error.set('Could not update your visibility.'),
    });
  }

  isImage(a: Attachment): boolean { return a.contentType.startsWith('image/'); }
  isAudio(a: Attachment): boolean { return a.contentType.startsWith('audio/'); }
  isVideo(a: Attachment): boolean { return a.contentType.startsWith('video/'); }

  mediaUrl(m: Message): string | null {
    return m.attachment ? this.mediaUrls()[m.id] ?? null : null;
  }

  private ensureMediaUrls(list: Message[]): void {
    for (const m of list) {
      if (!m.attachment || m.deleted || this.mediaUrls()[m.id]) continue;
      if (!this.isImage(m.attachment) && !this.isAudio(m.attachment) && !this.isVideo(m.attachment)) continue;
      this.chat.downloadAttachment(m.id).subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          this.mediaUrls.update(map => ({ ...map, [m.id]: url }));
        },
        error: () => {},
      });
    }
  }

  async toggleVoice(): Promise<void> {
    if (this.recording()) { this.mediaRecorder?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      this.recordedChunks = [];
      recorder.ondataavailable = e => { if (e.data.size) this.recordedChunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(this.recordedChunks, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        this.recording.set(false);
        this.sendVoice(file);
      };
      this.mediaRecorder = recorder;
      recorder.start();
      this.recording.set(true);
    } catch {
      this.error.set('Microphone access was denied or is unavailable.');
    }
  }

  private sendVoice(file: File): void {
    const id = this.activeId();
    if (!id) return;
    this.chat.send(id, '', file).subscribe({
      next: m => {
        this.messages.update(list => list.some(x => x.id === m.id) ? list : [...list, m]);
        this.shouldScroll = true;
        this.ensureMediaUrls([m]);
      },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not send the voice message.'),
    });
  }

  openForward(m: Message): void { this.forwardTarget.set(m); }

  forwardTo(c: Conversation): void {
    const m = this.forwardTarget();
    if (!m) return;
    this.forwardTarget.set(null);
    this.chat.forward(m.id, c.id).subscribe({
      next: () => { if (c.id === this.activeId()) this.openConversation(c); },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not forward the message.'),
    });
  }

  shareAttachment(m: Message): void {
    this.chat.createShareLink(m.id).subscribe({
      next: link => {
        const url = this.chat.shareLinkUrl(link.token);
        navigator.clipboard?.writeText(url).catch(() => {});
        this.notice.set('Share link copied — expires ' + new Date(link.expiresAt).toLocaleDateString());
        setTimeout(() => this.notice.set(null), 4000);
      },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'Could not create a share link.'),
    });
  }
}
