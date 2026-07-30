/**
 * Public, non-secret app config served by the identity provider at GET /api/config. Centralised in
 * the IdP's database so every *.keshavsingh.in app reads one source instead of duplicating these in
 * its own build. Mirrors the backend PublicConfigView. Never carries secrets or security settings.
 */
export interface PublicConfig {
  siteTitle: string;
  blogUrl: string;
  blogAdminUrl: string;
  updatedAt: string;
}
