using Admin.Api.Services;
using Xunit;

namespace Admin.Api.Tests;

/// <summary>
/// <see cref="OAuthStateService.IsFamilyUrl"/> decides where a browser is sent after an OAuth
/// round-trip, so a gap here is an open redirect on the identity provider's own domain.
/// </summary>
public class OAuthStateServiceTests
{
    [Theory]
    [InlineData("https://keshavsingh.in")]
    [InlineData("https://admin.keshavsingh.in")]
    [InlineData("https://git.keshavsingh.in/admin")]
    [InlineData("https://deep.nested.keshavsingh.in")]
    [InlineData("http://localhost:4200")]
    public void Accepts_family_origins(string url) => Assert.True(OAuthStateService.IsFamilyUrl(url));

    [Theory]
    [InlineData("http://admin.keshavsingh.in")]          // plain http off localhost
    [InlineData("https://evil.com")]
    [InlineData("https://keshavsingh.in.evil.com")]      // suffix-confusion
    [InlineData("https://notkeshavsingh.in")]
    [InlineData("https://evil.com/?x=keshavsingh.in")]
    [InlineData("javascript:alert(1)")]
    [InlineData("//keshavsingh.in")]                      // protocol-relative
    [InlineData("/relative/path")]
    [InlineData("")]
    [InlineData(null)]
    public void Rejects_everything_else(string? url) => Assert.False(OAuthStateService.IsFamilyUrl(url));

    [Fact]
    public void Rejects_a_userinfo_prefix_pointing_at_another_host()
    {
        // "https://keshavsingh.in@evil.com" reads as the family domain but resolves to evil.com.
        Assert.False(OAuthStateService.IsFamilyUrl("https://keshavsingh.in@evil.com"));
    }
}
