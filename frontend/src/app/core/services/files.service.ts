import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserFile } from '../models/file.models';

@Injectable({ providedIn: 'root' })
export class FilesService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(): Observable<UserFile[]> {
    return this.http.get<UserFile[]>(`${this.baseUrl}/files`);
  }

  /** Emits progress events (reportProgress) so the UI can show a per-file percentage. */
  upload(file: File): Observable<HttpEvent<UserFile>> {
    const form = new FormData();
    form.append('file', file);
    const req = new HttpRequest('POST', `${this.baseUrl}/files`, form, { reportProgress: true });
    return this.http.request<UserFile>(req);
  }

  /** Fetches the raw bytes as an authenticated blob (the bearer token is added by the interceptor). */
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/files/${id}/download`, { responseType: 'blob' });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/files/${id}`);
  }
}
