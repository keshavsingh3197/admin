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
}