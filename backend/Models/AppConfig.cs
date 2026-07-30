using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// The singleton infrastructure-config document (collection <c>config</c>, <c>_id: app-config</c>).
/// Holds the NON-SECRET operational config that used to live in env vars / appsettings so it is
/// managed in one place instead of duplicated per environment. Loaded into <c>IConfiguration</c> at
/// startup by <see cref="Admin.Api.Auth.AppConfigLoader"/>, so the existing strongly-typed options
/// bind from it transparently.
///
/// HARD RULE: nothing secret or bootstrap-critical belongs here — no JWT signing key, encryption
/// data key, admin password, or Mongo connection string. Those stay in env vars / a secret store,
/// because this document lives in the very database they protect. Changing values here that the
/// framework reads once at startup (JWT validation, CORS) takes effect on the next restart.
/// </summary>
public sealed class AppConfig
{
    public const string SingletonId = "app-config";

    [BsonId]
    public string Id { get; set; } = SingletonId;

    public JwtConfig Jwt { get; set; } = new();
    public SsoConfig Sso { get; set; } = new();
    public WebAuthnConfig WebAuthn { get; set; } = new();
    public SeedConfig Seed { get; set; } = new();

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>JWT settings — the signing key is deliberately absent (it stays in env/Key Vault).</summary>
    public sealed class JwtConfig
    {
        public string Issuer { get; set; } = "keshavsingh-idp";
        public string Audience { get; set; } = "keshavsingh-apps";
        public int AccessTokenMinutes { get; set; } = 15;
        public int RefreshTokenDays { get; set; } = 7;
        public int TwoFactorTokenMinutes { get; set; } = 5;
    }

    public sealed class SsoConfig
    {
        public string CookieName { get; set; } = "ks_sso";
        public string Domain { get; set; } = ".keshavsingh.in";
        public bool Secure { get; set; } = true;
        public string SameSite { get; set; } = "Lax";
    }

    public sealed class WebAuthnConfig
    {
        public string RelyingPartyId { get; set; } = "keshavsingh.in";
        public string RelyingPartyName { get; set; } = "Keshav Singh ID";
        public List<string> Origins { get; set; } = new();
        public int ChallengeMinutes { get; set; } = 5;
    }

    /// <summary>First-run admin identity — the admin password is absent (it stays in env/Key Vault).</summary>
    public sealed class SeedConfig
    {
        public string AdminEmail { get; set; } = string.Empty;
        public string AdminDisplayName { get; set; } = "Administrator";
    }
}
