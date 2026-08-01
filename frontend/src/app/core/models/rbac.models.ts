// RBAC types: custom roles, groups, permission catalog, effective access, and search results.
// Mirrors the backend /api/rbac/* and /api/search DTOs.

export interface PermissionCatalogItem {
  key: string;
  category: string;
  label: string;
  description: string;
}

export interface WebsiteAccessOption {
  key: string;
  name: string;
}

export interface PermissionCatalogResponse {
  permissions: PermissionCatalogItem[];
  websites: WebsiteAccessOption[];
}

export interface CustomRoleView {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  permissions: string[];
  websiteAccess: string[];
  isSystem: boolean;
  updatedAt: string;
}

export interface UpsertCustomRoleRequest {
  key: string;
  name: string;
  description?: string | null;
  permissions: string[];
  websiteAccess: string[];
}

export interface GroupView {
  id: string;
  name: string;
  description?: string | null;
  roleKeys: string[];
  memberUserIds: string[];
  updatedAt: string;
}

export interface UpsertGroupRequest {
  name: string;
  description?: string | null;
  roleKeys: string[];
}

export interface EffectiveAccess {
  permissions: string[];
  websiteAccess: string[];
  hasFullWebsiteAccess: boolean;
  roleKeys: string[];
}

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  route: string;
}

export interface SearchResponse {
  results: SearchResult[];
}
