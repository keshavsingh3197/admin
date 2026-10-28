using Admin.Api.Services;
using Xunit;

namespace Admin.Api.Tests;

public class WebAuthnOriginTests
{
    [Fact]
    public void Normalizes_exact_origins_and_removes_duplicates()
    {
        var origins = SettingsService.NormalizeWebAuthnOrigins(
        [
            " https://studio.example.com/ ",
            "https://admin.example.com",
            "https://studio.example.com"
        ], "example.com");

        Assert.Equal(
            ["https://admin.example.com", "https://studio.example.com"],
            origins);
    }

    [Theory]
    [InlineData("http://studio.example.com")]
    [InlineData("https://studio.example.com/login")]
    [InlineData("https://studio.example.com?next=/")]
    [InlineData("https://studio.example.com@evil.example")]
    [InlineData("https://example.com.evil.example")]
    [InlineData("https://studio.example.net")]
    [InlineData("javascript:alert(1)")]
    public void Rejects_values_that_are_not_exact_secure_origins(string value)
    {
        Assert.Throws<ArgumentException>(() =>
            SettingsService.NormalizeWebAuthnOrigins([value], "example.com"));
    }

    [Fact]
    public void Allows_http_only_for_loopback_development_origins()
    {
        Assert.Equal(
            ["http://localhost:4200"],
            SettingsService.NormalizeWebAuthnOrigins(["http://localhost:4200"], "example.com"));
    }
}
