using System.Text.RegularExpressions;
using Admin.Api.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Admin.Api.Services;

public sealed record UpsertChannelVideoRequest(
    string VideoId,
    string Title,
    string? Description = null,
    string? Url = null,
    string? ThumbnailUrl = null,
    string? ChannelKey = null,
    string? ChannelName = null,
    string? ChannelHandle = null,
    string? Platform = null,
    string? Niche = null,
    string? Language = null,
    string? Format = null,
    string? SourceApp = null,
    string? AutomationSourceType = null,
    int DurationSeconds = 0,
    long Views = 0,
    double ViewsPerSubscriber = 0,
    IReadOnlyList<string>? Tags = null,
    DateTime? PublishedAtUtc = null);

public sealed record ChannelVideoSearchQuery(
    string? Q = null,
    string? Channel = null,
    string? Niche = null,
    string? Locale = null,
    string? Format = null,
    int Skip = 0,
    int Limit = 24);

public sealed record ChannelVideoFacetItem(string Value, string Label, int Count);

public sealed record ChannelVideoFacets(
    IReadOnlyList<ChannelVideoFacetItem> Channels,
    IReadOnlyList<ChannelVideoFacetItem> Niches,
    IReadOnlyList<ChannelVideoFacetItem> Languages,
    IReadOnlyList<ChannelVideoFacetItem> Formats);

public sealed record ChannelVideoSearchResponse(
    IReadOnlyList<ChannelVideo> Items,
    long Total,
    ChannelVideoFacets Facets);

/// <summary>
/// Manages the central <c>AdminDb.channel_videos</c> search catalog with indexed search and facet counts.
/// </summary>
public sealed partial class ChannelVideoService
{
    private readonly IMongoCollection<ChannelVideo> _videos;

