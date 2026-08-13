using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Admin.Api.Auth;
using Admin.Api.Services;
using Admin.Api.Dtos;
using Admin.Api.Localization;
using Fido2NetLib;
using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Realtime.Calls;
using KeshavSingh.Realtime.Chat;
using KeshavSingh.Realtime.Meetings;
using KeshavSingh.Mongo.NoSql;
using KeshavSingh.Mongo.NoSql.Console;
using KeshavSingh.Security;
using KeshavSingh.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ---- Central config: layer the non-secret config held in Mongo (the "app-config" document) on top
// of appsettings, BEFORE anything binds options. This lets Jwt/Sso/WebAuthn/Seed live in the DB
// (one place, no per-env duplication) while secrets (Jwt:SigningKey, Encryption:DataKey,
// Seed:AdminPassword) and bootstrap (the Mongo connection string) stay in env vars. The loader
// never emits secret keys, so this can only override non-secret config. Changes to values the
// framework reads once here (JWT validation, CORS) take effect on the next restart. ----
builder.Configuration.AddInMemoryCollection(AppConfigLoader.LoadAndSeed(builder.Configuration));

// ---- Options (secrets come from user-secrets / env vars, never appsettings) ----
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.Section));
builder.Services.Configure<EncryptionOptions>(builder.Configuration.GetSection(EncryptionOptions.Section));
builder.Services.Configure<AuthSettingsOptions>(builder.Configuration.GetSection(AuthSettingsOptions.Section));
builder.Services.Configure<PublicConfigOptions>(builder.Configuration.GetSection(PublicConfigOptions.Section));
builder.Services.Configure<SeedOptions>(builder.Configuration.GetSection(SeedOptions.Section));
builder.Services.Configure<SsoCookieOptions>(builder.Configuration.GetSection(SsoCookieOptions.Section));
builder.Services.Configure<WebAuthnOptions>(builder.Configuration.GetSection(WebAuthnOptions.Section));
builder.Services.Configure<FileUploadOptions>(builder.Configuration.GetSection(FileUploadOptions.Section));

var jwtOptions = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();

