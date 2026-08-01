using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Admin.Api.Auth;
using Admin.Api.Services;
using Fido2NetLib;
using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Security;
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

var jwtOptions = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();

// ---- Data + domain services ----
builder.Services.AddKeshavMongo(builder.Configuration);
builder.Services.AddSingleton<NoteService>();
builder.Services.AddSingleton<AnalyticsService>();
builder.Services.AddSingleton<WebsiteRegistryService>();
builder.Services.AddSingleton<WebsiteVisitService>();
builder.Services.AddSingleton<WebsiteContentService>();
builder.Services.AddSingleton<TwoFactorDeviceService>();
builder.Services.AddSingleton<SessionRetentionService>();
builder.Services.AddSingleton<CustomRoleService>();
builder.Services.AddSingleton<GroupService>();
builder.Services.AddSingleton<PermissionsService>();
builder.Services.AddSingleton<SearchService>();
builder.Services.AddSingleton<DataRetentionService>();
builder.Services.AddHostedService<SessionRetentionCleanupWorker>();
builder.Services.AddHttpClient();

// ---- Shared security primitives (KeshavSingh.Security) ----
builder.Services.AddSingleton<PasswordHasher>();
builder.Services.AddSingleton<TotpService>();
builder.Services.AddSingleton<DataProtector>();
builder.Services.AddSingleton<JwtService>();

// ---- Shared auth engine (KeshavSingh.Auth) + this app's storage adapters ----
builder.Services.AddScoped<IAuthUserStore, MongoAuthUserStore>();
builder.Services.AddScoped<IRefreshTokenStore, MongoRefreshTokenStore>();
builder.Services.AddScoped<IAuthAuditSink, AuditLogger>();
// Auth settings are DB-backed (editable at runtime on the Settings screen) and also serve as the
// engine's IAuthSettings. Seeded from the "Auth" config on first run (see SettingsService.InitAsync).
builder.Services.AddSingleton<SettingsService>();
builder.Services.AddSingleton<IAuthSettings>(sp => sp.GetRequiredService<SettingsService>());
builder.Services.AddSingleton<IEmailSender, LoggingEmailSender>();
builder.Services.AddSingleton<ISmsSender, LoggingSmsSender>();
builder.Services.AddKeshavAuthEngine();
builder.Services.AddScoped<AdminSeeder>();

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
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// ---- CORS: allow the SSO family — any keshavsingh.in subdomain (admin, id, git, blog, …)
// over https, plus localhost in dev. Credentialed, so this is a scoped predicate allowlist
// (never AllowAnyOrigin). New sibling apps work without touching this. ----
builder.Services.AddCors(options =>
{
    options.AddPolicy("AdminCorsPolicy", policy =>
        policy.SetIsOriginAllowed(IsAllowedOrigin)
              .AllowAnyHeader().AllowAnyMethod().AllowCredentials());
});

static bool IsAllowedOrigin(string origin)
{
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
    if (uri.Host == "localhost") return true; // dev, any port
    return uri.Scheme == Uri.UriSchemeHttps
        && (uri.Host == "keshavsingh.in"
            || uri.Host.EndsWith(".keshavsingh.in", StringComparison.OrdinalIgnoreCase));
}

// ---- Authentication: OAuth2 bearer (JWT) validated on every request ----
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // Keep "sub"/role claims verbatim.
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
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
app.MapHealthChecks("/health");

// ---- First-run settings load + admin seed ----
await app.Services.GetRequiredService<SettingsService>().InitAsync();
await app.Services.GetRequiredService<WebsiteRegistryService>()
    .EnsureIndexesAsync();
await app.Services.GetRequiredService<WebsiteVisitService>()
    .EnsureIndexesAsync();
await app.Services.GetRequiredService<WebsiteContentService>()
    .EnsureIndexesAsync();
await app.Services.GetRequiredService<TwoFactorDeviceService>()
    .EnsureIndexesAsync();
await app.Services.GetRequiredService<CustomRoleService>().EnsureIndexesAsync();
await app.Services.GetRequiredService<CustomRoleService>().SeedSystemRolesAsync();
await app.Services.GetRequiredService<GroupService>().EnsureIndexesAsync();
var publicConfig = app.Services.GetRequiredService<SettingsService>().ToPublicConfig();
await app.Services.GetRequiredService<WebsiteRegistryService>()
    .SeedDefaultsAsync(publicConfig.BlogUrl, publicConfig.BlogAdminUrl);
using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<AdminSeeder>().SeedAsync();
    await scope.ServiceProvider.GetRequiredService<PasskeyService>().EnsureIndexesAsync();
}

app.Run();
