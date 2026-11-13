using Admin.Api.Dtos;
using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Net.Http.Headers;

namespace Admin.Api.Controllers;

/// <summary>
/// The public app-config surface (<c>GET /api/config</c>). Every *.keshavsingh.in app fetches this
/// once on load — and can re-fetch to refresh — instead of hard-coding launcher URLs, branding,
/// icons, feature flags or the list of languages in its own build.
///
/// It is deliberately anonymous, and what it may return is decided server-side: the narrow
/// <see cref="PublicConfigView"/> projection of the settings document, plus the config-registry
/// entries whose stored scope permits this caller. Secret and internal entries are excluded in
/// <see cref="ConfigRegistryService.ProjectForClient"/> — no request parameter can widen that.
/// A signed-in caller additionally sees entries scoped <c>authenticated</c>, so the response is
/// marked private and varies on Authorization.
///
/// Editing happens on the admin Settings and Localization screens (see <see cref="SettingsController"/>
/// and <see cref="ConfigRegistryController"/>).
/// </summary>
[ApiController]
[Route("api/config")]
[AllowAnonymous]
[EnableRateLimiting("public-config")]
public sealed class ConfigController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly ConfigRegistryService _config;
    private readonly LocaleService _locales;
    private readonly TranslationService _translations;
    private readonly WebsiteRegistryService _websites;
    private readonly CreatorChannelService _channels;

    public ConfigController(SettingsService settings, ConfigRegistryService config,
        LocaleService locales, TranslationService translations, WebsiteRegistryService websites,
        CreatorChannelService channels)
    {
        _settings = settings;
        _config = config;
        _locales = locales;
        _translations = translations;
        _websites = websites;
        _channels = channels;
    }

    [HttpGet]
    public async Task<ActionResult<AppConfigEnvelopeView>> Get(CancellationToken ct)
    {
        var authenticated = User.Identity?.IsAuthenticated == true;
        var settings = _settings.ToPublicConfig();
        var locales = _locales.Enabled;
        var websites = await _websites.ListEcosystemAsync(ct);
        var channels = await _channels.ListPublicAsync(ct: ct);
        var websitesTick = websites.Count > 0 ? websites.Max(w => w.UpdatedAt).Ticks : 0L;
        var channelsTick = channels.Count > 0 ? channels.Max(c => c.UpdatedAt).Ticks : 0L;

        var envelope = new AppConfigEnvelopeView(
            settings.SiteTitle,
            settings.BlogUrl,
            settings.BlogAdminUrl,
            // Combined so a change to the registry, settings, websites, or channels moves the version.
            $"{_config.Version}.{settings.UpdatedAt.Ticks:x}.{websitesTick:x}.{channelsTick:x}",
            _locales.DefaultCode,
            locales.Select(LocaleService.ToPublic).ToList(),
            _config.ProjectForClient(authenticated),
            _config.ProjectTypesForClient(authenticated),
            locales.ToDictionary(l => l.Code, l => _translations.VersionFor(l.Code), StringComparer.Ordinal),
            settings.UpdatedAt,
            websites,
            channels);

        var etag = $"\"{(authenticated ? "a" : "p")}-{envelope.Version}\"";
        if (Request.Headers.TryGetValue(HeaderNames.IfNoneMatch, out var inm) && inm.ToString().Contains(etag))
            return StatusCode(StatusCodes.Status304NotModified);

        Response.Headers.ETag = etag;
        // An authenticated response can contain more entries, so it must never land in a shared cache.
        Response.Headers.CacheControl = authenticated ? "private, max-age=30" : "public, max-age=60";
        Response.Headers.Vary = HeaderNames.Authorization;
        return Ok(envelope);
    }

    /// <summary>Public read of enabled ecosystem websites maintained in Admin Websites Registry.</summary>
    [HttpGet("ecosystem")]
    public async Task<ActionResult<IReadOnlyList<EcosystemWebsiteView>>> Ecosystem(CancellationToken ct)
    {
        Response.Headers.CacheControl = "public, max-age=60";
        return Ok(await _websites.ListEcosystemAsync(ct));
    }

    /// <summary>
    /// Public read of enabled creator/social channels configured in Admin Console.
    /// Optional <paramref name="app"/> filter: studio, panchang, social, or footer.
    /// </summary>
    [HttpGet("channels")]
    public async Task<ActionResult<IReadOnlyList<CreatorChannelPublicView>>> Channels(
        [FromQuery] string? app = null, CancellationToken ct = default)
    {
        Response.Headers.CacheControl = "public, max-age=60";
        return Ok(await _channels.ListPublicAsync(app, ct));
    }
}
