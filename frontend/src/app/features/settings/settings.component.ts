import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, forkJoin } from 'rxjs';
import { SettingsService } from '../../core/services/settings.service';
import { ConfigService } from '../../core/services/config.service';
import { PackageInventoryService } from '../../core/services/package-inventory.service';
import { environment } from '../../../environments/environment';
import { SettingsView, UpsertWebsiteLinkRequest, WebsiteLinkView } from '../../core/models/settings.models';
import { LoadingStateComponent } from '../../shared/loading-state.component';

interface SettingsImportPayload {
  settings?: Partial<SettingsView>;
  websites?: Array<Partial<WebsiteLinkView>>;
}

/**
 * Runtime auth-security settings for the identity provider (Admin only). Changes are stored in the
 * database and read live by the shared auth engine — no redeploy needed.
 */
@Component({
  selector: 'app-settings',
  imports: [FormsModule, RouterLink, LoadingStateComponent],
  template: `
    <div class="set-wrap">
      <div class="head">
        <h1 class="page-title">Settings</h1>
      <button class="icon-btn tooltip" type="button" data-tip="Reload settings"
        aria-label="Reload settings" [class.spin]="loading()" [disabled]="loading() || busy()" (click)="reload()">↻</button>
      <button class="icon-action tooltip" type="button" data-tip="Export config"
        aria-label="Export config" [disabled]="loading() || busy()" (click)="exportConfig()">⤓</button>
      <button class="icon-action tooltip" type="button" data-tip="Import config"
        aria-label="Import config" [disabled]="loading() || busy()" (click)="importInput.click()">⤒</button>
        <input #importInput type="file" accept="application/json" class="hidden-input" (change)="importConfig($event)" />
      </div>
      @if (message()) { <div class="banner" [class.ok]="ok()">{{ message() }}</div> }

      @if (loading()) {
        <app-loading-state mode="list" [count]="5" title="Loading settings…" />
      } @else if (model(); as m) {
        <div class="tabs" role="tablist" aria-label="Settings sections">
          <button type="button" role="tab" class="tab" [class.active]="activeTab() === 'general'"
            [attr.aria-selected]="activeTab() === 'general'" (click)="setTab('general')">General &amp; Security</button>
          <button type="button" role="tab" class="tab" [class.active]="activeTab() === 'storage'"
            [attr.aria-selected]="activeTab() === 'storage'" (click)="setTab('storage')">Storage, Auth &amp; GitHub</button>
          <button type="button" role="tab" class="tab" [class.active]="activeTab() === 'integrations'"
            [attr.aria-selected]="activeTab() === 'integrations'" (click)="setTab('integrations')">
            Third-Party Integrations
            <span class="tab-count">{{ configuredIntegrationCount(m) }}</span>
          </button>
        </div>

        <form class="card" (ngSubmit)="save()">
          @if (activeTab() === 'general') {
            <h2>General</h2>
            <label class="field"><span>Site title</span>
              <input class="input" type="text" name="title" [(ngModel)]="m.siteTitle" /></label>

            <h2>Launcher links</h2>
            <p class="hint">Shared with every keshavsingh.in app via the public config endpoint —
               no need to set these per app. Must be https keshavsingh.in addresses.</p>
            <div class="grid">
              <label class="field"><span>Blog URL</span>
                <input class="input" type="url" name="blog" [(ngModel)]="m.blogUrl" /></label>
              <label class="field"><span>Blog admin URL</span>
                <input class="input" type="url" name="blogadmin" [(ngModel)]="m.blogAdminUrl" /></label>
            </div>

            <h2>Applications</h2>
            <p class="hint">Application registry, access counts, and website content are managed together on the <a routerLink="/website">Websites</a> page.</p>

            <h2>Session lifetime</h2>
            <p class="hint">These values are stored in Mongo and affect newly issued tokens. Existing tokens keep their current expiry.</p>
            <div class="grid">
              <label class="field"><span>Access token lifetime (minutes)</span>
                <input class="input" type="number" min="1" max="240" name="atm" [(ngModel)]="m.accessTokenMinutes" /></label>
              <label class="field"><span>Refresh token lifetime (days)</span>
                <input class="input" type="number" min="1" max="90" name="rtd" [(ngModel)]="m.refreshTokenDays" /></label>
              <label class="field"><span>2FA step token lifetime (minutes)</span>
                <input class="input" type="number" min="1" max="30" name="tft" [(ngModel)]="m.twoFactorTokenMinutes" /></label>
              <label class="field"><span>Refresh token retention (days)</span>
                <input class="input" type="number" min="1" max="365" name="rtr" [(ngModel)]="m.refreshTokenRetentionDays" /></label>
              <label class="field"><span>Analytics retention (days)</span>
                <input class="input" type="number" min="1" max="3650" name="ar" [(ngModel)]="m.analyticsRetentionDays" /></label>
              <label class="field"><span>Login audit log retention (days)</span>
                <input class="input" type="number" min="1" max="3650" name="lar" [(ngModel)]="m.loginAuditRetentionDays" /></label>
              <label class="field"><span>Administrative audit retention (days)</span>
                <input class="input" type="number" min="1" max="3650" name="aar" [(ngModel)]="m.adminAuditRetentionDays" /></label>
            </div>
            <p class="hint">Administrative events (role grants, settings changes, console writes) are kept
              on their own clock, and deliberately far longer than sign-in traffic: they are low-volume and
              are what an incident review actually needs. See the <a routerLink="/audit">Audit log</a>.</p>
            <p class="hint">These retention windows are enforced automatically every 30 minutes. Use <a routerLink="/data-retention">Data retention</a> to clear a specific date range on demand.</p>
            <label class="chk"><input type="checkbox" name="singleSession" [(ngModel)]="m.enforceSingleSessionPerUser" /> Enforce single active session per user (new login closes others)</label>

            <h2>Sign-in security</h2>
            <div class="grid">
              <label class="field"><span>Max failed attempts before lockout</span>
                <input class="input" type="number" min="1" max="20" name="mfa" [(ngModel)]="m.maxFailedLoginAttempts" /></label>
              <label class="field"><span>Lockout duration (minutes)</span>
                <input class="input" type="number" min="1" max="1440" name="lm" [(ngModel)]="m.lockoutMinutes" /></label>
              <label class="field"><span>Email OTP validity (minutes)</span>
                <input class="input" type="number" min="1" max="60" name="eo" [(ngModel)]="m.emailOtpMinutes" /></label>
              <label class="field"><span>Backup codes generated on enrol</span>
                <input class="input" type="number" min="5" max="20" name="bc" [(ngModel)]="m.backupCodeCount" /></label>
            </div>

            <h2>Two-factor fallback</h2>
            <p class="hint">Authenticator (TOTP) 2FA always works. Email/SMS fallback only delivers once real
               email/SMS senders are configured for this service.</p>
            <label class="chk"><input type="checkbox" name="e2fa" [(ngModel)]="m.emailTwoFactorEnabled" /> Allow email code fallback</label>
            <label class="chk"><input type="checkbox" name="s2fa" [(ngModel)]="m.smsTwoFactorEnabled" /> Allow SMS code fallback</label>

            <h2>Passkey sign-in (WebAuthn)</h2>
            <p class="hint">Only exact browser origins listed here can complete a passkey sign-in. Each origin must use HTTPS and belong to the relying-party domain or one of its subdomains. Enter one origin per line. The relying-party ID is <code>{{ m.webAuthnRelyingPartyId }}</code>;
              changing it can make existing passkeys unusable.</p>
            <label class="field"><span>Allowed WebAuthn origins</span>
              <textarea class="input" rows="5" name="webAuthnOrigins" [(ngModel)]="webAuthnOriginsInput"
                placeholder="https://app.example.com"></textarea>
            </label>
            @if (!webAuthnOriginsInput.trim()) {
              <p class="hint warn" role="alert">No passkey origins are configured. Add the exact origin for every app that offers passkey sign-in; an unlisted app's passkey verification will be rejected.</p>
            }
            @if (m.webAuthnOriginsPendingRestart) {
              <p class="hint warn" role="status">Saved WebAuthn origin changes are not active yet. Restart the identity-provider service to apply them.</p>
            }

            <h2>First-run checklist</h2>
            <p class="hint">For a fresh deployment, keep bootstrap secrets in env or Key Vault and manage non-secret runtime settings here after sign-in.</p>
            <ul class="checklist">
              <li>Set the Mongo connection and confirm the database is reachable.</li>
              <li>Provide the JWT signing key and encryption data key outside source control.</li>
              <li>Confirm launcher URLs, token lifetimes, and lockout settings on this screen.</li>
              <li>Configure SMTP or SMS only if you want those fallback channels enabled.</li>
              <li>Verify WebAuthn origins and relying-party domain for passkeys.</li>
            </ul>
          }

          @if (activeTab() === 'storage') {
            <h2>File storage</h2>
            <p class="hint">Where private user files are stored. <strong>Local</strong> keeps them on the server's
               disk (fine for dev; wiped on redeploy of an ephemeral host). <strong>Cloudflare R2</strong>
               stores them in a private, S3-compatible bucket (encrypted at rest). The secret key is stored
               encrypted and is never shown again — leave it blank to keep the current one.</p>
            <div class="grid">
              <label class="field"><span>Provider</span>
                <select class="input" name="storageProvider" [(ngModel)]="m.storageProvider">
                  <option value="Local">Local disk</option>
                  <option value="S3">Cloudflare R2 (S3)</option>
                </select></label>
            </div>
            @if (m.storageProvider === 'S3') {
              <div class="grid">
                <label class="field"><span>Endpoint URL (https://&lt;account-id&gt;.r2.cloudflarestorage.com)</span>
                  <input class="input" type="text" name="s3Url" placeholder="https://….r2.cloudflarestorage.com"
                    [(ngModel)]="m.storageS3ServiceUrl" /></label>
                <label class="field"><span>Bucket name</span>
                  <input class="input" type="text" name="s3Bucket" [(ngModel)]="m.storageS3Bucket" /></label>
                <label class="field"><span>Access Key ID</span>
                  <input class="input" type="text" name="s3KeyId" autocomplete="off"
                    [(ngModel)]="m.storageS3AccessKeyId" /></label>
                <label class="field"><span>Secret Access Key {{ m.storageS3SecretAccessKeySet ? '(already set — leave blank to keep)' : '' }}</span>
                  <input class="input" type="password" name="s3Secret" autocomplete="new-password"
                    placeholder="{{ m.storageS3SecretAccessKeySet ? '••••••••' : 'R2 secret access key' }}"
                    [(ngModel)]="storageS3SecretInput" /></label>
              </div>
            }

            <h2>OAuth &amp; social sign-in</h2>
            <p class="hint">Every OAuth flow — social sign-in and the GitHub connection below — comes back to
               <strong>one</strong> redirect URI. Register exactly this as the authorization callback URL with
               each provider: <code>{{ oauthCallbackUrl() }}</code>. Providers only accept a redirect_uri they
               already know, so reaching this API on a second hostname is what causes
               <em>"The redirect_uri is not associated with this application"</em>. Which site a person returns
               to after signing in is carried in signed state, not registered per app.</p>
            <label class="field"><span>Callback base URL (blank = the host this API was reached on)</span>
              <input class="input" type="url" name="oauthBase" placeholder="https://admin.keshavsingh.in"
                [(ngModel)]="m.oAuthCallbackBaseUrl" /></label>

            <div class="grid">
              <label class="field"><span>GitHub Client ID</span>
                <input class="input" type="text" name="ghClientId" autocomplete="off" [(ngModel)]="m.gitHubOAuthClientId" /></label>
              <label class="field"><span>GitHub Client Secret {{ m.gitHubOAuthClientSecretSet ? '(already set — leave blank to keep)' : '' }}</span>
                <input class="input" type="password" name="ghClientSecret" autocomplete="new-password"
                  placeholder="{{ m.gitHubOAuthClientSecretSet ? '••••••••' : 'Client secret' }}"
                  [(ngModel)]="gitHubOAuthClientSecretInput" /></label>
            </div>
            <label class="chk"><input type="checkbox" name="ghSocial" [(ngModel)]="m.gitHubSocialLoginEnabled" /> Offer "Sign in with GitHub" on the login screen</label>

            <div class="grid">
              <label class="field"><span>LinkedIn Client ID</span>
                <input class="input" type="text" name="liClientId" autocomplete="off" [(ngModel)]="m.linkedInOAuthClientId" /></label>
              <label class="field"><span>LinkedIn Client Secret {{ m.linkedInOAuthClientSecretSet ? '(already set — leave blank to keep)' : '' }}</span>
                <input class="input" type="password" name="liClientSecret" autocomplete="new-password"
                  placeholder="{{ m.linkedInOAuthClientSecretSet ? '••••••••' : 'Client secret' }}"
                  [(ngModel)]="linkedInOAuthClientSecretInput" /></label>
            </div>
            <label class="chk"><input type="checkbox" name="liSocial" [(ngModel)]="m.linkedInSocialLoginEnabled" /> Offer "Sign in with LinkedIn" on the login screen</label>
            <p class="hint">Create the LinkedIn app at
               <a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noopener">linkedin.com/developers/apps</a>
               and request the <code>Sign In with LinkedIn using OpenID Connect</code> product — sign-in needs the
               <code>openid profile email</code> scopes. A provider with no Client ID/Secret stays hidden on the
               login screen even when its checkbox is ticked.</p>
            <p class="hint">Social sign-in never creates an account: it signs in an existing user whose email
               matches the provider's <em>verified</em> address, and always still asks for the second factor.</p>

            <h2>Package inventory (GitHub)</h2>
            <p class="hint">Powers the <a routerLink="/packages">Packages</a> screen: a token with
               <code>read:packages</code> (and <code>repo</code> if any workspace repo is private) lets it
               read manifests and published versions straight from GitHub — works the same in production
               as it does locally, no server-side checkout required.</p>
            <label class="field"><span>GitHub token {{ m.gitHubPackagesTokenSet ? '(already set — leave blank to keep)' : '' }}</span>
              <input class="input" type="password" name="ghToken" autocomplete="new-password"
                placeholder="{{ m.gitHubPackagesTokenSet ? '••••••••' : 'ghp_… / github_pat_…' }}"
                [(ngModel)]="gitHubPackagesTokenInput" /></label>
            <p class="hint">Or connect the GitHub OAuth App configured above instead of pasting a token —
               save first, then Connect.</p>
            <button class="btn-secondary" type="button" [disabled]="!m.gitHubOAuthClientId || connectingGitHub()" (click)="connectGitHub()">
              {{ connectingGitHub() ? 'Connecting…' : 'Connect to GitHub' }}
            </button>

            <h3 class="sub">Repositories to scan</h3>
            <p class="hint">Only the repositories ticked here are scanned — the choice is stored server-side, so
               it is made once and survives restarts. Search to add or remove one at any time.</p>
            @if (selectedRepos().length) {
              <div class="chips">
                @for (repo of selectedRepos(); track repo) {
                  <span class="chip">{{ repo }}<button type="button" aria-label="Remove repository" (click)="toggleRepo(repo)">×</button></span>
                }
              </div>
            } @else {
              <p class="hint warn">No repositories selected — the Packages screen has nothing to scan.</p>
            }
            <div class="repo-search">
              <input class="input" type="search" name="repoQuery" placeholder="Search repositories…"
                [(ngModel)]="repoQuery" (ngModelChange)="searchRepos()" />
              <button class="btn-secondary" type="button" [disabled]="reposLoading()" (click)="searchRepos()">
                {{ reposLoading() ? 'Loading…' : 'Reload' }}
              </button>
            </div>
            @if (repoResults().length) {
              <div class="repo-list">
                @for (repo of repoResults(); track repo) {
                  <label class="chk"><input type="checkbox" [checked]="isRepoSelected(repo)" (change)="toggleRepo(repo)" /> {{ repo }}</label>
                }
              </div>
            } @else if (!reposLoading()) {
              <p class="hint">No repositories to show. Save a GitHub token or connect the OAuth App first, then Reload.</p>
            }
          }

          @if (activeTab() === 'integrations') {
            <div class="security-note">
              <strong>Centralized Vault Architecture (Zero Network Secret Exposure)</strong>
              <p>All shared third-party credentials saved here are encrypted with AES-256-GCM using <code>Encryption:DataKey</code> inside <code>AdminDb</code>. Ecosystem APIs (<code>AnimStudio</code>, <code>Social Analytics</code>, <code>Hindu Panchang</code>, <code>Pratiyogita</code>) read their credentials server-side directly from <code>AdminDb</code> and never expose raw keys over HTTP or <code>/api/config</code>.</p>
            </div>

            <div class="int-section">
              <div class="int-head">
                <div>
                  <h2>YouTube Data API v3</h2>
                  <p class="hint">Shared across Social Analytics (channel discovery &amp; metrics), Hindu Panchang (live devotional video feeds), and AnimStudio (live channel overlays).</p>
                </div>
                <span class="status-pill" [class.ok]="m.youTubeApiKeySet">
                  {{ m.youTubeApiKeySet ? 'Configured (' + (m.youTubeApiKeyMasked || '••••') + ')' : 'Not set' }}
                </span>
              </div>
              <div class="grid">
                <label class="field">
                  <span>API Key (leave blank to keep stored value)</span>
                  <input class="input" type="password" name="ytApiKey" autocomplete="new-password"
                    [placeholder]="m.youTubeApiKeySet ? (m.youTubeApiKeyMasked || '••••••••') : 'AIzaSy…'"
                    [(ngModel)]="youTubeApiKeyInput" />
                </label>
              </div>
              @if (m.youTubeApiKeySet) {
                <label class="chk danger-chk"><input type="checkbox" name="clearYtKey" [(ngModel)]="clearYouTubeApiKey" /> Remove stored YouTube API Key on save</label>
              }
            </div>

            <div class="int-section">
              <div class="int-head">
                <div>
                  <h2>Google / YouTube OAuth App</h2>
                  <p class="hint">Shared Client ID &amp; Secret used by AnimStudio (video publishing &amp; Drive handoff) and Social Analytics (creator analytics opt-in). Per-app callback Redirect URIs remain configured in each app.</p>
                </div>
                <span class="status-pill" [class.ok]="m.googleOAuthClientId && m.googleOAuthClientSecretSet">
                  {{ m.googleOAuthClientId && m.googleOAuthClientSecretSet
                    ? 'Configured (' + (m.googleOAuthClientSecretMasked || '••••') + ')'
                    : (m.googleOAuthClientId ? 'Partial (secret missing)' : 'Not set') }}
                </span>
              </div>
              <div class="grid">
                <label class="field">
                  <span>Google OAuth Client ID</span>
                  <input class="input" type="text" name="googleClientId" autocomplete="off"
                    placeholder="123456-abc.apps.googleusercontent.com"
                    [(ngModel)]="m.googleOAuthClientId" />
                </label>
                <label class="field">
                  <span>Google OAuth Client Secret (leave blank to keep)</span>
                  <input class="input" type="password" name="googleClientSecret" autocomplete="new-password"
                    [placeholder]="m.googleOAuthClientSecretSet ? (m.googleOAuthClientSecretMasked || '••••••••') : 'GOCSPX-…'"
                    [(ngModel)]="googleOAuthClientSecretInput" />
                </label>
              </div>
              @if (m.googleOAuthClientSecretSet) {
                <label class="chk danger-chk"><input type="checkbox" name="clearGoogleSecret" [(ngModel)]="clearGoogleOAuthClientSecret" /> Remove stored Google OAuth Client Secret on save</label>
              }
            </div>

            <div class="int-section">
              <div class="int-head">
                <div>
                  <h2>Google AdSense &amp; Music Catalog</h2>
                  <p class="hint">AdSense Publisher ID applies across Social Analytics, Hindu Panchang, and Pratiyogita (each app keeps its own Ad Slot IDs and placement toggles). Jamendo Client ID powers background music search in AnimStudio.</p>
                </div>
                <span class="status-pill" [class.ok]="!!m.adSenseClientId || m.jamendoClientIdSet">
                  {{ m.adSenseClientId ? m.adSenseClientId : (m.jamendoClientIdSet ? 'Jamendo set' : 'Not set') }}
                </span>
              </div>
              <div class="grid">
                <label class="field">
                  <span>Google AdSense Publisher ID</span>
                  <input class="input" type="text" name="adsenseId" autocomplete="off"
                    placeholder="ca-pub-1234567890123456"
                    [(ngModel)]="m.adSenseClientId" />
                </label>
                <label class="field">
                  <span>Jamendo Client ID {{ m.jamendoClientIdSet ? '(' + (m.jamendoClientIdMasked || 'set') + ')' : '' }}</span>
                  <input class="input" type="password" name="jamendoId" autocomplete="new-password"
                    [placeholder]="m.jamendoClientIdSet ? (m.jamendoClientIdMasked || '••••••••') : 'Jamendo app client_id'"
                    [(ngModel)]="jamendoClientIdInput" />
                </label>
              </div>
              @if (m.jamendoClientIdSet) {
                <label class="chk danger-chk"><input type="checkbox" name="clearJamendo" [(ngModel)]="clearJamendoClientId" /> Remove stored Jamendo Client ID on save</label>
              }
            </div>

            <div class="int-section">
              <div class="int-head">
                <div>
                  <h2>Shared AI Provider Keys</h2>
                  <p class="hint">Hosted AI keys stored encrypted once here and resolved server-side by AnimStudio (or future AI-enabled ecosystem apps). Per-app provider keys in AnimStudio can still override these if set locally.</p>
                </div>
                <span class="status-pill ok">{{ countSetAiKeys(m) }} / {{ m.aiProviderKeys.length }} configured</span>
              </div>
              <div class="table-wrap">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Capability</th>
                      <th>Status</th>
                      <th>Set New Key (write-only)</th>
                      <th>Clear</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of m.aiProviderKeys; track p.providerId) {
                      <tr>
                        <td>
                          <strong>{{ p.label }}</strong>
                          <div class="sub-hint">{{ p.hint }}
                            @if (p.keyUrl) {
                              <a [href]="p.keyUrl" target="_blank" rel="noopener">Get key ↗</a>
                            }
                          </div>
                        </td>
                        <td><span class="cap-badge">{{ p.capability }}</span></td>
                        <td>
                          <span class="status-pill" [class.ok]="p.keySet">
                            {{ p.keySet ? (p.maskedKey || 'Set') : 'Not set' }}
                          </span>
                        </td>
                        <td>
                          <input class="input" type="password" [name]="'aiKey_' + p.providerId" autocomplete="new-password"
                            [placeholder]="p.keySet ? (p.maskedKey || '••••••••') : 'Paste API key…'"
                            [ngModel]="aiKeyInputs[p.providerId] || ''"
                            (ngModelChange)="aiKeyInputs[p.providerId] = $event" />
                        </td>
                        <td>
                          @if (p.keySet) {
                            <label class="chk compact-chk">
                              <input type="checkbox" [name]="'clearAi_' + p.providerId"
                                [checked]="clearAiIds.has(p.providerId)"
                                (change)="toggleClearAiKey(p.providerId)" />
                              Remove
                            </label>
                          } @else {
                            <span class="muted-dash">—</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          <div class="foot">
            <button class="btn-primary" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save settings' }}</button>
            <span class="updated">Last updated {{ m.updatedAt }}</span>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .set-wrap { width: min(980px, 92vw); margin: 0 auto; padding: 1rem; }
    .head { display: flex; align-items: center; gap: 0.6rem; margin: 0 0 1rem; }
    .page-title { font-size: 1.5rem; margin: 0; }
    .icon-btn, .icon-action { width: 2.1rem; height: 2.1rem; border: 1px solid var(--border); background: var(--surface);
      border-radius: 7px; color: var(--text); cursor: pointer; font-size: 1.04rem; line-height: 1; box-shadow: var(--shadow-sm); }
    .icon-btn:hover:not(:disabled), .icon-btn:focus-visible:not(:disabled),
    .icon-action:hover:not(:disabled), .icon-action:focus-visible:not(:disabled) {
      background: var(--brand-soft); border-color: var(--brand); color: var(--brand); outline: none; }
    .icon-btn:disabled, .icon-action:disabled { opacity: 0.6; cursor: default; }
    .icon-btn.spin { animation: spin 0.8s linear infinite; }
    .tooltip { position: relative; }
    .tooltip::after { content: attr(data-tip); position: absolute; left: 50%; top: calc(100% + 7px);
      transform: translateX(-50%) translateY(-4px); background: var(--brand); color: var(--brand-text);
      border-radius: 6px; padding: 0.32rem 0.55rem; font-size: 0.74rem; line-height: 1; white-space: nowrap;
      opacity: 0; pointer-events: none; box-shadow: var(--shadow-sm); transition: opacity 120ms ease, transform 120ms ease; z-index: 8; }
    .tooltip:hover::after, .tooltip:focus-visible::after { opacity: 1; transform: translateX(-50%) translateY(0); }

    @keyframes spin { to { transform: rotate(360deg); } }
    .tabs { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 0.9rem; }
    .tab { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.5rem 0.9rem; border: 1px solid var(--border); border-radius: 8px;
      background: var(--surface); color: var(--muted); font-size: 0.88rem; font-weight: 600; cursor: pointer; }
    .tab:hover { color: var(--text); border-color: var(--brand-border); }
    .tab.active { background: var(--brand); color: var(--brand-text); border-color: var(--brand); }
    .tab-count { font-size: 0.72rem; padding: 0.1rem 0.42rem; border-radius: 999px; background: rgba(255,255,255,0.2); }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.5rem; box-shadow: var(--shadow-sm); }
    .card h2 { font-size: 1.05rem; margin: 1.25rem 0 0.75rem; color: var(--text); }
    .card h2:first-of-type { margin-top: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; }
    .field { display: block; margin-bottom: 0.55rem; }
    .field span { display: block; margin-bottom: 0.3rem; font-size: 0.82rem; font-weight: 600; color: var(--text); }
    .input { width: 100%; box-sizing: border-box; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: 6px;
      font-size: 0.92rem; background: var(--surface-2, var(--surface)); color: var(--text); }
    .input:focus { outline: none; border-color: var(--brand-border); box-shadow: 0 0 0 2px var(--brand-soft); }
    .hint { color: var(--muted); font-size: 0.84rem; margin: 0 0 0.6rem; line-height: 1.45; }
    .hint.warn { color: var(--warning); }
    .sub-hint { color: var(--muted); font-size: 0.76rem; margin-top: 0.15rem; }
    .sub-hint a { color: var(--brand); text-decoration: none; margin-left: 0.35rem; }
    .security-note { border: 1px solid var(--brand-border); background: var(--brand-soft); color: var(--text);
      border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 1.15rem; font-size: 0.85rem; }
    .security-note p { margin: 0.35rem 0 0; color: var(--muted); line-height: 1.45; }
    .int-section { border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; background: var(--surface-2, var(--surface)); }
    .int-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.65rem; }
    .int-head h2 { margin: 0 0 0.25rem; }
    .status-pill { display: inline-flex; align-items: center; padding: 0.22rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
      border: 1px solid var(--border); background: var(--surface); color: var(--muted); white-space: nowrap; }
    .status-pill.ok { border-color: var(--success-border); background: var(--success-soft); color: var(--success); }
    .cap-badge { display: inline-block; padding: 0.16rem 0.45rem; border-radius: 5px; font-size: 0.74rem; font-weight: 600;
      border: 1px solid var(--border); background: var(--surface-2, var(--surface)); color: var(--text); }
    .muted-dash { color: var(--faint); font-size: 0.85rem; }
    .card h3.sub { font-size: 0.95rem; margin: 1.1rem 0 0.5rem; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.6rem; }
    .chip { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.5rem; border-radius: 12px;
      background: var(--brand-soft); color: var(--brand); font-size: 0.8rem; }
    .chip button { border: none; background: none; color: inherit; cursor: pointer; font-size: 0.95rem; line-height: 1; padding: 0; }
    .repo-search { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.6rem; }
    .repo-list { max-height: 220px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem; }
    .repo-list .chk { font-size: 0.85rem; }
    .checklist { margin: 0 0 0.8rem 1.2rem; color: var(--text); font-size: 0.9rem; }
    .chk { display: flex; align-items: center; gap: 0.5rem; margin: 0.55rem 0; font-size: 0.9rem; color: var(--text); cursor: pointer; }
    .chk.compact-chk { margin: 0; font-size: 0.8rem; }
    .chk.danger-chk { color: var(--danger); font-size: 0.84rem; }
    .website-editor { border: 1px solid var(--border); border-radius: 8px; padding: 0.8rem; margin-bottom: 0.9rem; }
    .table-wrap { overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
    .tbl th, .tbl td { padding: 0.55rem; border-bottom: 1px solid var(--border); text-align: left; vertical-align: middle; color: var(--text); }
    .tbl th { background: var(--surface-2); font-weight: 600; color: var(--text); }
    .tbl td a { color: var(--brand); text-decoration: none; }
    .row-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .btn-secondary { padding: 0.45rem 0.8rem; border: 1px solid var(--border-strong, var(--border)); border-radius: 6px;
      background: var(--surface-2, var(--surface)); color: var(--text); cursor: pointer; }
    .hidden-input { display: none; }
    .btn-link { border: none; background: transparent; color: var(--brand); cursor: pointer; padding: 0; }
    .btn-link.danger { color: var(--danger); }
    .foot { display: flex; align-items: center; gap: 1rem; margin-top: 1.5rem; }
    .btn-primary { padding: 0.6rem 1.2rem; background: var(--brand); color: var(--brand-text); border: none; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }
    .updated { color: var(--faint); font-size: 0.8rem; }
    .banner { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-border); border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; }
    .banner.ok { background: var(--success-soft); color: var(--success); border-color: var(--success-border); }
  `]
})
export class SettingsComponent implements OnInit {
  private api = inject(SettingsService);
  private config = inject(ConfigService);
  private packages = inject(PackageInventoryService);
  private route = inject(ActivatedRoute);

