using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Security;
using Microsoft.Extensions.Options;
using MongoDB.Bson.Serialization;
using Xunit;

namespace Admin.Api.Tests;

public sealed class CentralIntegrationsSettingsTests
{
    private static DataProtector CreateProtector()
    {
        var key = Convert.ToBase64String(Enumerable.Range(1, 32).Select(i => (byte)i).ToArray());
        return new DataProtector(Options.Create(new EncryptionOptions { DataKey = key }));
    }

    private static UpdateSettingsRequest BaseRequest(
        string? youTubeApiKey = null,
        bool? clearYouTubeApiKey = null,
        string? googleOAuthClientId = null,
        string? googleOAuthClientSecret = null,
        bool? clearGoogleOAuthClientSecret = null,
        string? adSenseClientId = null,
        string? jamendoClientId = null,
        bool? clearJamendoClientId = null,
        IReadOnlyDictionary<string, string>? aiProviderKeys = null,
        IReadOnlyList<string>? clearAiProviderIds = null) =>
        new(
            SiteTitle: null, BlogUrl: null, BlogAdminUrl: null,
            EmailTwoFactorEnabled: null, SmsTwoFactorEnabled: null,
            AccessTokenMinutes: null, RefreshTokenDays: null, TwoFactorTokenMinutes: null,
            EnforceSingleSessionPerUser: null, RefreshTokenRetentionDays: null,
            AnalyticsRetentionDays: null, LoginAuditRetentionDays: null, AdminAuditRetentionDays: null,
            EmailOtpMinutes: null, MaxFailedLoginAttempts: null, LockoutMinutes: null, BackupCodeCount: null,
            StorageProvider: null, StorageS3ServiceUrl: null, StorageS3Bucket: null,
            StorageS3AccessKeyId: null, StorageS3SecretAccessKey: null, GitHubPackagesToken: null,
            OAuthCallbackBaseUrl: null, GitHubOAuthClientId: null, GitHubOAuthClientSecret: null,
            GitHubSocialLoginEnabled: null, LinkedInSocialLoginEnabled: null,
            LinkedInOAuthClientId: null, LinkedInOAuthClientSecret: null,
            PackageInventoryRepositories: null, WebAuthnOrigins: null,
            YouTubeApiKey: youTubeApiKey,
            ClearYouTubeApiKey: clearYouTubeApiKey,
            GoogleOAuthClientId: googleOAuthClientId,
            GoogleOAuthClientSecret: googleOAuthClientSecret,
            ClearGoogleOAuthClientSecret: clearGoogleOAuthClientSecret,
            AdSenseClientId: adSenseClientId,
            JamendoClientId: jamendoClientId,
            ClearJamendoClientId: clearJamendoClientId,
            AiProviderKeys: aiProviderKeys,
            ClearAiProviderIds: clearAiProviderIds);

