import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserSession } from '../models/session.models';

@Injectable({ providedIn: 'root' })
export class SessionsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  list(): Observable<UserSession[]> {
    return this.http.get<UserSession[]>(`${this.baseUrl}/sessions`);
  }

  revoke(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sessions/${encodeURIComponent(id)}`);
  }
}