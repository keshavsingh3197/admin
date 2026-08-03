using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Persistence for the family-finance feature. Every record is personal data, scoped to its
/// <c>OwnerUserId</c> (the signed-in user) — the controller passes that id in and never lets one
/// owner read another's data. All financial reasoning lives in the <c>KeshavSingh.Finance</c>
/// package; this service only stores/loads documents and assembles the snapshot for it.
/// </summary>
public class FinanceService
{
    private readonly IMongoCollection<Household> _households;
    private readonly IMongoCollection<FamilyMember> _members;
    private readonly IMongoCollection<IncomeSource> _income;
    private readonly IMongoCollection<Expense> _expenses;
    private readonly IMongoCollection<Investment> _investments;
    private readonly IMongoCollection<Liability> _liabilities;
    private readonly IMongoCollection<FinancialGoal> _goals;

    public FinanceService(MongoDbService db)
    {
        _households = db.GetCollection<Household>("finance_households");
        _members = db.GetCollection<FamilyMember>("finance_members");
        _income = db.GetCollection<IncomeSource>("finance_income");
        _expenses = db.GetCollection<Expense>("finance_expenses");
        _investments = db.GetCollection<Investment>("finance_investments");
        _liabilities = db.GetCollection<Liability>("finance_liabilities");
        _goals = db.GetCollection<FinancialGoal>("finance_goals");
        EnsureIndexes();
    }

    private void EnsureIndexes()
    {
        // One household per owner; owner-scoped lookups for every child record.
        _households.Indexes.CreateOne(new CreateIndexModel<Household>(
            Builders<Household>.IndexKeys.Ascending(h => h.OwnerUserId),
            new CreateIndexOptions { Unique = true, Name = "ux_finance_household_owner" }));
        Index(_members); Index(_income); Index(_expenses);
        Index(_investments); Index(_liabilities); Index(_goals);

        static void Index<T>(IMongoCollection<T> col) where T : IOwnedRecord =>
            col.Indexes.CreateOne(new CreateIndexModel<T>(
                Builders<T>.IndexKeys.Ascending(x => x.OwnerUserId),
                new CreateIndexOptions { Name = "ix_owner" }));
    }

    // ---- Household (singleton per owner) ----

    public async Task<Household> GetOrCreateHouseholdAsync(string owner)
    {
        var existing = await _households.Find(h => h.OwnerUserId == owner).FirstOrDefaultAsync();
        if (existing is not null) return existing;

        var household = new Household { OwnerUserId = owner };
        try
        {
            await _households.InsertOneAsync(household);
            return household;
        }
        catch (MongoWriteException e) when (e.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            // Raced a concurrent first request for the same owner; the unique index won.
            return await _households.Find(h => h.OwnerUserId == owner).FirstOrDefaultAsync() ?? household;
        }
    }

    public async Task<Household> UpdateHouseholdAsync(string owner, string? name, string? currency, int? emergencyMonths)
    {
        var h = await GetOrCreateHouseholdAsync(owner);
        if (!string.IsNullOrWhiteSpace(name)) h.Name = name.Trim();
        if (!string.IsNullOrWhiteSpace(currency)) h.Currency = currency.Trim().ToUpperInvariant();
        if (emergencyMonths is { } m) h.EmergencyFundTargetMonths = m;
        h.UpdatedAt = DateTime.UtcNow;
        await _households.ReplaceOneAsync(x => x.OwnerUserId == owner && x.Id == h.Id, h);
        return h;
    }

    // ---- Generic owner-scoped CRUD for the child collections ----

    public Task<List<T>> ListAsync<T>(string owner) where T : IOwnedRecord =>
        Col<T>().Find(x => x.OwnerUserId == owner).ToListAsync();

    public async Task<T> CreateAsync<T>(string owner, T doc) where T : IOwnedRecord
    {
        doc.OwnerUserId = owner;
        doc.UpdatedAt = DateTime.UtcNow;
        await Col<T>().InsertOneAsync(doc);
        return doc;
    }

    public async Task<T?> UpdateAsync<T>(string owner, string id, Action<T> mutate) where T : IOwnedRecord
    {
        var col = Col<T>();
        var doc = await col.Find(x => x.OwnerUserId == owner && x.Id == id).FirstOrDefaultAsync();
        if (doc is null) return default;
        mutate(doc);
        doc.UpdatedAt = DateTime.UtcNow;
        await col.ReplaceOneAsync(x => x.OwnerUserId == owner && x.Id == id, doc);
        return doc;
    }

    public async Task<bool> DeleteAsync<T>(string owner, string id) where T : IOwnedRecord
    {
        var result = await Col<T>().DeleteOneAsync(x => x.OwnerUserId == owner && x.Id == id);
        return result.IsAcknowledged && result.DeletedCount > 0;
    }

    // ---- Snapshot for the advisory engine ----

    public async Task<HouseholdSnapshot> BuildSnapshotAsync(string owner) => new()
    {
        Household = await GetOrCreateHouseholdAsync(owner),
        Members = await ListAsync<FamilyMember>(owner),
        Income = await ListAsync<IncomeSource>(owner),
        Expenses = await ListAsync<Expense>(owner),
        Investments = await ListAsync<Investment>(owner),
        Liabilities = await ListAsync<Liability>(owner),
        Goals = await ListAsync<FinancialGoal>(owner),
    };

    private IMongoCollection<T> Col<T>() where T : IOwnedRecord
    {
        object col = typeof(T) switch
        {
            var t when t == typeof(FamilyMember) => _members,
            var t when t == typeof(IncomeSource) => _income,
            var t when t == typeof(Expense) => _expenses,
            var t when t == typeof(Investment) => _investments,
            var t when t == typeof(Liability) => _liabilities,
            var t when t == typeof(FinancialGoal) => _goals,
            var t when t == typeof(Household) => _households,
            _ => throw new InvalidOperationException($"No finance collection for {typeof(T).Name}."),
        };
        return (IMongoCollection<T>)col;
    }
}
