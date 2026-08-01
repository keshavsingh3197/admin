import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BrowseView, FolderDto, FolderShareDto, ShareRequest, UserFile } from '../models/file.models';

@Injectable({ providedIn: 'root' })
export class FilesService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ---- Folders / browsing ----
  browse(parentId?: string | null): Observable<BrowseView> {
    const q = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
    return this.http.get<BrowseView>(`${this.baseUrl}/folders/browse${q}`);
  }

  createFolder(name: string, parentId: string | null): Observable<FolderDto> {
    return this.http.post<FolderDto>(`${this.baseUrl}/folders`, { name, parentId });
  }

  renameFolder(id: string, name: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/folders/${id}`, { name });
  }

  deleteFolder(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/folders/${id}`);
  }

  // ---- Sharing ----
  listShares(id: string): Observable<FolderShareDto[]> {
    return this.http.get<FolderShareDto[]>(`${this.baseUrl}/folders/${id}/shares`);
  }

  addShare(id: string, req: ShareRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/folders/${id}/shares`, req);
  }

  removeShare(id: string, subjectType: string, subjectId: string): Observable<void> {
    const q = `?subjectType=${encodeURIComponent(subjectType)}&subjectId=${encodeURIComponent(subjectId)}`;
    return this.http.delete<void>(`${this.baseUrl}/folders/${id}/shares${q}`);
  }

  // ---- Documents ----
  /** Emits progress events (reportProgress) so the UI can show a per-file percentage. */
  upload(file: File, folderId: string | null): Observable<HttpEvent<UserFile>> {
    const form = new FormData();
    form.append('file', file);
    if (folderId) form.append('folderId', folderId);
    const req = new HttpRequest('POST', `${this.baseUrl}/files`, form, { reportProgress: true });
    return this.http.request<UserFile>(req);
  }

  /** Fetches the raw bytes as an authenticated blob (the bearer token is added by the interceptor). */
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/files/${id}/download`, { responseType: 'blob' });
  }

  move(id: string, folderId: string | null): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/files/${id}/move`, { folderId });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/files/${id}`);
  }
}
