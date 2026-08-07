namespace Admin.Api.Dtos;

public sealed record WebsiteContentView(
    string Id,
    string SiteKey,
    string ContentKey,
    string Locale,
    string PayloadJson,
    bool IsPublished,
    int Version,
    DateTime UpdatedAt
);

/// <summary>
/// Create/replace one localised content block. <c>Locale</c> may be omitted, in which case the
/// default locale is used — so an existing single-language caller keeps working unchanged.
/// </summary>
public sealed record UpsertWebsiteContentRequest(
    string SiteKey,
    string ContentKey,
    string PayloadJson,
    bool IsPublished,
    string? Locale
);

/// <summary>
/// What a public site receives. <c>Locale</c> is the language actually served, which may differ from
/// the one requested if it fell back — the site needs to know which it got.
/// </summary>
public sealed record PublicWebsiteContentView(
    string SiteKey,
    string ContentKey,
    string Locale,
    string RequestedLocale,
    string PayloadJson,
    int Version,
    DateTime UpdatedAt
);
