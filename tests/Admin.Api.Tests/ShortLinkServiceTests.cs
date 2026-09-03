using Admin.Api.Services;
using Xunit;

namespace Admin.Api.Tests;

/// <summary>
/// The short-link target becomes a 302 from the identity provider's domain, so the scheme
/// allowlist is the whole defence against turning it into a javascript:/data: sink.
/// </summary>
public class ShortLinkServiceTests
{
    [Theory]
    [InlineData("https://example.com/page")]
    [InlineData("http://example.com")]
    public void Accepts_absolute_http_urls(string url) => Assert.True(ShortLinkService.IsValidTargetUrl(url));

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html,<script>alert(1)</script>")]
    [InlineData("file:///etc/passwd")]
    [InlineData("ftp://example.com")]
    [InlineData("/relative")]
    [InlineData("example.com")]
    [InlineData("")]
    public void Rejects_anything_else(string url) => Assert.False(ShortLinkService.IsValidTargetUrl(url));
}
