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

    public async Task<List<Note>> GetAllAsync(string userId) =>
        await _notes.Find(n => n.UserId == userId).SortByDescending(n => n.UpdatedAt).ToListAsync();

    public async Task<Note?> GetByIdAsync(string id, string userId) =>
        await _notes.Find(n => n.Id == id && n.UserId == userId).FirstOrDefaultAsync();

    public async Task<Note> CreateAsync(Note note, string userId)
    {
        note.Id = null;
        note.UserId = userId;
        note.CreatedAt = DateTime.UtcNow;
        note.UpdatedAt = DateTime.UtcNow;
        await _notes.InsertOneAsync(note);
        return note;
    }

    public async Task<bool> UpdateAsync(string id, string userId, Note note)
    {
        note.Id = id;
        note.UserId = userId;
        note.UpdatedAt = DateTime.UtcNow;
        var result = await _notes.ReplaceOneAsync(n => n.Id == id && n.UserId == userId, note);
        return result.IsAcknowledged && result.ModifiedCount > 0;
    }

    public async Task<bool> DeleteAsync(string id, string userId)
    {
        var result = await _notes.DeleteOneAsync(n => n.Id == id && n.UserId == userId);
        return result.IsAcknowledged && result.DeletedCount > 0;
    }
}
