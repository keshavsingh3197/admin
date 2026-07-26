using Admin.Api.Models;
using Admin.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class NotesController : ControllerBase
{
    private readonly NoteService _noteService;

    public NotesController(NoteService noteService)
    {
        _noteService = noteService;
    }

    [HttpGet]
    public async Task<ActionResult<List<Note>>> GetAll() =>
        Ok(await _noteService.GetAllAsync());

    [HttpGet("{id}")]
    public async Task<ActionResult<Note>> GetById(string id)
    {
        var note = await _noteService.GetByIdAsync(id);
        return note is null ? NotFound() : Ok(note);
    }

    [HttpPost]
    public async Task<ActionResult<Note>> Create([FromBody] Note note)
    {
        var created = await _noteService.CreateAsync(note);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] Note note)
    {
        var existing = await _noteService.GetByIdAsync(id);
        if (existing is null) return NotFound();

        note.Id = id;
        var updated = await _noteService.UpdateAsync(id, note);
        return updated ? NoContent() : StatusCode(500, "Update failed.");
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var deleted = await _noteService.DeleteAsync(id);
        return deleted ? NoContent() : NotFound();
    }
}
