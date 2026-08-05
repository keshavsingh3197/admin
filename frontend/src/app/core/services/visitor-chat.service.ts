import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  VisitorChatMessageView, VisitorChatSessionView, VisitorChatStatus, VisitorChatSummary, VisitorChatThread,
} from '../models/visitor-chat.models';

/**
 * The staff side of visitor chat. Reading and answering is open to any signed-in user (it is a shared
 * queue); closing, blocking and deleting are Admin-only server-side.
 */
@Injectable({ providedIn: 'root' })
export class VisitorChatService {
  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/visitor-chat/staff`;

  list(status?: VisitorChatStatus): Observable<VisitorChatSessionView[]> {
    const query = status ? `?status=${status}` : '';
    return this.http.get<VisitorChatSessionView[]>(`${this.baseUrl}${query}`);
  }

  summary(): Observable<VisitorChatSummary> {
    return this.http.get<VisitorChatSummary>(`${this.baseUrl}/summary`);
  }

  /** Opens a conversation — this marks it read, so use poll() for refreshes. */
  open(id: string): Observable<VisitorChatThread> {
    return this.http.get<VisitorChatThread>(`${this.baseUrl}/${id}`);
  }

  poll(id: string, after: string | null): Observable<VisitorChatThread> {
    const query = after ? `?after=${encodeURIComponent(after)}` : '';
    return this.http.get<VisitorChatThread>(`${this.baseUrl}/${id}/poll${query}`);
  }

  reply(id: string, body: string): Observable<VisitorChatMessageView> {
    return this.http.post<VisitorChatMessageView>(`${this.baseUrl}/${id}/reply`, { body });
  }

  typing(id: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${id}/typing`, {});
  }

  setStatus(id: string, status: VisitorChatStatus): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${id}/status`, { status });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