  readonly model = signal<SettingsView | null>(null);
  readonly websites = signal<WebsiteLinkView[]>([]);
  /** Write-only draft for the R2 secret access key; blank means "leave the stored secret unchanged". */
  storageS3SecretInput = '';
  /** Write-only draft for the GitHub Packages token; blank means "leave the stored token unchanged". */
  gitHubPackagesTokenInput = '';
  /** Write-only draft for the GitHub OAuth Client Secret; blank means "leave the stored secret unchanged". */
  gitHubOAuthClientSecretInput = '';
  /** Write-only draft for the LinkedIn OAuth Client Secret; blank means "leave the stored secret unchanged". */
  linkedInOAuthClientSecretInput = '';
  /** Central third-party integration secret drafts (never pre-populated from API). */
  youTubeApiKeyInput = '';
  clearYouTubeApiKey = false;
  googleOAuthClientSecretInput = '';
  clearGoogleOAuthClientSecret = false;
  jamendoClientIdInput = '';
  clearJamendoClientId = false;
  aiKeyInputs: Record<string, string> = {};
  clearAiIds = new Set<string>();
  webAuthnOriginsInput = '';
  readonly activeTab = signal<'general' | 'storage' | 'integrations'>('general');
  readonly connectingGitHub = signal(false);

  /** Repository picker for the Packages scan. `selectedRepos` is what gets saved; `repoResults` is
   *  just the searchable candidate list read from GitHub. */
  readonly selectedRepos = signal<string[]>([]);
  readonly repoResults = signal<string[]>([]);
  readonly reposLoading = signal(false);
  repoQuery = '';
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly ok = signal(false);

