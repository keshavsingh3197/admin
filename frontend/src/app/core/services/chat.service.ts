import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { AdminBlock, AdminConversation, Conversation, DirectoryUser, Message, PresenceState } from '../models/chat.models';

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

  async connect(): Promise<void> {
    if (this.connection) return;
    const conn = new HubConnectionBuilder()
      .withUrl(this.hubUrl, { accessTokenFactory: () => this.auth.token() ?? '' })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    conn.on('MessageReceived', (m: Message) => this.incoming.set(m));
    conn.on('ConversationUpdated', () => this.conversationsDirty.update(v => v + 1));
    conn.on('PresenceChanged', (userId: string, state: PresenceState) =>
      this.presence.update(p => ({ ...p, [userId]: state })));
    conn.onreconnected(() => this.connected.set(true));
    conn.onclose(() => this.connected.set(false));

    this.connection = conn;
    try {
      await conn.start();
      this.connected.set(true);
      this.heartbeat = setInterval(
        () => { if (conn.state === HubConnectionState.Connected) conn.send('Heartbeat').catch(() => {}); }, 45000);
    } catch {
      this.connected.set(false);
    }
  }

  async disconnect(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    await this.connection?.stop().catch(() => {});
    this.connection = null;
    this.connected.set(false);
  }

  // ---- REST ----
  directory(): Observable<DirectoryUser[]> { return this.http.get<DirectoryUser[]>(`${this.base}/chat/directory`); }
  conversations(): Observable<Conversation[]> { return this.http.get<Conversation[]>(`${this.base}/chat/conversations`); }

  start(recipientUserId: string, body?: string): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.base}/chat/conversations`, { recipientUserId, body: body ?? null });
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

  // ---- Admin moderation ----
  adminConversations(flaggedOnly = false): Observable<AdminConversation[]> {
    return this.http.get<AdminConversation[]>(`${this.base}/chat/admin/conversations?flaggedOnly=${flaggedOnly}`);
  }
  adminMessages(id: string): Observable<Message[]> { return this.http.get<Message[]>(`${this.base}/chat/admin/conversations/${id}/messages`); }
  adminDeleteMessage(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/chat/admin/messages/${id}`); }
  adminBlocks(): Observable<AdminBlock[]> { return this.http.get<AdminBlock[]>(`${this.base}/chat/admin/blocks`); }
}
