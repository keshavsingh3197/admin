export const environment = {
  production: true,
  // IMPORTANT: the IdP API MUST be served from a keshavsingh.in subdomain so it can set the
  // SSO cookie on ".keshavsingh.in". A server on onrender.com cannot set a keshavsingh.in cookie.
  // Point id.keshavsingh.in at the admin Render service (custom domain) — see Phase 6 / README.
  apiUrl: 'https://id.keshavsingh.in/api',
  // Launcher targets.
  blogUrl: 'https://git.keshavsingh.in',
  blogAdminUrl: 'https://git.keshavsingh.in/admin',
};
