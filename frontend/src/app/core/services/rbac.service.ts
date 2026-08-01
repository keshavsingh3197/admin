import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CustomRoleView,
  EffectiveAccess,
  GroupView,
  PermissionCatalogResponse,
  SearchResponse,
  UpsertCustomRoleRequest,
  UpsertGroupRequest,
} from '../models/rbac.models';

/** Client for roles, groups, permission-catalog and global search (/api/rbac/*, /api/search). */
@Injectable({ providedIn: 'root' })
export class RbacService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  me(): Observable<EffectiveAccess> {
    return this.http.get<EffectiveAccess>(`${this.base}/rbac/permissions/me`);
  }

  catalog(): Observable<PermissionCatalogResponse> {
    return this.http.get<PermissionCatalogResponse>(`${this.base}/rbac/permissions/catalog`);
  }

  listRoles(): Observable<CustomRoleView[]> {
    return this.http.get<CustomRoleView[]>(`${this.base}/rbac/roles`);
  }

  createRole(req: UpsertCustomRoleRequest): Observable<CustomRoleView> {
    return this.http.post<CustomRoleView>(`${this.base}/rbac/roles`, req);
  }

  updateRole(id: string, req: UpsertCustomRoleRequest): Observable<CustomRoleView> {
    return this.http.put<CustomRoleView>(`${this.base}/rbac/roles/${id}`, req);
  }

  deleteRole(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/rbac/roles/${id}`);
  }

  listGroups(): Observable<GroupView[]> {
    return this.http.get<GroupView[]>(`${this.base}/rbac/groups`);
  }

  createGroup(req: UpsertGroupRequest): Observable<GroupView> {
    return this.http.post<GroupView>(`${this.base}/rbac/groups`, req);
  }

  updateGroup(id: string, req: UpsertGroupRequest): Observable<GroupView> {
    return this.http.put<GroupView>(`${this.base}/rbac/groups/${id}`, req);
  }

  deleteGroup(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/rbac/groups/${id}`);
  }

  addMember(groupId: string, userId: string): Observable<GroupView> {
    return this.http.post<GroupView>(`${this.base}/rbac/groups/${groupId}/members`, { userId });
  }

  removeMember(groupId: string, userId: string): Observable<GroupView> {
    return this.http.delete<GroupView>(`${this.base}/rbac/groups/${groupId}/members/${userId}`);
  }

  search(q: string): Observable<SearchResponse> {
    return this.http.get<SearchResponse>(`${this.base}/search`, { params: { q } });
  }
}
