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
