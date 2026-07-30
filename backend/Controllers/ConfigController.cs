using Admin.Api.Dtos;
using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>
/// The public app-config surface (<c>GET /api/config</c>). Every *.keshavsingh.in app fetches this
/// once on load — and can re-fetch to refresh — instead of hard-coding launcher URLs / branding in
/// its own build. It is deliberately anonymous and returns ONLY the non-secret
/// <see cref="PublicConfigView"/> projection: no security settings, nothing secret, nothing
/// bootstrap-critical. Editing happens on the admin Settings screen (see <see cref="SettingsController"/>).
/// </summary>
[ApiController]
[Route("api/config")]
[AllowAnonymous]
public sealed class ConfigController : ControllerBase
{
    private readonly SettingsService _settings;
    public ConfigController(SettingsService settings) => _settings = settings;

    [HttpGet]
    public ActionResult<PublicConfigView> Get()
    {
        // Safe to cache briefly at the client: this is public, non-secret, and changes rarely.
        Response.Headers.CacheControl = "public, max-age=60";
        return Ok(_settings.ToPublicConfig());
    }
}
