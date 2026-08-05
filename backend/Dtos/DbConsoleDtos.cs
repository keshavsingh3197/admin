using System.ComponentModel.DataAnnotations;

namespace Admin.Api.Dtos;

/// <summary>
/// What the database console accepts. Sizes are bounded here at the trust boundary; the meaning of the
/// JSON inside is checked by <c>MongoConsoleGuard</c> in the KeshavSingh.Mongo.NoSql package.
/// </summary>
public sealed record DbFindRequest(
    [Required, MaxLength(120)] string Collection,
    [MaxLength(8_000)] string? Filter,
    [MaxLength(2_000)] string? Projection,
    [MaxLength(2_000)] string? Sort,
    [Range(0, 100_000)] int? Skip,
    [Range(1, 500)] int? Limit);

public sealed record DbCountRequest(
    [Required, MaxLength(120)] string Collection,
    [MaxLength(8_000)] string? Filter);

public sealed record DbAggregateRequest(
    [Required, MaxLength(120)] string Collection,
    [Required, MaxLength(16_000)] string Pipeline,
    [Range(1, 500)] int? Limit);

public sealed record DbDistinctRequest(
    [Required, MaxLength(120)] string Collection,
    [Required, MaxLength(120)] string Field,
    [MaxLength(8_000)] string? Filter);

public sealed record DbInsertRequest(
    [Required, MaxLength(120)] string Collection,
    [Required, MaxLength(262_144)] string Document);

public sealed record DbUpdateRequest(
    [Required, MaxLength(120)] string Collection,
    [Required, MaxLength(256)] string Id,
    [Required, MaxLength(262_144)] string Update);

public sealed record DbDeleteRequest(
    [Required, MaxLength(120)] string Collection,
    [Required, MaxLength(256)] string Id);

/// <summary>What the console page can offer, so the UI doesn't present buttons the API will refuse.</summary>
public sealed record DbConsoleCapabilities(bool CanWrite, int DefaultLimit, int MaxLimit, string Database);