    [Fact]
    public void ApplyCentralIntegrations_EncryptsSecretsMasksStatusesAndClearsCleanly()
    {
        var protector = CreateProtector();
        var settings = new AppSettings();

        SettingsService.ApplyCentralIntegrations(settings, BaseRequest(
            youTubeApiKey: "  AIzaSyTestKey1234  ",
            googleOAuthClientId: "  123456.apps.googleusercontent.com ",
            googleOAuthClientSecret: "GOCSPX-secret-9876",
            adSenseClientId: "ca-pub-1234567890123456",
            jamendoClientId: "jamendo-client-7788",
            aiProviderKeys: new Dictionary<string, string>
            {
                ["Groq"] = "gsk_test_groq_4321",
                ["gemini"] = "AIzaSyGeminiKey5678",
            }), protector);

        Assert.NotNull(settings.YouTubeApiKeyEncrypted);
        Assert.NotEqual("AIzaSyTestKey1234", settings.YouTubeApiKeyEncrypted);
        Assert.Equal("AIzaSyTestKey1234", protector.Decrypt(settings.YouTubeApiKeyEncrypted!));
        Assert.Equal("••••1234", SettingsService.MaskEncryptedSecret(settings.YouTubeApiKeyEncrypted, protector));

        Assert.Equal("123456.apps.googleusercontent.com", settings.GoogleOAuthClientId);
        Assert.Equal("GOCSPX-secret-9876", protector.Decrypt(settings.GoogleOAuthClientSecretEncrypted!));
        Assert.Equal("••••9876", SettingsService.MaskEncryptedSecret(settings.GoogleOAuthClientSecretEncrypted, protector));

        Assert.Equal("ca-pub-1234567890123456", settings.AdSenseClientId);
        Assert.Equal("jamendo-client-7788", protector.Decrypt(settings.JamendoClientIdEncrypted!));
        Assert.Equal("gsk_test_groq_4321", protector.Decrypt(settings.AiProviderKeysEncrypted["groq"]));
        Assert.Equal("AIzaSyGeminiKey5678", protector.Decrypt(settings.AiProviderKeysEncrypted["gemini"]));

        var aiStatuses = SettingsService.BuildAiProviderStatuses(settings.AiProviderKeysEncrypted, protector);
        Assert.Contains(aiStatuses, x => x.ProviderId == "groq" && x.KeySet && x.MaskedKey == "••••4321");
        Assert.Contains(aiStatuses, x => x.ProviderId == "gemini" && x.KeySet && x.MaskedKey == "••••5678");
        Assert.Contains(aiStatuses, x => x.ProviderId == "openrouter" && !x.KeySet && x.MaskedKey == string.Empty);

        // Sending masked placeholder or blank does not overwrite stored values.
        SettingsService.ApplyCentralIntegrations(settings, BaseRequest(
            youTubeApiKey: "••••1234",
            aiProviderKeys: new Dictionary<string, string> { ["groq"] = "••••4321" }), protector);
        Assert.Equal("AIzaSyTestKey1234", protector.Decrypt(settings.YouTubeApiKeyEncrypted!));
        Assert.Equal("gsk_test_groq_4321", protector.Decrypt(settings.AiProviderKeysEncrypted["groq"]));

        // Explicit clear removes secrets cleanly.
        SettingsService.ApplyCentralIntegrations(settings, BaseRequest(
            clearYouTubeApiKey: true,
            clearGoogleOAuthClientSecret: true,
            clearJamendoClientId: true,
            adSenseClientId: "",
            clearAiProviderIds: ["groq"]), protector);

        Assert.Null(settings.YouTubeApiKeyEncrypted);
        Assert.Null(settings.GoogleOAuthClientSecretEncrypted);
        Assert.Null(settings.JamendoClientIdEncrypted);
        Assert.Equal(string.Empty, settings.AdSenseClientId);
        Assert.False(settings.AiProviderKeysEncrypted.ContainsKey("groq"));
        Assert.True(settings.AiProviderKeysEncrypted.ContainsKey("gemini"));
    }

    [Fact]
    public void ValidateAdSenseClientId_RejectsMalformedPublisherId()
    {
        Assert.Throws<ArgumentException>(() => SettingsService.ValidateAdSenseClientId("pub-123456"));
        Assert.Equal("ca-pub-1234567890123456", SettingsService.ValidateAdSenseClientId(" ca-pub-1234567890123456 "));
        Assert.Equal(string.Empty, SettingsService.ValidateAdSenseClientId("   "));
    }

    [Fact]
    public void PublicConfigAndLegacyDeserialization_NeverExposeCentralSecrets()
    {
        Assert.DoesNotContain(typeof(PublicConfigView).GetProperties(), p =>
            p.Name.Contains("Key", StringComparison.OrdinalIgnoreCase) ||
            p.Name.Contains("Secret", StringComparison.OrdinalIgnoreCase) ||
            p.Name.Contains("AdSense", StringComparison.OrdinalIgnoreCase) ||
            p.Name.Contains("Jamendo", StringComparison.OrdinalIgnoreCase));

        var legacyBson = new MongoDB.Bson.BsonDocument
        {
            { "_id", "app-settings" },
            { "SiteTitle", "Keshav Singh" }
        };
        var settings = BsonSerializer.Deserialize<AppSettings>(legacyBson);
        var protector = CreateProtector();
        Assert.NotNull(settings.AiProviderKeysEncrypted);
        var statuses = SettingsService.BuildAiProviderStatuses(settings.AiProviderKeysEncrypted, protector);
        Assert.True(statuses.Count >= 10);
    }
}
