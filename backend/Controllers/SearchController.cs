using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>Cross-entity admin search ("visit" a matching Note/User/Website/Role/Group).</summary>
[ApiController]
[Route("api/search")]
[Authorize]
public sealed class SearchController : ControllerBase
{
    private readonly SearchService _search;

    public SearchController(SearchService search)
    {
        _search = search;
    }

    [HttpGet]
    public async Task<ActionResult<SearchResponseDto>> Get([FromQuery] string q, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q)) return Ok(new SearchResponseDto(Array.Empty<SearchResultDto>()));
        var isAdmin = User.IsInRole(Roles.Admin);
        var results = await _search.SearchAsync(q, isAdmin, ct);
        return Ok(new SearchResponseDto(results));
    }
}
