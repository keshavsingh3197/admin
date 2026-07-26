using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

public class NoteService
{
    private readonly IMongoCollection<Note> _notes;

    public NoteService(MongoDbService mongoDbService)
    {
        _notes = mongoDbService.GetCollection<Note>("notes");
    }

    public async Task<List<Note>> GetAllAsync() =>
        await _notes.Find(_ => true).SortByDescending(n => n.CreatedAt).ToListAsync();

    public async Task<Note?> GetByIdAsync(string id) =>
        await _notes.Find(n => n.Id == id).FirstOrDefaultAsync();

    public async Task<Note> CreateAsync(Note note)
    {
        note.CreatedAt = DateTime.UtcNow;
        note.UpdatedAt = DateTime.UtcNow;
        await _notes.InsertOneAsync(note);
        return note;
    }

    public async Task<bool> UpdateAsync(string id, Note note)
    {
        note.UpdatedAt = DateTime.UtcNow;
        var result = await _notes.ReplaceOneAsync(n => n.Id == id, note);
        return result.IsAcknowledged && result.ModifiedCount > 0;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var result = await _notes.DeleteOneAsync(n => n.Id == id);
        return result.IsAcknowledged && result.DeletedCount > 0;
    }
}
