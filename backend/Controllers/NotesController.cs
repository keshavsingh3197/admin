using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // Default-deny: notes are personal data — every endpoint requires a valid session.
public class NotesController : ControllerBase
{
    private readonly NoteService _noteService;
    private readonly ILogger<NotesController> _logger;

    public NotesController(NoteService noteService, ILogger<NotesController> logger)
    {
        _noteService = noteService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<Note>>> GetAll() =>
        Ok(await _noteService.GetAllAsync(User.GetUserId()));

    [HttpGet("{id}")]
    public async Task<ActionResult<Note>> GetById(string id)
    {
        var note = await _noteService.GetByIdAsync(id, User.GetUserId());
        return note is null ? NotFound() : Ok(note);
    }

    [HttpPost]
    public async Task<ActionResult<Note>> Create([FromBody] Note note)
    {
        if (string.IsNullOrWhiteSpace(note.Title) || string.IsNullOrWhiteSpace(note.Content))
            return BadRequest("Title and content are required.");

        var created = await _noteService.CreateAsync(note, User.GetUserId());
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] Note note)
    {
        var userId = User.GetUserId();
        var existing = await _noteService.GetByIdAsync(id, userId);
        if (existing is null) return NotFound();
        if (string.IsNullOrWhiteSpace(note.Title) || string.IsNullOrWhiteSpace(note.Content))
            return BadRequest("Title and content are required.");

        note.CreatedAt = existing.CreatedAt;
        var updated = await _noteService.UpdateAsync(id, userId, note);
        if (!updated)
        {
            _logger.LogWarning("Update operation for note {NoteId} was acknowledged but modified 0 documents.", id);
            return StatusCode(500, "The note could not be updated. It may have been modified concurrently.");
        }

        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var deleted = await _noteService.DeleteAsync(id, User.GetUserId());
        return deleted ? NoContent() : NotFound();
    }
}
