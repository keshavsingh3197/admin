export const environment = {
  production: false,
  // The IdP API base — the ONE bootstrap value each app keeps locally (it's needed to reach the
  // central config at GET /api/config). Launcher URLs & branding now come from that endpoint.
  // In dev the API is same-host (localhost) so the SSO cookie works across ports.
  apiUrl: 'http://localhost:5000/api',
};
