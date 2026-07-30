using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Admin.Api.Auth;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ---- Options (secrets come from user-secrets / env vars, never appsettings) ----
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.Section));
builder.Services.Configure<EncryptionOptions>(builder.Configuration.GetSection(EncryptionOptions.Section));
builder.Services.Configure<AuthSettingsOptions>(builder.Configuration.GetSection(AuthSettingsOptions.Section));
builder.Services.Configure<SeedOptions>(builder.Configuration.GetSection(SeedOptions.Section));
builder.Services.Configure<SsoCookieOptions>(builder.Configuration.GetSection(SsoCookieOptions.Section));

var jwtOptions = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();

// ---- Data + domain services ----
builder.Services.AddSingleton<MongoDbService>();
builder.Services.AddSingleton<NoteService>();

// ---- Shared security primitives (KeshavSingh.Security) ----
builder.Services.AddSingleton<PasswordHasher>();
builder.Services.AddSingleton<TotpService>();
builder.Services.AddSingleton<DataProtector>();
builder.Services.AddSingleton<JwtService>();

// ---- Shared auth engine (KeshavSingh.Auth) + this app's storage adapters ----
builder.Services.AddScoped<IAuthUserStore, MongoAuthUserStore>();
builder.Services.AddScoped<IRefreshTokenStore, MongoRefreshTokenStore>();
builder.Services.AddScoped<IAuthAuditSink, AuditLogger>();
builder.Services.AddSingleton<IAuthSettings, ConfigAuthSettings>();
builder.Services.AddSingleton<IEmailSender, LoggingEmailSender>();
builder.Services.AddSingleton<ISmsSender, LoggingSmsSender>();
builder.Services.AddKeshavAuthEngine();
builder.Services.AddScoped<AdminSeeder>();

// ---- Controllers (incl. the shared /api/auth controller from the package) ----
builder.Services
    .AddControllers()
    .AddKeshavAuthControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// ---- CORS: only the configured admin origins may call the API ----
var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:4200"];
builder.Services.AddCors(options =>
{
    options.AddPolicy("AdminCorsPolicy", policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials());
});

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

// ---- First-run admin seed ----
using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<AdminSeeder>().SeedAsync();
}

app.Run();