  ngOnInit(): void {
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (requestedTab === 'general' || requestedTab === 'storage' || requestedTab === 'integrations') {
      this.activeTab.set(requestedTab);
    }

    this.reload();

    const githubResult = this.route.snapshot.queryParamMap.get('github');
    if (githubResult === 'connected') { this.ok.set(true); this.message.set('Connected to GitHub.'); }
    else if (githubResult === 'error') { this.ok.set(false); this.message.set('Could not connect to GitHub. Check the Client ID/Secret and try again.'); }
  }

  setTab(tab: 'general' | 'storage' | 'integrations'): void {
    this.activeTab.set(tab);
  }

  toggleClearAiKey(providerId: string): void {
    if (this.clearAiIds.has(providerId)) this.clearAiIds.delete(providerId);
    else this.clearAiIds.add(providerId);
  }

  countSetAiKeys(m: SettingsView): number {
    return (m.aiProviderKeys ?? []).filter(k => k.keySet).length;
  }

  configuredIntegrationCount(m: SettingsView): number {
    let count = 0;
    if (m.youTubeApiKeySet) count++;
    if (m.googleOAuthClientId && m.googleOAuthClientSecretSet) count++;
    if (m.adSenseClientId) count++;
    if (m.jamendoClientIdSet) count++;
    count += this.countSetAiKeys(m);
    return count;
  }