// ---- Data + domain services ----
builder.Services.AddKeshavMongo(builder.Configuration);
// Private per-user file storage (KeshavSingh.Storage). The provider + R2 credentials are managed
// at runtime on the admin Settings screen (stored in Mongo, secret AES-encrypted), so SettingsService
// is the live settings source — registered BEFORE AddKeshavStorage so it overrides the default
// appsettings-based source. Defaults to local disk until an admin switches the provider to S3.
builder.Services.AddSingleton<IStorageSettingsSource>(sp => sp.GetRequiredService<SettingsService>());
builder.Services.AddKeshavStorage(builder.Configuration);
builder.Services.AddSingleton<FolderService>();
builder.Services.AddSingleton<FileService>();
// Realtime 1:1 chat — the whole backend lives in the KeshavSingh.Realtime package; admin only
// supplies the user directory (its own users collection) and the app-side JWT hub-token handler below.
builder.Services.AddKeshavChat(builder.Configuration);
builder.Services.AddSingleton<IChatUserDirectory, AdminChatUserDirectory>();
// Group audio/video calls (WebRTC mesh) + scheduled meetings. Signalling rides the chat hub — no extra
// hub or auth wiring. Media is peer-to-peer and DTLS-SRTP encrypted, so nothing ever reaches this
// server. TURN credentials, if any, come from Calls:Turn:* in the environment (never appsettings).
builder.Services.AddKeshavCalls(builder.Configuration);
builder.Services.AddKeshavMeetings(builder.Configuration);
builder.Services.AddSingleton<NoteService>();
builder.Services.AddSingleton<ShortLinkService>();
// Family finance: persistence + the KeshavSingh.Finance advisory engine (pure, no secrets/I-O).
builder.Services.AddSingleton<FinanceService>();
builder.Services.AddKeshavFinance();
// Inbox for the portfolio's public "Contact me" form (submissions encrypted at rest; admin-only reads).
builder.Services.AddSingleton<ContactService>();
// Live chat with visitors on the public sites, answered from the admin app. Anonymous on the visitor
// side (an opaque token, only its hash stored) and encrypted at rest, like the contact inbox.
builder.Services.AddSingleton<VisitorChatService>();
builder.Services.AddSingleton<AnalyticsService>();
builder.Services.AddSingleton<WebsiteRegistryService>();
builder.Services.AddSingleton<WebsiteVisitService>();
builder.Services.AddSingleton<WebsiteContentService>();
// ---- Localisation + runtime config registry (KeshavSingh.Localization) ----
// Every user-facing string and every previously hard-coded value (URLs, icons, flags, limits) lives in
// Mongo and is served from here, so a language or a label changes without a redeploy. The whole engine
// — locale registry, catalogue, JSON/CSV/Excel import-export, config registry, controllers — is in the
// package; this app supplies only its own content, through the two seed sources below.
builder.Services.AddKeshavLocalization(builder.Configuration);
builder.Services.AddLocalizationSeeds<AdminAppSeeds>();
builder.Services.AddLocalizationSeeds<PublicSiteSeeds>();
builder.Services.AddSingleton<TwoFactorDeviceService>();
builder.Services.AddSingleton<SessionRetentionService>();
builder.Services.AddSingleton<CustomRoleService>();
builder.Services.AddSingleton<GroupService>();
builder.Services.AddSingleton<PermissionMasterService>();
builder.Services.AddSingleton<PermissionsService>();
builder.Services.AddSingleton<IPageAccessEvaluator>(sp => sp.GetRequiredService<PermissionsService>());
builder.Services.AddSingleton<SearchService>();
builder.Services.AddScoped<ApplicationMetricsService>();
// The database console (KeshavSingh.Mongo.NoSql): an Admin-only query editor over this app's own Mongo.
// Writes are opt-in and single-document only; the package guard refuses server-side JavaScript, $out /
// $merge and system collections, and redacts secret fields on the way out. See DbConsoleController.
builder.Services.AddSingleton(sp =>
{
    var options = builder.Configuration.GetSection(MongoConsoleOptions.Section).Get<MongoConsoleOptions>()
                  ?? new MongoConsoleOptions();
    return new MongoQueryConsole(sp.GetRequiredService<MongoDbService>(), options);
});
builder.Services.AddSingleton<DataRetentionService>();
builder.Services.AddSingleton<HealthCheckService>();
builder.Services.AddSingleton<PackageInventoryService>();
builder.Services.AddSingleton<DatabaseBackupService>();
builder.Services.AddHostedService<SessionRetentionCleanupWorker>();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient();

// ---- Shared security primitives (KeshavSingh.Security) ----
builder.Services.AddSingleton<PasswordHasher>();
builder.Services.AddSingleton<TotpService>();
builder.Services.AddSingleton<DataProtector>();
builder.Services.AddSingleton<JwtService>();

