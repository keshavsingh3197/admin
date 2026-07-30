namespace Admin.Api.Auth;

/// <summary>
/// Bindable defaults (config section "PublicConfig") for the shared, non-secret app config that is
/// served publicly at <c>GET /api/config</c>. These seed the settings document on first run only —
/// afterwards the values are DB-backed and edited on the admin Settings screen. Nothing secret or
/// bootstrap-critical (signing keys, DB/API URLs) belongs here.
/// </summary>
public sealed class PublicConfigOptions
{
    public const string Section = "PublicConfig";

    public string SiteTitle { get; set; } = "Admin";
    public string BlogUrl { get; set; } = "https://blog.keshavsingh.in";
    public string BlogAdminUrl { get; set; } = "https://blog.keshavsingh.in/admin";
}
