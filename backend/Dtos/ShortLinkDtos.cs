namespace Admin.Api.Dtos;

public record CreateShortLinkRequest(string TargetUrl, string? Code, DateTime? ExpiresAt);

public record UpdateShortLinkRequest(string TargetUrl, DateTime? ExpiresAt);
