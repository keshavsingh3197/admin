using Admin.Api.Services;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.Extensions.Options;

namespace Admin.Api.Startup;

/// <summary>
/// Dynamically augments the credentialed CORS allowlist (<c>AdminCorsPolicy</c>) with any enabled
/// <c>*.keshavsingh.in</c> website origin registered in the Admin Websites Registry.
/// Keeps the strict security boundary (only exact <c>https://</c> origins on <c>keshavsingh.in</c>
/// or <c>*.keshavsingh.in</c>, matching <see cref="WebsiteRegistryService"/>), while ensuring new
/// ecosystem sites work immediately without manual Render dashboard environment variable edits.
/// </summary>
public sealed class DynamicEcosystemCorsPolicyProvider : ICorsPolicyProvider
{
    private const string PolicyName = "AdminCorsPolicy";
    private readonly DefaultCorsPolicyProvider _inner;
    private readonly WebsiteRegistryService _websites;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private IReadOnlyList<string> _cachedOrigins = [];
    private DateTime _cachedAtUtc = DateTime.MinValue;

    public DynamicEcosystemCorsPolicyProvider(
        IOptions<CorsOptions> options,
        WebsiteRegistryService websites)
    {
        _inner = new DefaultCorsPolicyProvider(options);
        _websites = websites;
    }

    public async Task<CorsPolicy?> GetPolicyAsync(HttpContext context, string? policyName)
    {
        var basePolicy = await _inner.GetPolicyAsync(context, policyName);
        if (basePolicy is null || !string.Equals(policyName, PolicyName, StringComparison.Ordinal))
            return basePolicy;

        var dynamicOrigins = await GetWebsiteOriginsAsync(context.RequestServices.GetService<ILogger<DynamicEcosystemCorsPolicyProvider>>());
        if (dynamicOrigins.Count == 0) return basePolicy;

        var builder = new CorsPolicyBuilder(basePolicy);
        foreach (var origin in dynamicOrigins)
        {
            if (!basePolicy.Origins.Contains(origin, StringComparer.OrdinalIgnoreCase))
                builder.WithOrigins(origin);
        }
        return builder.Build();
    }

    public void Invalidate() => _cachedAtUtc = DateTime.MinValue;

    public static bool IsAllowedFamilyOrigin(string? url, out string origin)
    {
        origin = string.Empty;
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
            return false;

        if (uri.Scheme != Uri.UriSchemeHttps) return false;
        var host = uri.Host;
        var trusted = host.Equals("keshavsingh.in", StringComparison.OrdinalIgnoreCase)
            || host.EndsWith(".keshavsingh.in", StringComparison.OrdinalIgnoreCase)
            || host.Equals("keshavsingh3197.github.io", StringComparison.OrdinalIgnoreCase);

        if (!trusted) return false;
        origin = uri.GetLeftPart(UriPartial.Authority);
        return true;
    }

    private async Task<IReadOnlyList<string>> GetWebsiteOriginsAsync(ILogger? logger)
    {
        if (DateTime.UtcNow - _cachedAtUtc < TimeSpan.FromSeconds(30) && _cachedOrigins.Count > 0)
            return _cachedOrigins;

        await _gate.WaitAsync();
        try
        {
            if (DateTime.UtcNow - _cachedAtUtc < TimeSpan.FromSeconds(30) && _cachedOrigins.Count > 0)
                return _cachedOrigins;

            var enabled = await _websites.ListEnabledAsync();
            var origins = new List<string>();
            foreach (var site in enabled)
            {
                if (IsAllowedFamilyOrigin(site.Url, out var origin)
                    && !origins.Contains(origin, StringComparer.OrdinalIgnoreCase))
                {
                    origins.Add(origin);
                }
            }
            _cachedOrigins = origins;
            _cachedAtUtc = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Could not load dynamic website origins for CORS.");
        }
        finally
        {
            _gate.Release();
        }
        return _cachedOrigins;
    }
}
