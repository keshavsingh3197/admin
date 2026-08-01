using Admin.Api.Models;
using KeshavSingh.Auth;
using KeshavSingh.Security;
using MongoDB.Driver;

namespace Admin.Api.Auth;

/// <summary>
/// Loads the non-secret <see cref="AppConfig"/> document from Mongo at startup and projects it into
/// flat <c>IConfiguration</c> keys ("Jwt:Issuer", "Sso:Domain", "WebAuthn:Origins:0", …), so the
/// existing <c>Configure&lt;T&gt;(GetSection(...))</c> bindings pick their values up with no consumer
/// changes. On first run it seeds the document from the current appsettings so the database becomes
/// the source of truth going forward.
///
/// Secrets are structurally impossible to emit here: <see cref="AppConfig"/> has no signing key,
/// data key, admin password or connection string, so those always continue to come from env vars /
/// the secret store — never from this database document.
/// </summary>
public static class AppConfigLoader
{
    public static IEnumerable<KeyValuePair<string, string?>> LoadAndSeed(IConfiguration bootstrap)
    {
        var connString = bootstrap["MongoDbSettings:ConnectionString"];
        var dbName = bootstrap["MongoDbSettings:DatabaseName"];
        if (string.IsNullOrWhiteSpace(connString) || string.IsNullOrWhiteSpace(dbName))
            return Array.Empty<KeyValuePair<string, string?>>();

        try
        {
            var col = new MongoClient(connString).GetDatabase(dbName).GetCollection<AppConfig>("config");
            var doc = col.Find(c => c.Id == AppConfig.SingletonId).FirstOrDefault();
            if (doc is null)
            {
                doc = SeedFromAppsettings(bootstrap);
                col.ReplaceOne(c => c.Id == AppConfig.SingletonId, doc, new ReplaceOptions { IsUpsert = true });
            }
            return Flatten(doc);
        }
        catch (Exception ex)
        {
            // Fail open to the committed appsettings defaults: if Mongo is unreachable the app can't
            // function anyway, but this lets startup proceed with sane non-secret config.
            Console.Error.WriteLine($"[AppConfigLoader] Falling back to appsettings — could not read config from Mongo: {ex.Message}");
            return Array.Empty<KeyValuePair<string, string?>>();
        }
    }

    /// <summary>Builds the first-run document from the current (appsettings/env) non-secret config.</summary>
    private static AppConfig SeedFromAppsettings(IConfiguration c)
    {
        var jwt = c.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
        var sso = c.GetSection(SsoCookieOptions.Section).Get<SsoCookieOptions>() ?? new SsoCookieOptions();
        var web = c.GetSection(WebAuthnOptions.Section).Get<WebAuthnOptions>() ?? new WebAuthnOptions();
        var seed = c.GetSection(SeedOptions.Section).Get<SeedOptions>() ?? new SeedOptions();

        return new AppConfig
        {
            Jwt = new AppConfig.JwtConfig
            {
                Issuer = jwt.Issuer,
                Audience = jwt.Audience,
            },
            Sso = new AppConfig.SsoConfig
            {
                CookieName = sso.CookieName,
                Domain = sso.Domain ?? string.Empty,
                Secure = sso.Secure,
                SameSite = sso.SameSite.ToString(),
            },
            WebAuthn = new AppConfig.WebAuthnConfig
            {
                RelyingPartyId = web.RelyingPartyId,
                RelyingPartyName = web.RelyingPartyName,
                Origins = web.Origins.ToList(),
                ChallengeMinutes = web.ChallengeMinutes,
                MaxCredentialsPerUser = web.MaxCredentialsPerUser,
            },
            Seed = new AppConfig.SeedConfig
            {
                AdminEmail = seed.AdminEmail,
                AdminDisplayName = seed.AdminDisplayName,
            },
        };
    }

    /// <summary>Projects the typed document to flat config keys. Secret keys are never produced.</summary>
    private static IEnumerable<KeyValuePair<string, string?>> Flatten(AppConfig c)
    {
        var d = new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = c.Jwt.Issuer,
            ["Jwt:Audience"] = c.Jwt.Audience,

            ["Sso:CookieName"] = c.Sso.CookieName,
            ["Sso:Domain"] = c.Sso.Domain,
            ["Sso:Secure"] = c.Sso.Secure.ToString(),
            ["Sso:SameSite"] = c.Sso.SameSite,

            ["WebAuthn:RelyingPartyId"] = c.WebAuthn.RelyingPartyId,
            ["WebAuthn:RelyingPartyName"] = c.WebAuthn.RelyingPartyName,
            ["WebAuthn:ChallengeMinutes"] = c.WebAuthn.ChallengeMinutes.ToString(),
            ["WebAuthn:MaxCredentialsPerUser"] = c.WebAuthn.MaxCredentialsPerUser.ToString(),

            ["Seed:AdminEmail"] = c.Seed.AdminEmail,
            ["Seed:AdminDisplayName"] = c.Seed.AdminDisplayName,
        };
        for (var i = 0; i < c.WebAuthn.Origins.Count; i++)
            d[$"WebAuthn:Origins:{i}"] = c.WebAuthn.Origins[i];
        return d;
    }
}
