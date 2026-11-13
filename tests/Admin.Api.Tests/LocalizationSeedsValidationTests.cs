using System.Text.Json;
using Admin.Api.Localization;
using KeshavSingh.Localization;
using KeshavSingh.Localization.Models;
using KeshavSingh.Localization.Seeding;
using Xunit;

namespace Admin.Api.Tests;

public sealed class LocalizationSeedsValidationTests
{
    private static string FindBackendAppSettingsPath()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "backend", "appsettings.json");
            if (File.Exists(candidate))
                return candidate;
            dir = dir.Parent;
        }

        throw new FileNotFoundException("Could not locate backend/appsettings.json from test output directory.");
    }

    private static IReadOnlySet<string> LoadDeploymentAllowedHosts()
    {
        using var stream = File.OpenRead(FindBackendAppSettingsPath());
        using var doc = JsonDocument.Parse(stream);
        var hosts = doc.RootElement
            .GetProperty("Localization")
            .GetProperty("AllowedHosts")
            .EnumerateArray()
            .Select(e => e.GetString() ?? string.Empty);
        return ConfigValueValidator.NormalizeHosts(hosts);
    }

    [Fact]
    public void All_Seeded_Config_Entries_Validate_Against_Appsettings_AllowedHosts()
    {
        var allowedHosts = LoadDeploymentAllowedHosts();
        ILocalizationSeedSource[] sources = [new AdminAppSeeds(), new PublicSiteSeeds()];

        foreach (var source in sources)
        {
            foreach (var seed in source.ConfigEntries())
            {
                if (seed.IsSecret) continue;
                var validated = ConfigValueValidator.Validate(seed.ValueType, seed.DefaultValue, allowedHosts);
                Assert.NotNull(validated);
            }
        }

        Assert.Contains("youtube.com", allowedHosts);
        Assert.Contains("youtu.be", allowedHosts);
    }

    [Theory]
    [InlineData("https://www.youtube.com/@keshavsinghworld")]
    [InlineData("https://youtube.com/@OmkarShivBhakti")]
    [InlineData("https://youtu.be/dQw4w9WgXcQ")]
    public void YouTube_Urls_Validate_Against_Deployment_AllowedHosts(string url)
    {
        var allowedHosts = LoadDeploymentAllowedHosts();
        var validated = ConfigValueValidator.Validate(ConfigValueType.Url, url, allowedHosts);
        Assert.StartsWith("https://", validated, StringComparison.Ordinal);
    }
}
