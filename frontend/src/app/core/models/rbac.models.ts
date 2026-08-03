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
  adminPermissions: PermissionCatalogItem[];
  siteActions: PermissionCatalogItem[];
  websites: WebsiteAccessOption[];
}

export interface WebsiteGrant {
  websiteKey: string;
  permissions: string[];
}

export interface CustomRoleView {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  websiteGrants: WebsiteGrant[];
  isSystem: boolean;
  updatedAt: string;
}

export interface UpsertCustomRoleRequest {
  key: string;
  name: string;
  description?: string | null;
  websiteGrants: WebsiteGrant[];
}

export interface GroupView {
  id: string;
  name: string;
  description?: string | null;
  roleKeys: string[];
  memberUserIds: string[];
  isFamilyCircle: boolean;
  updatedAt: string;
}

export interface UpsertGroupRequest {
  name: string;
  description?: string | null;
  roleKeys: string[];
  isFamilyCircle: boolean;
}

export interface SiteAccess {
  websiteKey: string;
  permissions: string[];
}

export interface EffectiveAccess {
  adminPermissions: string[];
  siteAccess: SiteAccess[];
  hasWildcardSiteAccess: boolean;
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
