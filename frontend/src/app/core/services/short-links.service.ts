import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateShortLinkRequest, ShortLink, UpdateShortLinkRequest } from '../models/short-link.models';

@Injectable({ providedIn: 'root' })
export class ShortLinksService {
  private readonly baseUrl = environment.apiUrl;
  /** The origin the /s/{code} redirect is served from — same host as the API, not the SPA. */
  readonly redirectBase = environment.apiUrl.replace(/\/api\/?$/, '/s');

  constructor(private http: HttpClient) {}

  getAll(): Observable<ShortLink[]> {
    return this.http.get<ShortLink[]>(`${this.baseUrl}/shortlinks`);
  }

  create(req: CreateShortLinkRequest): Observable<ShortLink> {
    return this.http.post<ShortLink>(`${this.baseUrl}/shortlinks`, req);
  }

  update(id: string, req: UpdateShortLinkRequest): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/shortlinks/${id}`, req);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/shortlinks/${id}`);
  }

  /** The full shareable URL for a code, e.g. https://id.keshavsingh.in/s/ab12cd3. */
  shareUrl(code: string): string {
    return `${this.redirectBase}/${code}`;
  }
}