  /** The exact URL to register with every OAuth provider. Kept canonical and server-driven so it is
   *  stable across every host in the keshavsingh.in family. */
  oauthCallbackUrl(): string {
    const configured = this.model()?.oAuthCallbackUrl?.trim();
    if (configured) return configured;
    return `${new URL(environment.apiUrl, window.location.origin).origin}/api/oauth/callback`;
  }

  isRepoSelected(repo: string): boolean {
    return this.selectedRepos().includes(repo);
  }

  /** Toggling only edits the draft — nothing is scanned until the settings are saved. */
  toggleRepo(repo: string): void {
    const current = this.selectedRepos();
    this.selectedRepos.set(current.includes(repo) ? current.filter(x => x !== repo) : [...current, repo].sort());
  }

  searchRepos(): void {
    this.reposLoading.set(true);
    this.packages.repositories(this.repoQuery.trim()).subscribe({
      next: repos => { this.repoResults.set(repos); this.reposLoading.set(false); },
      error: () => { this.repoResults.set([]); this.reposLoading.set(false); },
    });
  }

  connectGitHub(): void {
    this.connectingGitHub.set(true);
    this.api.startGitHubOAuth().subscribe({
      next: res => { window.location.href = res.authorizeUrl; },
      error: (err: HttpErrorResponse) => { this.connectingGitHub.set(false); this.fail(err, 'Could not start the GitHub connection.'); },
    });
  }

