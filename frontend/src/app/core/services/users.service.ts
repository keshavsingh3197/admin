import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateUserRequest, UpdateUserRequest, UserListItem } from '../models/user.models';
import { ChatVisibility } from '../models/chat.models';
import { Role } from '../models/auth.models';

/** Client for the identity provider's user & role management API (/api/users, /api/roles). */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  me(): Observable<UserListItem> {
    return this.http.get<UserListItem>(`${this.base}/users/me`);
  }

  /** Self-service: display name, username, phone. Roles/active-state stay Admin-only via update(). */
  updateMyProfile(patch: { displayName?: string; username?: string | null; phoneNumber?: string | null }): Observable<UserListItem> {
    return this.http.put<UserListItem>(`${this.base}/users/me`, patch);
  }

  uploadMyAvatar(file: File): Observable<UserListItem> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<UserListItem>(`${this.base}/users/me/avatar`, form);
  }

  removeMyAvatar(): Observable<UserListItem> {
    return this.http.delete<UserListItem>(`${this.base}/users/me/avatar`);
  }

  /** Blob URL source for `<img>` — avatars need an authenticated fetch, not a bare `src`. */
  avatarBlob(userId: string): Observable<Blob> {
    return this.http.get(`${this.base}/users/${userId}/avatar`, { responseType: 'blob' });
  }

  updateChatVisibility(visibility: ChatVisibility): Observable<UserListItem> {
    return this.http.put<UserListItem>(`${this.base}/users/me/chat-visibility`, { visibility });
  }

  list(): Observable<UserListItem[]> {
    return this.http.get<UserListItem[]>(`${this.base}/users`);
  }

  roles(): Observable<Role[]> {
    return this.http.get<Role[]>(`${this.base}/roles`);
  }

  create(req: CreateUserRequest): Observable<UserListItem> {
    return this.http.post<UserListItem>(`${this.base}/users`, req);
  }

  update(id: string, req: UpdateUserRequest): Observable<UserListItem> {
    return this.http.put<UserListItem>(`${this.base}/users/${id}`, req);
  }

  resetPassword(id: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.base}/users/${id}/reset-password`, { newPassword });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/users/${id}`);
  }
}