// ---- Shared auth engine (KeshavSingh.Auth) + this app's storage adapters ----
// MongoRefreshTokenStore/MongoAuditSink come from KeshavSingh.Core (shared with content-blog).
// Single-session-per-user is enforced by AuthEngine itself now (scoped per site via AppKey, with
// a block-and-confirm prompt), so the store no longer needs a settings callback wired into it.
builder.Services.AddScoped<IAuthUserStore, MongoAuthUserStore>();
builder.Services.AddScoped<IRefreshTokenStore, MongoRefreshTokenStore>();
builder.Services.AddScoped<IAuthAuditSink, MongoAuditSink>();
// Auth settings are DB-backed (editable at runtime on the Settings screen) and also serve as the
// engine's IAuthSettings. Seeded from the "Auth" config on first run (see SettingsService.InitAsync).
builder.Services.AddSingleton<SettingsService>();
builder.Services.AddSingleton<IAuthSettings>(sp => sp.GetRequiredService<SettingsService>());
builder.Services.AddSingleton<IEmailSender, LoggingEmailSender>();
builder.Services.AddSingleton<ISmsSender, LoggingSmsSender>();
// WhatsApp security alerts (e.g. account lockout) via KeshavSingh.Core's Meta Cloud API notifier.
builder.Services.AddSingleton<IWhatsAppSettings>(sp => sp.GetRequiredService<SettingsService>());
builder.Services.AddSingleton<WhatsAppNotifier>();
// Same notifier also delivers the WhatsApp-fallback 2FA OTP, to the signed-in user's own number.
builder.Services.AddSingleton<IWhatsAppSender, WhatsAppOtpSender>();
builder.Services.AddKeshavAuthEngine();
builder.Services.AddScoped<AdminSeeder>();
// OAuth: one signed state + one registered redirect URI shared by social sign-in and the Packages
// "Connect to GitHub" flow (see OAuthStateService / OAuthController).
builder.Services.AddSingleton<OAuthStateService>();
builder.Services.AddSingleton<SocialLoginService>();

// ---- Passkeys (WebAuthn / FIDO2) ----
// IFido2 is registered by hand (the DI helper lives in a separate Fido2.AspNet package). No
// metadata service: we take no attestation (AttestationPreference.None), so MDS isn't needed.
var webAuthn = builder.Configuration.GetSection(WebAuthnOptions.Section).Get<WebAuthnOptions>() ?? new WebAuthnOptions();
builder.Services.AddSingleton<IFido2>(_ => new Fido2(new Fido2Configuration
{
    ServerDomain = webAuthn.RelyingPartyId,
    ServerName = webAuthn.RelyingPartyName,
    Origins = webAuthn.Origins.ToHashSet(StringComparer.OrdinalIgnoreCase),
}, metadataService: null));
builder.Services.AddScoped<PasskeyService>();
builder.Services.AddScoped<SessionMinter>();

// ---- Controllers (incl. the shared /api/auth controller from the package) ----
builder.Services
    .AddControllers()
    .AddKeshavAuthControllers()
    .AddKeshavChatControllers()
    // /api/i18n/** (public reads + the editorial surface) and /api/app-config/** (Admin-only).
    .AddKeshavLocalizationControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// ---- CORS: allow the SSO family — any keshavsingh.in subdomain (admin, id, git, blog, …)
// over https, plus localhost in dev. Credentialed, so this is a scoped predicate allowlist
// (never AllowAnyOrigin). New sibling apps work without touching this. ----
const string CorsPolicy = "AdminCorsPolicy";
builder.Services.AddKeshavSsoCors(CorsPolicy);

// ---- Authentication: OAuth2 bearer (JWT) validated on every request ----
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // Keep "sub"/role claims verbatim.
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        // WebSockets can't send an Authorization header, so SignalR passes the JWT as the
        // `access_token` query param. Accept it ONLY for the chat hub path (never for the REST API).
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hubs/chat"))
                    context.Token = accessToken;
                return Task.CompletedTask;
            },
        };
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(string.IsNullOrWhiteSpace(jwtOptions.SigningKey)
                    ? new string('0', 32) // Placeholder; JwtService throws at startup if unset.
                    : jwtOptions.SigningKey)),
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });
builder.Services.AddAuthorization();