  /** (Re)loads the settings from the server — also driven by the ↻ button. */
  reload(): void {
    this.loading.set(true);
    this.message.set(null);
    forkJoin({ settings: this.api.get(), websites: this.api.listWebsites() }).subscribe({
      next: ({ settings, websites }) => {
        this.model.set(settings);
        this.websites.set(websites);
        this.selectedRepos.set([...settings.packageInventoryRepositories].sort());
        this.webAuthnOriginsInput = settings.webAuthnOrigins.join('\n');
        this.clearSecretDrafts();
        this.loading.set(false);
        this.searchRepos();
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.fail(err, 'Could not load settings.');
      },
    });
  }

  save(): void {
    const m = this.model();
    if (!m) return;
    this.busy.set(true);
    this.message.set(null);
    this.api.update(this.toUpdateRequest(m)).subscribe({
      next: s => {
        this.busy.set(false);
        this.model.set(s);
        this.selectedRepos.set([...s.packageInventoryRepositories].sort());
        this.webAuthnOriginsInput = s.webAuthnOrigins.join('\n');
        this.clearSecretDrafts();
        this.config.refresh(); // Propagate launcher/branding changes to the cached central config.
        this.ok.set(true);
        this.message.set(s.webAuthnOriginsPendingRestart
          ? 'Settings saved. Restart the identity provider for passkey origin changes to take effect.'
          : 'Settings saved.');
      },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.fail(err, 'Could not save settings.'); },
    });
  }

  exportConfig(): void {
    const m = this.model();
    if (!m) return;

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.toUpdateRequest(m),
      websites: this.websites().map(w => ({
        key: w.key,
        name: w.name,
        url: w.url,
        isEnabled: w.isEnabled,
        sortOrder: w.sortOrder,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `admin-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);

    this.ok.set(true);
    this.message.set('Config exported.');
  }

  async importConfig(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      this.busy.set(true);
      this.message.set(null);
      const text = await file.text();
      const raw = JSON.parse(text) as SettingsImportPayload;

      const current = this.model();
      if (!current) throw new Error('Settings are not loaded yet.');

      const merged: SettingsView = {
        ...current,
        ...(raw.settings ?? {}),
      };
      this.webAuthnOriginsInput = (merged.webAuthnOrigins ?? []).join('\n');

      const savedSettings = await firstValueFrom(this.api.update(this.toUpdateRequest(merged)));
      this.model.set(savedSettings);
      this.webAuthnOriginsInput = savedSettings.webAuthnOrigins.join('\n');

      if (Array.isArray(raw.websites) && raw.websites.length > 0) {
        await this.upsertImportedWebsites(raw.websites);
      }

      const refreshedSites = await firstValueFrom(this.api.listWebsites());
      this.websites.set(refreshedSites);
      this.config.refresh();

      this.ok.set(true);
      this.message.set('Config imported.');
    } catch (err) {
      this.ok.set(false);
      this.message.set(err instanceof Error ? err.message : 'Could not import config.');
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }

  private async upsertImportedWebsites(imported: Array<Partial<WebsiteLinkView>>): Promise<void> {
    const existingByKey = new Map(this.websites().map(w => [w.key.toLowerCase(), w]));

    for (const item of imported) {
      const payload = this.normalizeWebsite(item);
      if (!payload) continue;

      const existing = existingByKey.get(payload.key.toLowerCase());
      if (existing) {
        await firstValueFrom(this.api.updateWebsite(existing.id, payload));
      } else {
        await firstValueFrom(this.api.createWebsite(payload));
      }
    }
  }

  private normalizeWebsite(item: Partial<WebsiteLinkView>): UpsertWebsiteLinkRequest | null {
    const key = String(item.key ?? '').trim();
    const name = String(item.name ?? '').trim();
    const url = String(item.url ?? '').trim();
    if (!key || !name || !url) return null;

    return {
      key,
      name,
      url,
      isEnabled: item.isEnabled ?? true,
      sortOrder: Number(item.sortOrder ?? 100),
    };
  }

  private toUpdateRequest(m: SettingsView) {
    return {
      siteTitle: m.siteTitle,
      blogUrl: m.blogUrl,
      blogAdminUrl: m.blogAdminUrl,
      emailTwoFactorEnabled: m.emailTwoFactorEnabled,
      smsTwoFactorEnabled: m.smsTwoFactorEnabled,
      accessTokenMinutes: Number(m.accessTokenMinutes),
      refreshTokenDays: Number(m.refreshTokenDays),
      twoFactorTokenMinutes: Number(m.twoFactorTokenMinutes),
      enforceSingleSessionPerUser: m.enforceSingleSessionPerUser,
      refreshTokenRetentionDays: Number(m.refreshTokenRetentionDays),
      analyticsRetentionDays: Number(m.analyticsRetentionDays),
      loginAuditRetentionDays: Number(m.loginAuditRetentionDays),
      adminAuditRetentionDays: Number(m.adminAuditRetentionDays),
      emailOtpMinutes: Number(m.emailOtpMinutes),
      maxFailedLoginAttempts: Number(m.maxFailedLoginAttempts),
      lockoutMinutes: Number(m.lockoutMinutes),
      backupCodeCount: Number(m.backupCodeCount),
      storageProvider: m.storageProvider,
      storageS3ServiceUrl: m.storageS3ServiceUrl,
      storageS3Bucket: m.storageS3Bucket,
      storageS3AccessKeyId: m.storageS3AccessKeyId,
      ...(this.storageS3SecretInput ? { storageS3SecretAccessKey: this.storageS3SecretInput } : {}),
      ...(this.gitHubPackagesTokenInput ? { gitHubPackagesToken: this.gitHubPackagesTokenInput } : {}),
      oAuthCallbackBaseUrl: m.oAuthCallbackBaseUrl ?? '',
      gitHubOAuthClientId: m.gitHubOAuthClientId,
      ...(this.gitHubOAuthClientSecretInput ? { gitHubOAuthClientSecret: this.gitHubOAuthClientSecretInput } : {}),
      gitHubSocialLoginEnabled: m.gitHubSocialLoginEnabled,
      linkedInSocialLoginEnabled: m.linkedInSocialLoginEnabled,
      linkedInOAuthClientId: m.linkedInOAuthClientId,
      ...(this.linkedInOAuthClientSecretInput ? { linkedInOAuthClientSecret: this.linkedInOAuthClientSecretInput } : {}),
      packageInventoryRepositories: this.selectedRepos(),
      webAuthnOrigins: this.webAuthnOriginsInput.split(/\r?\n/).map(origin => origin.trim()).filter(Boolean),
      ...(this.youTubeApiKeyInput.trim() ? { youTubeApiKey: this.youTubeApiKeyInput.trim() } : {}),
      ...(this.clearYouTubeApiKey ? { clearYouTubeApiKey: true } : {}),
      googleOAuthClientId: (m.googleOAuthClientId ?? '').trim(),
      ...(this.googleOAuthClientSecretInput.trim() ? { googleOAuthClientSecret: this.googleOAuthClientSecretInput.trim() } : {}),
      ...(this.clearGoogleOAuthClientSecret ? { clearGoogleOAuthClientSecret: true } : {}),
      adSenseClientId: (m.adSenseClientId ?? '').trim(),
      ...(this.jamendoClientIdInput.trim() ? { jamendoClientId: this.jamendoClientIdInput.trim() } : {}),
      ...(this.clearJamendoClientId ? { clearJamendoClientId: true } : {}),
      ...(Object.keys(this.collectAiKeyUpdates()).length ? { aiProviderKeys: this.collectAiKeyUpdates() } : {}),
      ...(this.clearAiIds.size ? { clearAiProviderIds: [...this.clearAiIds] } : {}),
    };
  }

  private collectAiKeyUpdates(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, raw] of Object.entries(this.aiKeyInputs)) {
      const cleaned = (raw ?? '').trim();
      if (cleaned) out[id] = cleaned;
    }
    return out;
  }

  private clearSecretDrafts(): void {
    this.storageS3SecretInput = '';
    this.gitHubPackagesTokenInput = '';
    this.gitHubOAuthClientSecretInput = '';
    this.linkedInOAuthClientSecretInput = '';
    this.youTubeApiKeyInput = '';
    this.clearYouTubeApiKey = false;
    this.googleOAuthClientSecretInput = '';
    this.clearGoogleOAuthClientSecret = false;
    this.jamendoClientIdInput = '';
    this.clearJamendoClientId = false;
    this.aiKeyInputs = {};
    this.clearAiIds.clear();
  }

  private fail(err: HttpErrorResponse, fallback: string): void {
    this.ok.set(false);
    this.message.set(typeof err.error?.error === 'string' ? err.error.error : fallback);
  }
}
