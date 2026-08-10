import { CustomRoleView } from '../models/rbac.models';

const ALL_WEBSITES_KEY = '*';

/**
 * Custom role keys that grant access to a given app/site — mirrors the server-side scoping in
 * `ApplicationMetricsService` (WebsiteGrants with an exact match or the "all websites" wildcard).
 * Used to drive the read-only "scoped to this app" view reached from the Websites page, without
 * needing a second copy of this list server-side just for filtering.
 */
export function scopedRoleKeys(roles: CustomRoleView[], appKey: string): Set<string> {
  return new Set(
    roles
      .filter(role => role.websiteGrants.some(g => g.websiteKey === appKey || g.websiteKey === ALL_WEBSITES_KEY))
      .map(role => role.key),
  );
}
