using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>Runtime auth-security settings for the identity provider (Admin only).</summary>
[ApiController]
[Route("api/settings")]
[Authorize(Roles = Roles.Admin)]
public sealed class SettingsController : ControllerBase
{
    private readonly SettingsService _settings;
    public SettingsController(SettingsService settings) => _settings = settings;

    [HttpGet]
    public ActionResult<SettingsView> Get() => Ok(_settings.ToView());

    [HttpPut]
    public async Task<ActionResult<SettingsView>> Update(UpdateSettingsRequest request)
        => Ok(await _settings.ApplyAsync(request));
}