// ---- Rate limiting: stricter window on auth endpoints to blunt brute force ----
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 20,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
    // The public contact form: a real visitor sends one message, so this only has to be generous enough
    // not to block a retry, and tight enough that the inbox can't be flooded from one address.
    options.AddPolicy("contact", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(10),
            QueueLimit = 0,
        }));
    // The anonymous config + localisation reads. Every public page load fetches these, and clients
    // poll the manifest, so the budget is generous — it exists to stop one address hammering them,
    // not to pace a normal visit. Responses are ETagged, so a poll that finds nothing new is a 304.
    options.AddPolicy("public-config", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 240,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
    // Visitor chat polls every few seconds while the widget is open, so this has to be roomy — it is
    // here to stop a flood, not to pace a conversation.
    options.AddPolicy("visitor-chat", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 120,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
    // Starting a conversation is once-per-visitor, so it gets its own much tighter budget: this is what
    // stops the queue being filled with empty threads.
    options.AddPolicy("visitor-chat-start", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromHours(1),
            QueueLimit = 0,
        }));
    // Public short-link redirects: generous, since a shared link can get a real burst of clicks — this
    // exists to blunt scripted abuse, not to pace normal traffic.
    options.AddPolicy("shortlink-redirect", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 120,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
});

builder.Services.AddHealthChecks();

// Behind Render's TLS-terminating proxy: honour X-Forwarded-* so the app sees the real client IP
// (rate limiting & audit) and the original https scheme (so no in-container redirect loop).
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

// ---- Pipeline ----
app.UseForwardedHeaders(); // Must run before anything that reads scheme / client IP.
app.UseKeshavAuthExceptionHandling();

// Baseline security headers.
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "no-referrer";
    headers["Cross-Origin-Resource-Policy"] = "same-site";
    await next();
});

if (!app.Environment.IsDevelopment())
{
    // TLS is terminated at Render's edge (which also redirects http->https), so an in-container
    // HTTPS redirect is redundant and can loop behind the proxy. We still emit HSTS.
    app.UseHsts();
}

app.UseCors("AdminCorsPolicy");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapKeshavChatHub(app.Configuration);
app.MapHealthChecks("/health");

// ---- First-run settings load + admin seed ----
await app.Services.GetRequiredService<SettingsService>().InitAsync();
await app.Services.GetRequiredService<WebsiteRegistryService>()
    .EnsureIndexesAsync();
await app.Services.GetRequiredService<WebsiteVisitService>()
    .EnsureIndexesAsync();
// Localisation first, and before the localised-content index: it supplies the default language that
// index and its backfill need. Creates the indexes, applies both seed sources (additively — an
// editor's change is never overwritten) and leaves the caches warm.
await app.Services.InitKeshavLocalizationAsync();
await app.Services.GetRequiredService<WebsiteContentService>()
    .EnsureIndexesAsync();
await app.Services.GetRequiredService<TwoFactorDeviceService>()
    .EnsureIndexesAsync();
await app.Services.GetRequiredService<ContactService>().EnsureIndexesAsync();
await app.Services.GetRequiredService<VisitorChatService>().EnsureIndexesAsync();
await app.Services.GetRequiredService<CustomRoleService>().EnsureIndexesAsync();
await app.Services.GetRequiredService<PermissionMasterService>().EnsureIndexesAsync();
await app.Services.GetRequiredService<PermissionMasterService>().SeedAsync();
await app.Services.GetRequiredService<CustomRoleService>().SeedSystemRolesAsync();
await app.Services.GetRequiredService<GroupService>().EnsureIndexesAsync();
await app.Services.GetRequiredService<FolderService>().EnsureIndexesAsync();
await app.Services.GetRequiredService<FileService>().EnsureIndexesAsync();
await app.Services.GetRequiredService<ShortLinkService>().EnsureIndexesAsync();
var publicConfig = app.Services.GetRequiredService<SettingsService>().ToPublicConfig();
// The portfolio's URL isn't part of the shared PublicConfig (nothing else needs it), so it comes from
// Websites:PortfolioUrl — only ever used to seed the registry row, which is editable on Settings after.
await app.Services.GetRequiredService<WebsiteRegistryService>()
    .SeedDefaultsAsync(
        publicConfig.BlogUrl,
        publicConfig.BlogAdminUrl,
        app.Configuration["Websites:PortfolioUrl"] ?? "https://keshavsingh.in");
using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<AdminSeeder>().SeedAsync();
    await scope.ServiceProvider.GetRequiredService<PasskeyService>().EnsureIndexesAsync();
}

app.Run();
