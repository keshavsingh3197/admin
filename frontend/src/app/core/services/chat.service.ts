import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { AdminBlock, AdminConversation, Conversation, DirectoryUser, Message, PresenceState, ShareLink } from '../models/chat.models';
import { CallEnded, CallHubEvent, CallMedia, CallRoom, CallSignalKind, IncomingCall } from '../models/call.models';
import { MeetingReminder } from '../models/meeting.models';

/**
 * Owns the single SignalR chat connection (presence + live message push) and the REST calls for
 * conversations/messages. The hub sits at {origin}/hubs/chat; the JWT is supplied via
 * accessTokenFactory (SignalR forwards it as the access_token query param on WebSockets).
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly base = environment.apiUrl;
  private readonly hubUrl = environment.apiUrl.replace(/\/api\/?$/, '') + '/hubs/chat';

  private connection: HubConnection | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  /** Last message pushed from the hub (component appends it to the open thread). */
  readonly incoming = signal<Message | null>(null);
  /** Bumped whenever a conversation changes server-side, so the list refreshes. */
  readonly conversationsDirty = signal(0);
  /** Live presence overrides, keyed by user id. */
  readonly presence = signal<Record<string, PresenceState>>({});
  readonly connected = signal(false);

  /**
   * Call events (ring / state change / WebRTC signal) as a stream rather than a signal: ICE candidates
   * arrive in bursts and a signal would only keep the last one per change-detection pass.
   * CallService is the only consumer.
   */
  private readonly callEvents = new Subject<CallHubEvent>();
  readonly calls$ = this.callEvents.asObservable();

  /** Last "your meeting starts soon" push, and a counter the agenda watches for changes. */
  readonly meetingReminder = signal<MeetingReminder | null>(null);
  readonly meetingsDirty = signal(0);

  /**
   * Who is typing, as `${conversationId}:${userId}` keys mapped to when we heard it. A timestamp rather
   * than a flag so the indicator expires on its own: the "stopped" event is the one most likely to be
   * lost (closed tab, dropped socket), and a dot that never stops is worse than no dot at all.
   */
  private readonly typingAt = signal<Record<string, number>>({});

  /** Ticks while anyone is typing, so the UI re-evaluates as entries age out. */
  private typingSweep: ReturnType<typeof setInterval> | null = null;

  /** How long a typing notice counts for without a fresh one. */
  private static readonly TypingTtlMs = 6000;

  async connect(): Promise<void> {
    if (this.connection) return;
    const conn = new HubConnectionBuilder()
      .withUrl(this.hubUrl, { accessTokenFactory: () => this.auth.token() ?? '' })
      // Bounded, not the default's "retry every 30s forever": an expired in-memory access token
      // (see AuthService) can never succeed on its own, so retrying indefinitely just spams the
      // console/network with 401s until the tab is closed. onclose() below cleans up so a real
      // reconnect (e.g. after logging back in) starts fresh instead of silently no-op'ing.
      .withAutomaticReconnect([0, 2000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    conn.on('MessageReceived', (m: Message) => this.incoming.set(m));
    conn.on('ConversationUpdated', () => this.conversationsDirty.update(v => v + 1));
    conn.on('PresenceChanged', (userId: string, state: PresenceState) =>
      this.presence.update(p => ({ ...p, [userId]: state })));
    conn.on('CallIncoming', (call: IncomingCall) => this.callEvents.next({ type: 'incoming', call }));
    conn.on('RoomState', (room: CallRoom) => this.callEvents.next({ type: 'roster', room }));
    conn.on('ParticipantJoined', (roomId: string, userId: string) =>
      this.callEvents.next({ type: 'joined', roomId, userId }));
    conn.on('ParticipantLeft', (roomId: string, userId: string) =>
      this.callEvents.next({ type: 'left', roomId, userId }));
    conn.on('RoomEnded', (ended: CallEnded) => this.callEvents.next({ type: 'ended', ended }));
    conn.on('CallMediaChanged', (e: { roomId: string; media: CallMedia }) =>
      this.callEvents.next({ type: 'media', roomId: e.roomId, media: e.media }));
    conn.on('CallSignal', (roomId: string, fromUserId: string, kind: CallSignalKind, payload: string) =>
      this.callEvents.next({ type: 'signal', roomId, fromUserId, kind, payload }));
    conn.on('MeetingReminder', (reminder: MeetingReminder) => this.meetingReminder.set(reminder));
    conn.on('MeetingUpdated', () => this.meetingsDirty.update(v => v + 1));
    conn.on('TypingChanged', (conversationId: string, userId: string, isTyping: boolean) =>
      this.setTyping(conversationId, userId, isTyping));
    conn.onreconnected(() => this.connected.set(true));
    // Reconnect attempts are exhausted (or the token was rejected outright) — drop the dead
    // connection so a future connect() (a fresh login) actually opens a new one instead of
    // early-returning on a defunct handle.
    conn.onclose(() => {
      this.connected.set(false);
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.connection = null;
    });

    this.connection = conn;
    try {
      await conn.start();
      this.connected.set(true);
      this.heartbeat = setInterval(
        () => { if (conn.state === HubConnectionState.Connected) conn.send('Heartbeat').catch(() => {}); }, 45000);
    } catch {
      this.connected.set(false);
      this.connection = null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.typingSweep) clearInterval(this.typingSweep);
    this.typingSweep = null;
    this.typingAt.set({});
    await this.connection?.stop().catch(() => {});
    this.connection = null;
    this.connected.set(false);
  }

  // ---- Typing ----

  /**
   * Tells the other side this user is writing. Safe to call on every keystroke — the caller throttles,
   * and the hub only forwards it to people actually in the conversation.
   */
  notifyTyping(conversationId: string, isTyping: boolean): void {
    if (this.connection?.state !== HubConnectionState.Connected) return;
    this.connection.send('Typing', conversationId, isTyping).catch(() => {});
  }

  /** Who is currently typing in a conversation, ignoring notices that have aged out. */
  typingUserIds(conversationId: string): string[] {
    const now = Date.now();
    return Object.entries(this.typingAt())
      .filter(([key, at]) => key.startsWith(`${conversationId}:`) && now - at < ChatService.TypingTtlMs)
      .map(([key]) => key.slice(conversationId.length + 1));
  }

  private setTyping(conversationId: string, userId: string, isTyping: boolean): void {
    const key = `${conversationId}:${userId}`;
    this.typingAt.update(current => {
      const next = { ...current };
      if (isTyping) next[key] = Date.now();
      else delete next[key];
      return next;
    });

    // A sweep keeps the signal changing while entries expire, so a stale dot disappears even if the
    // "stopped" event never arrives.
    if (isTyping && !this.typingSweep) {
      this.typingSweep = setInterval(() => {
        const now = Date.now();
        this.typingAt.update(current => {
          const next = Object.fromEntries(
            Object.entries(current).filter(([, at]) => now - at < ChatService.TypingTtlMs));
          return Object.keys(next).length === Object.keys(current).length ? current : next;
        });
        if (Object.keys(this.typingAt()).length === 0 && this.typingSweep) {
          clearInterval(this.typingSweep);
          this.typingSweep = null;
        }
      }, 2000);
    }
  }

  // ---- REST ----
  directory(): Observable<DirectoryUser[]> { return this.http.get<DirectoryUser[]>(`${this.base}/chat/directory`); }
  conversations(): Observable<Conversation[]> { return this.http.get<Conversation[]>(`${this.base}/chat/conversations`); }

  start(recipientUserId: string, body?: string): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.base}/chat/conversations`, { recipientUserId, body: body ?? null });
  }

  // ---- Groups ----
  createGroup(title: string, memberIds: string[]): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.base}/chat/groups`, { title, memberIds });
  }

  addMembers(id: string, memberIds: string[]): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.base}/chat/groups/${id}/members`, { memberIds });
  }

  /** Removes a member (owner only), or yourself — which is how you leave a group. */
  removeMember(id: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/chat/groups/${id}/members/${memberId}`);
  }

  renameGroup(id: string, title: string): Observable<void> {
    return this.http.post<void>(`${this.base}/chat/groups/${id}/rename`, { title });
  }

  messages(id: string, before?: string): Observable<Message[]> {
    const q = before ? `?before=${encodeURIComponent(before)}` : '';
    return this.http.get<Message[]>(`${this.base}/chat/conversations/${id}/messages${q}`);
  }

  send(id: string, body: string, file: File | null): Observable<Message> {
    const form = new FormData();
    if (body) form.append('body', body);
    if (file) form.append('file', file);
    return this.http.post<Message>(`${this.base}/chat/conversations/${id}/messages`, form);
  }

  accept(id: string): Observable<void> { return this.http.post<void>(`${this.base}/chat/conversations/${id}/accept`, {}); }
  decline(id: string): Observable<void> { return this.http.post<void>(`${this.base}/chat/conversations/${id}/decline`, {}); }
  block(id: string): Observable<void> { return this.http.post<void>(`${this.base}/chat/conversations/${id}/block`, {}); }
  reportSpam(id: string): Observable<void> { return this.http.post<void>(`${this.base}/chat/conversations/${id}/report-spam`, {}); }
  markRead(id: string): Observable<void> { return this.http.post<void>(`${this.base}/chat/conversations/${id}/read`, {}); }

  downloadAttachment(messageId: string): Observable<Blob> {
    return this.http.get(`${this.base}/chat/attachments/${messageId}`, { responseType: 'blob' });
  }

  forward(messageId: string, targetConversationId: string): Observable<Message> {
    return this.http.post<Message>(`${this.base}/chat/messages/${messageId}/forward`, { targetConversationId });
  }

  createShareLink(messageId: string): Observable<ShareLink> {
    return this.http.post<ShareLink>(`${this.base}/chat/messages/${messageId}/share-link`, {});
  }

  /** Public URL for a share link token — no auth needed, safe to copy/share outside the app. */
  shareLinkUrl(token: string): string {
    return `${this.base}/chat/share/${token}`;
  }

  // ---- Admin moderation ----
  adminConversations(flaggedOnly = false): Observable<AdminConversation[]> {
    return this.http.get<AdminConversation[]>(`${this.base}/chat/admin/conversations?flaggedOnly=${flaggedOnly}`);
  }
  adminMessages(id: string): Observable<Message[]> { return this.http.get<Message[]>(`${this.base}/chat/admin/conversations/${id}/messages`); }
  adminDeleteMessage(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/chat/admin/messages/${id}`); }
  adminBlocks(): Observable<AdminBlock[]> { return this.http.get<AdminBlock[]>(`${this.base}/chat/admin/blocks`); }
}
