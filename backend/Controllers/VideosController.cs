using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Core;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>
/// Central ecosystem video search catalog powered directly by <c>AdminDb.channel_videos</c>.
/// </summary>
[ApiController]
[Route("api/videos")]
public sealed class VideosController : ControllerBase
{
    private readonly ChannelVideoService _videos;

    public VideosController(ChannelVideoService videos)
    {
        _videos = videos;
    }

    [HttpGet("search")]
    [AllowAnonymous]
    public async Task<ActionResult<ChannelVideoSearchResponse>> Search(
        [FromQuery] string? q = null,
        [FromQuery] string? channel = null,
        [FromQuery] string? niche = null,
        [FromQuery] string? locale = null,
        [FromQuery] string? format = null,
        [FromQuery] int skip = 0,
        [FromQuery] int limit = 24,
        CancellationToken ct = default)
    {
        var res = await _videos.SearchAsync(
            new ChannelVideoSearchQuery(q, channel, niche, locale, format, skip, limit),
            ct);
        return Ok(res);
    }

    [HttpPost("sync")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<object>> SyncBatch(
        [FromBody] IReadOnlyList<UpsertChannelVideoRequest> videos,
        CancellationToken ct = default)
    {
        try
        {
            var upserted = await _videos.UpsertBatchAsync(videos, ct);
            return Ok(new { upserted });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{videoId}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Remove(string videoId, CancellationToken ct = default)
    {
        var removed = await _videos.MarkRemovedAsync(videoId, ct);
        return removed ? NoContent() : NotFound();
    }
}
