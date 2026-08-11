namespace Admin.Api.Dtos;

/// <summary>The authorize URL the SPA should navigate the browser to (a full-page redirect, not an XHR).</summary>
public sealed record GitHubOAuthStartResponse(string AuthorizeUrl);
