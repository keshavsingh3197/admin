using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

[ApiController]
[Route("api/packages")]
[Authorize(Roles = Roles.Admin)]
public sealed class PackagesController : ControllerBase
{
    private readonly PackageInventoryService _inventory;

    public PackagesController(PackageInventoryService inventory)
    {
        _inventory = inventory;
    }

    [HttpGet]
    public async Task<ActionResult<PackageInventoryDto>> Get([FromQuery] bool refresh, CancellationToken cancellationToken) =>
        Ok(await _inventory.GetAsync(refresh, cancellationToken));

    /// <summary>
    /// Every repository the configured GitHub token can see, for the Settings screen's repository
    /// picker. Optionally narrowed by <paramref name="query"/> so a long list stays searchable; the
    /// scan itself only ever reads the repositories that were then selected and saved.
    /// </summary>
    [HttpGet("repositories")]
    public async Task<ActionResult<IReadOnlyList<string>>> Repositories([FromQuery] string? query, CancellationToken ct)
    {
        var all = await _inventory.ListAvailableRepositoriesAsync(ct);
        var trimmed = query?.Trim();
        return Ok(string.IsNullOrEmpty(trimmed)
            ? all
            : all.Where(x => x.Contains(trimmed, StringComparison.OrdinalIgnoreCase)).ToArray());
    }
}