    public ChannelVideoService(MongoDbService db)
    {
        _videos = db.GetCollection<ChannelVideo>("channel_videos");
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _videos.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<ChannelVideo>(
                Builders<ChannelVideo>.IndexKeys.Ascending(x => x.VideoId),
                new CreateIndexOptions { Unique = true, Name = "ux_channel_videos_video_id" }),
            new CreateIndexModel<ChannelVideo>(
                Builders<ChannelVideo>.IndexKeys
                    .Ascending(x => x.IsRemoved)
                    .Descending(x => x.PublishedAtUtc),
                new CreateIndexOptions { Name = "ix_channel_videos_active_published" }),
            new CreateIndexModel<ChannelVideo>(
                Builders<ChannelVideo>.IndexKeys
                    .Ascending(x => x.ChannelHandle)
                    .Ascending(x => x.Language)
                    .Ascending(x => x.Format)
                    .Ascending(x => x.IsRemoved),
                new CreateIndexOptions { Name = "ix_channel_videos_facets" }),
            new CreateIndexModel<ChannelVideo>(
                Builders<ChannelVideo>.IndexKeys
                    .Text(x => x.Title)
                    .Text(x => x.Description)
                    .Text(x => x.ChannelName)
                    .Text(x => x.ChannelHandle)
                    .Text(x => x.Niche)
                    .Text(x => x.Tags),
                new CreateIndexOptions { Name = "tx_channel_videos_search" }),
        ], ct);
    }

    public async Task<ChannelVideo> UpsertAsync(UpsertChannelVideoRequest request, CancellationToken ct = default)
    {
        var doc = NormalizeForStorage(request);
        var filter = Builders<ChannelVideo>.Filter.Eq(x => x.VideoId, doc.VideoId);
        var existing = await _videos.Find(filter).FirstOrDefaultAsync(ct);
        if (existing is not null)
        {
            doc.Id = existing.Id;
            if (doc.Views <= 0 && existing.Views > 0) doc.Views = existing.Views;
            if (doc.DurationSeconds <= 0 && existing.DurationSeconds > 0) doc.DurationSeconds = existing.DurationSeconds;
            if (string.IsNullOrWhiteSpace(doc.Niche)) doc.Niche = existing.Niche;
        }

        await _videos.ReplaceOneAsync(filter, doc, new ReplaceOptions { IsUpsert = true }, ct);
        return doc;
    }

    public async Task<int> UpsertBatchAsync(IEnumerable<UpsertChannelVideoRequest> requests, CancellationToken ct = default)
    {
        var list = requests
            .Where(r => r is not null && !string.IsNullOrWhiteSpace(r.VideoId) && !string.IsNullOrWhiteSpace(r.Title))
            .ToList();
        if (list.Count == 0) return 0;

        var ops = new List<WriteModel<ChannelVideo>>(list.Count);
        foreach (var req in list)
        {
            var doc = NormalizeForStorage(req);
            var update = Builders<ChannelVideo>.Update
                .SetOnInsert(x => x.Id, doc.Id)
                .Set(x => x.VideoId, doc.VideoId)
                .Set(x => x.Title, doc.Title)
                .Set(x => x.Description, doc.Description)
                .Set(x => x.Url, doc.Url)
                .Set(x => x.ThumbnailUrl, doc.ThumbnailUrl)
                .Set(x => x.ChannelKey, doc.ChannelKey)
                .Set(x => x.ChannelName, doc.ChannelName)
                .Set(x => x.ChannelHandle, doc.ChannelHandle)
                .Set(x => x.Platform, doc.Platform)
                .Set(x => x.Niche, doc.Niche)
                .Set(x => x.Language, doc.Language)
                .Set(x => x.Format, doc.Format)
                .Set(x => x.SourceApp, doc.SourceApp)
                .Set(x => x.AutomationSourceType, doc.AutomationSourceType)
                .Set(x => x.DurationSeconds, doc.DurationSeconds)
                .Set(x => x.Views, doc.Views)
                .Set(x => x.ViewsPerSubscriber, doc.ViewsPerSubscriber)
                .Set(x => x.Tags, doc.Tags)
                .Set(x => x.PublishedAtUtc, doc.PublishedAtUtc)
                .Set(x => x.UpdatedAtUtc, doc.UpdatedAtUtc)
                .Set(x => x.IsRemoved, false);

            ops.Add(new UpdateOneModel<ChannelVideo>(
                Builders<ChannelVideo>.Filter.Eq(x => x.VideoId, doc.VideoId),
                update)
            { IsUpsert = true });
        }

        await _videos.BulkWriteAsync(ops, new BulkWriteOptions { IsOrdered = false }, ct);
        return ops.Count;
    }

    public async Task<bool> MarkRemovedAsync(string videoId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return false;
        var cleanId = videoId.Trim();
        var result = await _videos.UpdateOneAsync(
            Builders<ChannelVideo>.Filter.Eq(x => x.VideoId, cleanId),
            Builders<ChannelVideo>.Update
                .Set(x => x.IsRemoved, true)
                .Set(x => x.UpdatedAtUtc, DateTime.UtcNow),
            cancellationToken: ct);
        return result.ModifiedCount > 0;
    }

    public async Task<ChannelVideoSearchResponse> SearchAsync(
        ChannelVideoSearchQuery query,
        CancellationToken ct = default)
    {
        var activeFilter = Builders<ChannelVideo>.Filter.Eq(x => x.IsRemoved, false);
        var filters = new List<FilterDefinition<ChannelVideo>> { activeFilter };

        if (!string.IsNullOrWhiteSpace(query.Channel))
        {
            var ch = query.Channel.Trim();
            var rx = new BsonRegularExpression("^" + Regex.Escape(ch.TrimStart('@')), "i");
            filters.Add(Builders<ChannelVideo>.Filter.Or(
                Builders<ChannelVideo>.Filter.Regex(x => x.ChannelHandle, new BsonRegularExpression("^@?" + Regex.Escape(ch.TrimStart('@')) + "$", "i")),
                Builders<ChannelVideo>.Filter.Regex(x => x.ChannelKey, rx),
                Builders<ChannelVideo>.Filter.Regex(x => x.ChannelName, new BsonRegularExpression(Regex.Escape(ch), "i"))));
        }

        if (!string.IsNullOrWhiteSpace(query.Niche))
        {
            var nicheRx = new BsonRegularExpression(Regex.Escape(query.Niche.Trim()), "i");
            filters.Add(Builders<ChannelVideo>.Filter.Regex(x => x.Niche, nicheRx));
        }

        if (!string.IsNullOrWhiteSpace(query.Locale) && !query.Locale.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            filters.Add(Builders<ChannelVideo>.Filter.Eq(x => x.Language, NormalizeLanguage(query.Locale)));
        }

        if (!string.IsNullOrWhiteSpace(query.Format) && !query.Format.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            filters.Add(Builders<ChannelVideo>.Filter.Eq(x => x.Format, NormalizeFormat(query.Format)));
        }

        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var q = query.Q.Trim();
            var rx = new BsonRegularExpression(Regex.Escape(q), "i");
            filters.Add(Builders<ChannelVideo>.Filter.Or(
                Builders<ChannelVideo>.Filter.Regex(x => x.Title, rx),
                Builders<ChannelVideo>.Filter.Regex(x => x.Description, rx),
                Builders<ChannelVideo>.Filter.Regex(x => x.ChannelName, rx),
                Builders<ChannelVideo>.Filter.Regex(x => x.ChannelHandle, rx),
                Builders<ChannelVideo>.Filter.Regex(x => x.Niche, rx),
                Builders<ChannelVideo>.Filter.AnyEq(x => x.Tags, q.ToLowerInvariant())));
        }

        var combined = Builders<ChannelVideo>.Filter.And(filters);
        var limit = Math.Clamp(query.Limit, 1, 60);
        var skip = Math.Max(0, query.Skip);

        var totalTask = _videos.CountDocumentsAsync(combined, cancellationToken: ct);
        var itemsTask = _videos.Find(combined)
            .SortByDescending(x => x.PublishedAtUtc)
            .ThenByDescending(x => x.Views)
            .Skip(skip)
            .Limit(limit)
            .ToListAsync(ct);

        // Lightweight facet projection across active catalog
        var facetRowsTask = _videos.Find(activeFilter)
            .Limit(500)
            .ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask, facetRowsTask);
        return new ChannelVideoSearchResponse(itemsTask.Result, totalTask.Result, BuildFacets(facetRowsTask.Result));
    }

    public static ChannelVideoSearchResponse SearchInMemory(
        IEnumerable<ChannelVideo> source,
        ChannelVideoSearchQuery query)
    {
        var active = (source ?? []).Where(v => !v.IsRemoved).ToList();
        var filtered = active
            .Where(v => MatchesFilter(v, query))
            .OrderByDescending(v => v.PublishedAtUtc)
            .ThenByDescending(v => v.Views)
            .ToList();

        var limit = Math.Clamp(query.Limit, 1, 60);
        var skip = Math.Max(0, query.Skip);
        var page = filtered.Skip(skip).Take(limit).ToList();
        return new ChannelVideoSearchResponse(page, filtered.Count, BuildFacets(active));
    }

    public static bool MatchesFilter(ChannelVideo v, ChannelVideoSearchQuery query)
    {
        if (v.IsRemoved) return false;

        if (!string.IsNullOrWhiteSpace(query.Channel))
        {
            var target = query.Channel.Trim().TrimStart('@');
            var handleMatch = v.ChannelHandle.TrimStart('@').Equals(target, StringComparison.OrdinalIgnoreCase);
            var keyMatch = v.ChannelKey.Equals(target, StringComparison.OrdinalIgnoreCase);
            var nameMatch = v.ChannelName.Contains(query.Channel.Trim(), StringComparison.OrdinalIgnoreCase);
            if (!handleMatch && !keyMatch && !nameMatch) return false;
        }

        if (!string.IsNullOrWhiteSpace(query.Niche) &&
            !v.Niche.Contains(query.Niche.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!string.IsNullOrWhiteSpace(query.Locale) &&
            !query.Locale.Equals("all", StringComparison.OrdinalIgnoreCase) &&
            !v.Language.Equals(NormalizeLanguage(query.Locale), StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!string.IsNullOrWhiteSpace(query.Format) &&
            !query.Format.Equals("all", StringComparison.OrdinalIgnoreCase) &&
            !v.Format.Equals(NormalizeFormat(query.Format), StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var q = query.Q.Trim();
            var match = v.Title.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                        v.Description.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                        v.ChannelName.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                        v.ChannelHandle.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                        v.Niche.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                        v.Tags.Any(t => t.Contains(q, StringComparison.OrdinalIgnoreCase));
            if (!match) return false;
        }

        return true;
    }

    public static ChannelVideo NormalizeForStorage(UpsertChannelVideoRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.VideoId))
            throw new ArgumentException("VideoId is required.", nameof(req));
        if (string.IsNullOrWhiteSpace(req.Title))
            throw new ArgumentException("Title is required.", nameof(req));

        var videoId = req.VideoId.Trim();
        var rawUrl = (req.Url ?? string.Empty).Trim();
        var isShort = rawUrl.Contains("/shorts/", StringComparison.OrdinalIgnoreCase) ||
                      string.Equals(req.Format, "Short", StringComparison.OrdinalIgnoreCase);

        var safeUrl = CanonicalVideoUrl(videoId, rawUrl, isShort);
        var thumb = !string.IsNullOrWhiteSpace(req.ThumbnailUrl) &&
                    Uri.TryCreate(req.ThumbnailUrl.Trim(), UriKind.Absolute, out var tUri) &&
                    tUri.Scheme == Uri.UriSchemeHttps
            ? tUri.AbsoluteUri
            : $"https://i.ytimg.com/vi/{Uri.EscapeDataString(videoId)}/hqdefault.jpg";

        var handle = (req.ChannelHandle ?? string.Empty).Trim();
        if (!string.IsNullOrEmpty(handle) && !handle.StartsWith('@'))
            handle = "@" + handle;

        var key = !string.IsNullOrWhiteSpace(req.ChannelKey)
            ? req.ChannelKey.Trim().ToLowerInvariant()
            : handle.TrimStart('@').ToLowerInvariant();

        var tags = (req.Tags ?? [])
            .Select(t => (t ?? string.Empty).Trim().TrimStart('#').ToLowerInvariant())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(15)
            .ToList();

        return new ChannelVideo
        {
            Id = $"vid:{videoId}",
            VideoId = videoId,
            Title = req.Title.Trim()[..Math.Min(req.Title.Trim().Length, 200)],
            Description = (req.Description ?? string.Empty).Trim() is { Length: > 1000 } d ? d[..1000] : (req.Description ?? string.Empty).Trim(),
            Url = safeUrl,
            ThumbnailUrl = thumb,
            ChannelKey = key,
            ChannelName = (req.ChannelName ?? string.Empty).Trim(),
            ChannelHandle = handle,
            Platform = string.IsNullOrWhiteSpace(req.Platform) ? "YouTube" : req.Platform.Trim(),
            Niche = (req.Niche ?? string.Empty).Trim(),
            Language = NormalizeLanguage(req.Language),
            Format = NormalizeFormat(req.Format, isShort),
            SourceApp = string.IsNullOrWhiteSpace(req.SourceApp) ? "Admin" : req.SourceApp.Trim(),
            AutomationSourceType = string.IsNullOrWhiteSpace(req.AutomationSourceType) ? null : req.AutomationSourceType.Trim(),
            DurationSeconds = Math.Max(0, req.DurationSeconds),
            Views = Math.Max(0, req.Views),
            ViewsPerSubscriber = Math.Max(0, Math.Round(req.ViewsPerSubscriber, 2)),
            Tags = tags,
            PublishedAtUtc = (req.PublishedAtUtc ?? DateTime.UtcNow).ToUniversalTime(),
            UpdatedAtUtc = DateTime.UtcNow,
            IsRemoved = false
        };
    }

    private static string CanonicalVideoUrl(string videoId, string rawUrl, bool isShort)
    {
        if (Uri.TryCreate(rawUrl, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps)
            return uri.AbsoluteUri;

        return isShort
            ? $"https://www.youtube.com/shorts/{Uri.EscapeDataString(videoId)}"
            : $"https://www.youtube.com/watch?v={Uri.EscapeDataString(videoId)}";
    }

    private static string NormalizeLanguage(string? raw)
    {
        var lang = (raw ?? "hi").Trim().ToLowerInvariant();
        return lang.StartsWith("en", StringComparison.Ordinal) ? "en" : "hi";
    }

    private static string NormalizeFormat(string? raw, bool fallbackShort = false)
    {
        var f = (raw ?? string.Empty).Trim().ToLowerInvariant();
        if (f is "short" or "shorts" or "vertical") return "Short";
        if (f is "video" or "long" or "landscape" or "compilation") return "Video";
        return fallbackShort ? "Short" : "Video";
    }

    private static ChannelVideoFacets BuildFacets(IReadOnlyList<ChannelVideo> active)
    {
        var channels = active
            .Where(x => !string.IsNullOrWhiteSpace(x.ChannelHandle) || !string.IsNullOrWhiteSpace(x.ChannelName))
            .GroupBy(x => !string.IsNullOrWhiteSpace(x.ChannelHandle) ? x.ChannelHandle : x.ChannelName, StringComparer.OrdinalIgnoreCase)
            .Select(g => new ChannelVideoFacetItem(
                g.Key,
                g.Select(x => x.ChannelName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? g.Key,
                g.Count()))
            .OrderByDescending(x => x.Count)
            .ToList();

        var niches = active
            .Where(x => !string.IsNullOrWhiteSpace(x.Niche))
            .GroupBy(x => x.Niche, StringComparer.OrdinalIgnoreCase)
            .Select(g => new ChannelVideoFacetItem(g.Key, g.Key, g.Count()))
            .OrderByDescending(x => x.Count)
            .Take(20)
            .ToList();

        var languages = active
            .GroupBy(x => x.Language, StringComparer.OrdinalIgnoreCase)
            .Select(g => new ChannelVideoFacetItem(g.Key, g.Key.Equals("hi", StringComparison.OrdinalIgnoreCase) ? "हिन्दी (Hindi)" : "English", g.Count()))
            .OrderByDescending(x => x.Count)
            .ToList();

        var formats = active
            .GroupBy(x => x.Format, StringComparer.OrdinalIgnoreCase)
            .Select(g => new ChannelVideoFacetItem(g.Key, g.Key, g.Count()))
            .OrderByDescending(x => x.Count)
            .ToList();

        return new ChannelVideoFacets(channels, niches, languages, formats);
    }
}
