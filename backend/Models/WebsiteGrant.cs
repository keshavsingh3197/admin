namespace Admin.Api.Models;

/// <summary>A permission grant scoped to one website (or "admin"/"*" — see <see cref="CustomRole"/>).</summary>
public sealed class WebsiteGrant
{
    public string WebsiteKey { get; set; } = string.Empty;
    public List<string> Permissions { get; set; } = new();
}
