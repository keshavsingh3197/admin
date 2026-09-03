using Admin.Api.Auth;
using Admin.Api.Services;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Core;
using KeshavSingh.Localization;

namespace Admin.Api.Startup;

/// <summary>
/// Everything that has to happen once, after the container is built and before the app serves its
/// first request: index creation, seeding, and warming the caches the request path assumes.
///
/// <para><b>The order is load-bearing, not incidental.</b> Localisation runs before the
/// localised-content index because it supplies the default language that index and its backfill are
/// built around; the website registry is seeded after settings are loaded because it reads the
/// public config for its default rows. Anything appended here should say why it sits where it does.</para>
///
/// <para>Every step is idempotent — this runs on every boot, including on a database that is already
/// fully set up. Data changes belong in <c>db/migrations</c>, not here; this file is for schema
/// (indexes) and for seeds the code itself guarantees.</para>
/// </summary>
public static class StartupInitializationExtensions
{
    /// <summary>Runs the one-time setup. Called after <c>builder.Build()</c>, before <c>app.Run()</c>.</summary>
    public static async Task InitializeAdminAsync(this WebApplication app)
    {
        var services = app.Services;
        var configuration = app.Configuration;

        await services.GetRequiredService<SettingsService>().InitAsync();
        // The auth-path indexes. refresh_tokens is looked up by hash on EVERY /api/sso/session — i.e. on
        // every page load of every app in the family — so without these that is a collection scan against
        // a collection that grows with every login.
        using (var authIndexScope = services.CreateScope())
        {
            await ((MongoRefreshTokenStore)authIndexScope.ServiceProvider.GetRequiredService<IRefreshTokenStore>())
                .EnsureIndexesAsync();
            await ((MongoAuditSink)authIndexScope.ServiceProvider.GetRequiredService<IAuthAuditSink>())
                .EnsureIndexesAsync();
        }
        await services.GetRequiredService<WebsiteRegistryService>()
            .EnsureIndexesAsync();
        await services.GetRequiredService<WebsiteVisitService>()
            .EnsureIndexesAsync();
        // Localisation first, and before the localised-content index: it supplies the default language that
        // index and its backfill need. Creates the indexes, applies both seed sources (additively — an
        // editor's change is never overwritten) and leaves the caches warm.
        await services.InitKeshavLocalizationAsync();
        await services.GetRequiredService<WebsiteContentService>()
            .EnsureIndexesAsync();
        await services.GetRequiredService<TwoFactorDeviceService>()
            .EnsureIndexesAsync();
        await services.GetRequiredService<ContactService>().EnsureIndexesAsync();
        await services.GetRequiredService<AccountRequestService>().EnsureIndexesAsync();
        await services.GetRequiredService<VisitorChatService>().EnsureIndexesAsync();
        await services.GetRequiredService<CustomRoleService>().EnsureIndexesAsync();
        await services.GetRequiredService<PermissionMasterService>().EnsureIndexesAsync();
        await services.GetRequiredService<PermissionMasterService>().SeedAsync();
        await services.GetRequiredService<CustomRoleService>().SeedSystemRolesAsync();
        await services.GetRequiredService<GroupService>().EnsureIndexesAsync();
        await services.GetRequiredService<FolderService>().EnsureIndexesAsync();
        await services.GetRequiredService<FileService>().EnsureIndexesAsync();
        await services.GetRequiredService<ShortLinkService>().EnsureIndexesAsync();
        await services.GetRequiredService<SearchService>().EnsureIndexesAsync();
        var publicConfig = services.GetRequiredService<SettingsService>().ToPublicConfig();
        // The portfolio's URL isn't part of the shared PublicConfig (nothing else needs it), so it comes from
        // Websites:PortfolioUrl — only ever used to seed the registry row, which is editable on Settings after.
        await services.GetRequiredService<WebsiteRegistryService>()
            .SeedDefaultsAsync(
                publicConfig.BlogUrl,
                publicConfig.BlogAdminUrl,
                configuration["Websites:PortfolioUrl"] ?? "https://keshavsingh.in");
        using (var scope = services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<AdminSeeder>().SeedAsync();
            await scope.ServiceProvider.GetRequiredService<PasskeyService>().EnsureIndexesAsync();
        }
    }
}
