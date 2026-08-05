using Admin.Api.Dtos;
using ClosedXML.Excel;
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
    private readonly IMongoCollection<Transaction> _transactions;

    public FinanceService(MongoDbService db)
    {
        _households = db.GetCollection<Household>("finance_households");
        _members = db.GetCollection<FamilyMember>("finance_members");
        _income = db.GetCollection<IncomeSource>("finance_income");
        _expenses = db.GetCollection<Expense>("finance_expenses");
        _investments = db.GetCollection<Investment>("finance_investments");
        _liabilities = db.GetCollection<Liability>("finance_liabilities");
        _goals = db.GetCollection<FinancialGoal>("finance_goals");
        _transactions = db.GetCollection<Transaction>("finance_transactions");
        EnsureIndexes();
    }

    private void EnsureIndexes()
    {
        // One household per owner; owner-scoped lookups for every child record.
        _households.Indexes.CreateOne(new CreateIndexModel<Household>(
            Builders<Household>.IndexKeys.Ascending(h => h.OwnerUserId),
            new CreateIndexOptions { Unique = true, Name = "ux_finance_household_owner" }));
        Index(_members); Index(_income); Index(_expenses);
        Index(_investments); Index(_liabilities); Index(_goals); Index(_transactions);

        // Transactions are listed newest-first and can grow large: compound owner+date index.
        _transactions.Indexes.CreateOne(new CreateIndexModel<Transaction>(
            Builders<Transaction>.IndexKeys.Ascending(t => t.OwnerUserId).Descending(t => t.Date),
            new CreateIndexOptions { Name = "ix_owner_date" }));

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
            var t when t == typeof(Transaction) => _transactions,
            var t when t == typeof(Household) => _households,
            _ => throw new InvalidOperationException($"No finance collection for {typeof(T).Name}."),
        };
        return (IMongoCollection<T>)col;
    }

    // ---- Transactions (ledger; paginated, newest first) ----

    public async Task<(List<Transaction> Items, long Total)> ListTransactionsAsync(string owner, int skip, int limit)
    {
        var filter = Builders<Transaction>.Filter.Eq(t => t.OwnerUserId, owner);
        var total = await _transactions.CountDocumentsAsync(filter);
        var items = await _transactions.Find(filter)
            .SortByDescending(t => t.Date).ThenByDescending(t => t.CreatedAt)
            .Skip(Math.Max(0, skip)).Limit(Math.Clamp(limit, 1, 200))
            .ToListAsync();
        return (items, total);
    }

    /// <summary>Imports a bank statement CSV using the package's pure parser. Returns counts.</summary>
    public Task<(int Imported, int Skipped)> ImportTransactionsAsync(string owner, string csv, BankCsvMapping map) =>
        SaveParsedAsync(owner, BankStatementParser.ParseCsv(csv, map));

    /// <summary>
    /// Imports a statement workbook (.xlsx) — many banks only offer Excel. Cells are read as text so the
    /// package's parser does the messy date/amount normalisation, exactly as it does for CSV.
    /// </summary>
    public Task<(int Imported, int Skipped)> ImportWorkbookAsync(string owner, Stream xlsx, BankCsvMapping map)
    {
        using var wb = new XLWorkbook(xlsx);
        var sheet = wb.Worksheets.First();
        var used = sheet.RangeUsed();
        if (used is null) return Task.FromResult((0, 0));

        var rows = used.RowsUsed()
            .Select(row => (IReadOnlyList<string>)row.Cells().Select(c => c.GetFormattedString()).ToList())
            .ToList();
        return SaveParsedAsync(owner, BankStatementParser.Parse(rows, map));
    }

    /// <summary>
    /// Imports a statement PDF — the format most banks actually email, usually password protected. The
    /// table is recovered by <see cref="PdfStatementReader"/> and then goes through the same package
    /// parser as CSV and .xlsx. The password is used to open the stream and never leaves this call.
    /// </summary>
    public Task<(int Imported, int Skipped)> ImportPdfAsync(string owner, Stream pdf, string? password, BankCsvMapping map)
    {
        var grid = PdfStatementReader.Read(pdf, password);
        return SaveParsedAsync(owner, BankStatementParser.Parse(MergeWrappedRows(grid.Rows, map), map));
    }

    /// <summary>
    /// A PDF wraps long narration onto its own line with every other column blank. Those lines belong to
    /// the transaction above, so they are folded back into its description before parsing — otherwise the
    /// second half of a payee's name would just be dropped as an unparseable row.
    /// </summary>
    private static List<IReadOnlyList<string>> MergeWrappedRows(
        IReadOnlyList<IReadOnlyList<string>> rows, BankCsvMapping map)
    {
        var merged = new List<List<string>>();

        foreach (var row in rows)
        {
            var isWrap = merged.Count > 0
                && string.IsNullOrWhiteSpace(Cell(row, map.DateColumn))
                && string.IsNullOrWhiteSpace(Cell(row, map.AmountColumn ?? -1))
                && string.IsNullOrWhiteSpace(Cell(row, map.DebitColumn ?? -1))
                && string.IsNullOrWhiteSpace(Cell(row, map.CreditColumn ?? -1))
                && !string.IsNullOrWhiteSpace(Cell(row, map.DescriptionColumn));

            if (!isWrap)
            {
                merged.Add([.. row]);
                continue;
            }

            var previous = merged[^1];
            if (map.DescriptionColumn >= 0 && map.DescriptionColumn < previous.Count)
                previous[map.DescriptionColumn] =
                    $"{previous[map.DescriptionColumn]} {Cell(row, map.DescriptionColumn)}".Trim();
        }

        return merged.Cast<IReadOnlyList<string>>().ToList();

        static string Cell(IReadOnlyList<string> row, int index) =>
            index >= 0 && index < row.Count ? row[index] : string.Empty;
    }

    private async Task<(int Imported, int Skipped)> SaveParsedAsync(string owner, BankParseResult result)
    {
        if (result.Transactions.Count == 0) return (0, result.SkippedRows);

        var docs = result.Transactions.Select(p => new Transaction
        {
            OwnerUserId = owner,
            Date = p.Date.ToDateTime(TimeOnly.MinValue),
            Description = p.Description,
            Amount = p.Amount,
            Direction = p.Direction,
            // Nothing chose a category, so label it from the narration — an uncategorised statement is
            // no use for analysis, and the guess is visible and editable in the ledger.
            Category = p.Category ?? CategoryLabel(p.Description, p.Direction),
            Account = p.Account,
        }).ToList();

        await _transactions.InsertManyAsync(docs);
        return (docs.Count, result.SkippedRows);
    }

    private static string? CategoryLabel(string description, TransactionDirection direction)
    {
        var kind = StatementInsights.Classify(description, direction);
        return kind == StatementEntryKind.Unknown ? null : kind.ToString();
    }

    // ---- Statement analysis ----

    /// <summary>
    /// Runs the package's statement analyser over the owner's ledger for the last
    /// <paramref name="months"/> months: monthly in/out, category split, recurring payments and the
    /// household records those imply. Read-only — suggestions are applied only on request.
    /// </summary>
    public async Task<StatementAnalysis> AnalyzeAsync(string owner, int months)
    {
        var from = DateTime.UtcNow.Date.AddMonths(-Math.Clamp(months, 1, 36));
        var filter = Builders<Transaction>.Filter.Eq(t => t.OwnerUserId, owner)
                     & Builders<Transaction>.Filter.Gte(t => t.Date, from);

        var items = await _transactions.Find(filter)
            .SortBy(t => t.Date)
            .Limit(20_000) // a hard ceiling so one enormous ledger can't exhaust memory
            .ToListAsync();

        return StatementInsights.Analyze(items.Select(t => new StatementEntry(
            DateOnly.FromDateTime(t.Date), t.Description, t.Amount, t.Direction)));
    }

    /// <summary>
    /// Turns accepted suggestions into real records — the "fill in my salary and EMIs from the
    /// statement" step. Duplicates are skipped by label so applying twice doesn't double the household's
    /// income. Amounts are monthly, which is how the analyser reports them.
    /// </summary>
    public async Task<int> ApplySuggestionsAsync(string owner, IEnumerable<AppliedSuggestion> suggestions)
    {
        var created = 0;
        var existingIncome = (await ListAsync<IncomeSource>(owner)).Select(i => i.Label).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var existingDebt = (await ListAsync<Liability>(owner)).Select(l => l.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var existingExpense = (await ListAsync<Expense>(owner)).Select(e => e.Label).ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var s in suggestions)
        {
            var label = s.Label.Trim();
            if (label.Length == 0 || s.MonthlyAmount <= 0m) continue;

            switch (s.Kind)
            {
                case "income" when existingIncome.Add(label):
                    await CreateAsync(owner, new IncomeSource
                    {
                        Label = label,
                        Type = s.IncomeType ?? IncomeType.Other,
                        Frequency = Frequency.Monthly,
                        Amount = s.MonthlyAmount,
                        IsActive = true,
                    });
                    created++;
                    break;

                case "liability" when existingDebt.Add(label):
                    await CreateAsync(owner, new Liability
                    {
                        Name = label,
                        Type = s.DebtType ?? DebtType.Other,
                        // The statement shows the instalment, never the principal or the rate — those
                        // stay at zero for the owner to fill in, rather than being invented here.
                        Outstanding = 0m,
                        InterestRatePct = 0,
                        EmiMonthly = s.MonthlyAmount,
                    });
                    created++;
                    break;

                case "expense" when existingExpense.Add(label):
                    await CreateAsync(owner, new Expense
                    {
                        Label = label,
                        Category = s.ExpenseCategory ?? ExpenseCategory.Other,
                        Frequency = Frequency.Monthly,
                        Amount = s.MonthlyAmount,
                        IsEssential = s.IsEssential,
                    });
                    created++;
                    break;
            }
        }

        return created;
    }

    // ---- Excel (.xlsx) export of everything the owner has ----

    public async Task<byte[]> ExportWorkbookAsync(string owner)
    {
        var s = await BuildSnapshotAsync(owner);
        var (tx, _) = await ListTransactionsAsync(owner, 0, 200);
        var m = HouseholdAnalytics.Compute(s, DateOnly.FromDateTime(DateTime.UtcNow));
        var names = s.Members.ToDictionary(x => x.Id, x => x.Name);
        string Member(string? id) => id is not null && names.TryGetValue(id, out var n) ? n : "Household";

        using var wb = new XLWorkbook();

        WriteSheet(wb, "Summary", ["Metric", "Value"],
        [
            ["Currency", m.Currency],
            ["Net worth", m.NetWorth], ["Total assets", m.TotalAssets], ["Total liabilities", m.TotalLiabilities],
            ["Monthly income", m.MonthlyIncome], ["Monthly outflow", m.MonthlyOutflow], ["Monthly surplus", m.MonthlySurplus],
            ["Savings rate %", m.SavingsRatePct], ["Emergency fund (months)", m.EmergencyFundMonths],
            ["Debt-to-income %", m.DebtToIncomePct], ["Monthly SIP", m.TotalSipMonthly],
        ]);
        WriteSheet(wb, "Members", ["Name", "Relation", "Date of birth", "Earning"],
            s.Members.Select(x => new object?[] { x.Name, x.Relation, x.DateOfBirth, x.IsEarning }));
        WriteSheet(wb, "Income", ["Label", "Member", "Type", "Frequency", "Amount", "Active"],
            s.Income.Select(x => new object?[] { x.Label, Member(x.MemberId), x.Type.ToString(), x.Frequency.ToString(), x.Amount, x.IsActive }));
        WriteSheet(wb, "Expenses", ["Label", "Member", "Category", "Frequency", "Amount", "Essential"],
            s.Expenses.Select(x => new object?[] { x.Label, Member(x.MemberId), x.Category.ToString(), x.Frequency.ToString(), x.Amount, x.IsEssential }));
        WriteSheet(wb, "Investments", ["Name", "Member", "Kind", "Asset class", "Account", "Invested", "Current value", "Monthly SIP"],
            s.Investments.Select(x => new object?[] { x.Name, Member(x.MemberId), x.Kind.ToString(), x.AssetClass.ToString(), x.AccountType.ToString(), x.InvestedAmount, x.CurrentValue, x.SipMonthly }));
        WriteSheet(wb, "Debts", ["Name", "Member", "Type", "Outstanding", "Rate %", "Monthly EMI"],
            s.Liabilities.Select(x => new object?[] { x.Name, Member(x.MemberId), x.Type.ToString(), x.Outstanding, x.InterestRatePct, x.EmiMonthly }));
        WriteSheet(wb, "Goals", ["Name", "Target", "Saved", "Target date", "Priority"],
            s.Goals.Select(x => new object?[] { x.Name, x.TargetAmount, x.CurrentSavings, x.TargetDate, x.Priority.ToString() }));
        WriteSheet(wb, "Transactions", ["Date", "Description", "Direction", "Amount", "Category", "Account"],
            tx.Select(x => new object?[] { x.Date, x.Description, x.Direction.ToString(), x.Amount, x.Category, x.Account }));

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static void WriteSheet(XLWorkbook wb, string name, string[] headers, IEnumerable<object?[]> rows)
    {
        var ws = wb.Worksheets.Add(name);
        for (var c = 0; c < headers.Length; c++) ws.Cell(1, c + 1).Value = headers[c];
        ws.Row(1).Style.Font.Bold = true;

        var r = 2;
        foreach (var row in rows)
        {
            for (var c = 0; c < row.Length; c++)
            {
                var cell = ws.Cell(r, c + 1);
                switch (row[c])
                {
                    case null: break;
                    case string sv: cell.Value = sv; break;
                    case bool bv: cell.Value = bv; break;
                    case DateTime dv: cell.Value = dv; cell.Style.DateFormat.Format = "yyyy-mm-dd"; break;
                    case decimal mv: cell.Value = (double)mv; break;
                    case double dbv: cell.Value = dbv; break;
                    case int iv: cell.Value = iv; break;
                    default: cell.Value = row[c]!.ToString(); break;
                }
            }
            r++;
        }
        ws.Columns().AdjustToContents();
    }
}
