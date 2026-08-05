using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Exceptions;

namespace Admin.Api.Controllers;

/// <summary>
/// Personal/family finance. Every record is personal data scoped to the signed-in user
/// (<see cref="ClaimsPrincipalExtensions.GetUserId"/>); missing records return 404, never 403
/// (anti-IDOR). All financial reasoning lives in the private <c>KeshavSingh.Finance</c> package —
/// this controller only persists data and asks the advisor for the report. Amounts are never logged.
/// </summary>
[ApiController]
[Route("api/finance")]
[Authorize] // Default-deny: a valid session is required for every endpoint.
public class FinanceController : ControllerBase
{
    /// <summary>Upload ceiling for a statement file — generous for a year of pages, far below a DoS.</summary>
    private const int MaxStatementBytes = 15 * 1024 * 1024;

    private readonly FinanceService _finance;
    private readonly IFinancialAdvisor _advisor;

    public FinanceController(FinanceService finance, IFinancialAdvisor advisor)
    {
        _finance = finance;
        _advisor = advisor;
    }

    private string Owner => User.GetUserId();

    // ---- Overview (analytics + advisories) ----

    [HttpGet("overview")]
    public async Task<ActionResult<OverviewResponse>> Overview()
    {
        var snapshot = await _finance.BuildSnapshotAsync(Owner);
        var report = _advisor.Analyze(snapshot, DateOnly.FromDateTime(DateTime.UtcNow));
        return Ok(new OverviewResponse(report.Metrics, report.Advisories));
    }

    // ---- Household ----

    [HttpGet("household")]
    public async Task<ActionResult<Household>> GetHousehold() => Ok(await _finance.GetOrCreateHouseholdAsync(Owner));

    [HttpPut("household")]
    public async Task<ActionResult<Household>> UpdateHousehold(UpdateHouseholdRequest r) =>
        Ok(await _finance.UpdateHouseholdAsync(Owner, r.Name, r.Currency, r.EmergencyFundTargetMonths));

    // ---- Members ----

    [HttpGet("members")]
    public async Task<ActionResult<List<FamilyMember>>> ListMembers() => Ok(await _finance.ListAsync<FamilyMember>(Owner));

    [HttpPost("members")]
    public async Task<ActionResult<FamilyMember>> CreateMember(CreateMemberRequest r) =>
        Ok(await _finance.CreateAsync(Owner, new FamilyMember
        {
            Name = r.Name.Trim(), Relation = Clean(r.Relation), DateOfBirth = r.DateOfBirth, IsEarning = r.IsEarning,
        }));

    [HttpPut("members/{id}")]
    public async Task<ActionResult<FamilyMember>> UpdateMember(string id, UpdateMemberRequest r)
    {
        var doc = await _finance.UpdateAsync<FamilyMember>(Owner, id, m =>
        {
            if (!string.IsNullOrWhiteSpace(r.Name)) m.Name = r.Name.Trim();
            if (r.Relation is not null) m.Relation = Clean(r.Relation);
            if (r.DateOfBirth is not null) m.DateOfBirth = r.DateOfBirth;
            if (r.IsEarning is { } e) m.IsEarning = e;
        });
        return doc is null ? NotFound() : Ok(doc);
    }

    [HttpDelete("members/{id}")]
    public async Task<IActionResult> DeleteMember(string id) =>
        await _finance.DeleteAsync<FamilyMember>(Owner, id) ? NoContent() : NotFound();

    // ---- Income ----

    [HttpGet("income")]
    public async Task<ActionResult<List<IncomeSource>>> ListIncome() => Ok(await _finance.ListAsync<IncomeSource>(Owner));

    [HttpPost("income")]
    public async Task<ActionResult<IncomeSource>> CreateIncome(CreateIncomeRequest r) =>
        Ok(await _finance.CreateAsync(Owner, new IncomeSource
        {
            Label = r.Label.Trim(), Type = r.Type, Frequency = r.Frequency, Amount = r.Amount,
            MemberId = Clean(r.MemberId), IsActive = r.IsActive,
        }));

    [HttpPut("income/{id}")]
    public async Task<ActionResult<IncomeSource>> UpdateIncome(string id, UpdateIncomeRequest r)
    {
        var doc = await _finance.UpdateAsync<IncomeSource>(Owner, id, i =>
        {
            if (!string.IsNullOrWhiteSpace(r.Label)) i.Label = r.Label.Trim();
            if (r.Type is { } t) i.Type = t;
            if (r.Frequency is { } f) i.Frequency = f;
            if (r.Amount is { } a) i.Amount = a;
            if (r.MemberId is not null) i.MemberId = Clean(r.MemberId);
            if (r.IsActive is { } act) i.IsActive = act;
        });
        return doc is null ? NotFound() : Ok(doc);
    }

    [HttpDelete("income/{id}")]
    public async Task<IActionResult> DeleteIncome(string id) =>
        await _finance.DeleteAsync<IncomeSource>(Owner, id) ? NoContent() : NotFound();

    // ---- Expenses ----

    [HttpGet("expenses")]
    public async Task<ActionResult<List<Expense>>> ListExpenses() => Ok(await _finance.ListAsync<Expense>(Owner));

    [HttpPost("expenses")]
    public async Task<ActionResult<Expense>> CreateExpense(CreateExpenseRequest r) =>
        Ok(await _finance.CreateAsync(Owner, new Expense
        {
            Label = r.Label.Trim(), Category = r.Category, Frequency = r.Frequency, Amount = r.Amount,
            IsEssential = r.IsEssential, MemberId = Clean(r.MemberId),
        }));

    [HttpPut("expenses/{id}")]
    public async Task<ActionResult<Expense>> UpdateExpense(string id, UpdateExpenseRequest r)
    {
        var doc = await _finance.UpdateAsync<Expense>(Owner, id, e =>
        {
            if (!string.IsNullOrWhiteSpace(r.Label)) e.Label = r.Label.Trim();
            if (r.Category is { } c) e.Category = c;
            if (r.Frequency is { } f) e.Frequency = f;
            if (r.Amount is { } a) e.Amount = a;
            if (r.IsEssential is { } ess) e.IsEssential = ess;
            if (r.MemberId is not null) e.MemberId = Clean(r.MemberId);
        });
        return doc is null ? NotFound() : Ok(doc);
    }

    [HttpDelete("expenses/{id}")]
    public async Task<IActionResult> DeleteExpense(string id) =>
        await _finance.DeleteAsync<Expense>(Owner, id) ? NoContent() : NotFound();

    // ---- Investments ----

    [HttpGet("investments")]
    public async Task<ActionResult<List<Investment>>> ListInvestments() => Ok(await _finance.ListAsync<Investment>(Owner));

    [HttpPost("investments")]
    public async Task<ActionResult<Investment>> CreateInvestment(CreateInvestmentRequest r) =>
        Ok(await _finance.CreateAsync(Owner, new Investment
        {
            Name = r.Name.Trim(), AssetClass = r.AssetClass, AccountType = r.AccountType,
            InvestedAmount = r.InvestedAmount, CurrentValue = r.CurrentValue,
            ExpectedReturnPct = r.ExpectedReturnPct, SipMonthly = r.SipMonthly, MemberId = Clean(r.MemberId),
        }));

    [HttpPut("investments/{id}")]
    public async Task<ActionResult<Investment>> UpdateInvestment(string id, UpdateInvestmentRequest r)
    {
        var doc = await _finance.UpdateAsync<Investment>(Owner, id, i =>
        {
            if (!string.IsNullOrWhiteSpace(r.Name)) i.Name = r.Name.Trim();
            if (r.AssetClass is { } cls) i.AssetClass = cls;
            if (r.AccountType is { } acc) i.AccountType = acc;
            if (r.InvestedAmount is { } inv) i.InvestedAmount = inv;
            if (r.CurrentValue is { } cur) i.CurrentValue = cur;
            if (r.ExpectedReturnPct is not null) i.ExpectedReturnPct = r.ExpectedReturnPct;
            if (r.SipMonthly is not null) i.SipMonthly = r.SipMonthly;
            if (r.MemberId is not null) i.MemberId = Clean(r.MemberId);
        });
        return doc is null ? NotFound() : Ok(doc);
    }

    [HttpDelete("investments/{id}")]
    public async Task<IActionResult> DeleteInvestment(string id) =>
        await _finance.DeleteAsync<Investment>(Owner, id) ? NoContent() : NotFound();

    // ---- Liabilities ----

    [HttpGet("liabilities")]
    public async Task<ActionResult<List<Liability>>> ListLiabilities() => Ok(await _finance.ListAsync<Liability>(Owner));

    [HttpPost("liabilities")]
    public async Task<ActionResult<Liability>> CreateLiability(CreateLiabilityRequest r) =>
        Ok(await _finance.CreateAsync(Owner, new Liability
        {
            Name = r.Name.Trim(), Type = r.Type, Outstanding = r.Outstanding,
            InterestRatePct = r.InterestRatePct, EmiMonthly = r.EmiMonthly, MemberId = Clean(r.MemberId),
        }));

    [HttpPut("liabilities/{id}")]
    public async Task<ActionResult<Liability>> UpdateLiability(string id, UpdateLiabilityRequest r)
    {
        var doc = await _finance.UpdateAsync<Liability>(Owner, id, l =>
        {
            if (!string.IsNullOrWhiteSpace(r.Name)) l.Name = r.Name.Trim();
            if (r.Type is { } t) l.Type = t;
            if (r.Outstanding is { } o) l.Outstanding = o;
            if (r.InterestRatePct is { } rate) l.InterestRatePct = rate;
            if (r.EmiMonthly is not null) l.EmiMonthly = r.EmiMonthly;
            if (r.MemberId is not null) l.MemberId = Clean(r.MemberId);
        });
        return doc is null ? NotFound() : Ok(doc);
    }

    [HttpDelete("liabilities/{id}")]
    public async Task<IActionResult> DeleteLiability(string id) =>
        await _finance.DeleteAsync<Liability>(Owner, id) ? NoContent() : NotFound();

    // ---- Goals ----

    [HttpGet("goals")]
    public async Task<ActionResult<List<FinancialGoal>>> ListGoals() => Ok(await _finance.ListAsync<FinancialGoal>(Owner));

    [HttpPost("goals")]
    public async Task<ActionResult<FinancialGoal>> CreateGoal(CreateGoalRequest r) =>
        Ok(await _finance.CreateAsync(Owner, new FinancialGoal
        {
            Name = r.Name.Trim(), TargetAmount = r.TargetAmount, CurrentSavings = r.CurrentSavings,
            TargetDate = r.TargetDate, Priority = r.Priority,
        }));

    [HttpPut("goals/{id}")]
    public async Task<ActionResult<FinancialGoal>> UpdateGoal(string id, UpdateGoalRequest r)
    {
        var doc = await _finance.UpdateAsync<FinancialGoal>(Owner, id, g =>
        {
            if (!string.IsNullOrWhiteSpace(r.Name)) g.Name = r.Name.Trim();
            if (r.TargetAmount is { } t) g.TargetAmount = t;
            if (r.CurrentSavings is { } c) g.CurrentSavings = c;
            if (r.TargetDate is { } d) g.TargetDate = d;
            if (r.Priority is { } p) g.Priority = p;
        });
        return doc is null ? NotFound() : Ok(doc);
    }

    [HttpDelete("goals/{id}")]
    public async Task<IActionResult> DeleteGoal(string id) =>
        await _finance.DeleteAsync<FinancialGoal>(Owner, id) ? NoContent() : NotFound();

    // ---- Transactions (ledger) ----

    [HttpGet("transactions")]
    public async Task<ActionResult<PagedResult<Transaction>>> ListTransactions([FromQuery] int skip = 0, [FromQuery] int limit = 25)
    {
        var (items, total) = await _finance.ListTransactionsAsync(Owner, skip, limit);
        return Ok(new PagedResult<Transaction>(items, total));
    }

    [HttpPost("transactions")]
    public async Task<ActionResult<Transaction>> CreateTransaction(CreateTransactionRequest r) =>
        Ok(await _finance.CreateAsync(Owner, new Transaction
        {
            Date = r.Date, Description = r.Description.Trim(), Amount = r.Amount, Direction = r.Direction,
            Category = Clean(r.Category), Account = Clean(r.Account), MemberId = Clean(r.MemberId),
        }));

    [HttpPut("transactions/{id}")]
    public async Task<ActionResult<Transaction>> UpdateTransaction(string id, UpdateTransactionRequest r)
    {
        var doc = await _finance.UpdateAsync<Transaction>(Owner, id, t =>
        {
            if (r.Date is { } d) t.Date = d;
            if (!string.IsNullOrWhiteSpace(r.Description)) t.Description = r.Description.Trim();
            if (r.Amount is { } a) t.Amount = a;
            if (r.Direction is { } dir) t.Direction = dir;
            if (r.Category is not null) t.Category = Clean(r.Category);
            if (r.Account is not null) t.Account = Clean(r.Account);
            if (r.MemberId is not null) t.MemberId = Clean(r.MemberId);
        });
        return doc is null ? NotFound() : Ok(doc);
    }

    [HttpDelete("transactions/{id}")]
    public async Task<IActionResult> DeleteTransaction(string id) =>
        await _finance.DeleteAsync<Transaction>(Owner, id) ? NoContent() : NotFound();

    [HttpPost("transactions/import")]
    public async Task<ActionResult<ImportResult>> ImportTransactions(ImportTransactionsRequest r)
    {
        if (r.AmountColumn is null && r.DebitColumn is null && r.CreditColumn is null)
            return BadRequest(new { error = "Map either an amount column, or debit/credit columns." });

        var map = new BankCsvMapping
        {
            DateColumn = r.DateColumn,
            DescriptionColumn = r.DescriptionColumn,
            AmountColumn = r.AmountColumn,
            DebitColumn = r.DebitColumn,
            CreditColumn = r.CreditColumn,
            DateFormat = Clean(r.DateFormat),
            HasHeader = r.HasHeader,
            Account = Clean(r.Account),
            DefaultCategory = Clean(r.Category),
        };
        var (imported, skipped) = await _finance.ImportTransactionsAsync(Owner, r.CsvText, map);
        return Ok(new ImportResult(imported, skipped));
    }

    /// <summary>
    /// Imports a statement workbook (.xlsx) — the format most banks hand out. Same column mapping as the
    /// CSV import; the file is streamed, never stored.
    /// </summary>
    [HttpPost("transactions/import/xlsx")]
    [RequestSizeLimit(MaxStatementBytes)]
    public async Task<ActionResult<ImportResult>> ImportWorkbook(
        IFormFile file,
        [FromForm] int dateColumn, [FromForm] int descriptionColumn,
        [FromForm] int? amountColumn, [FromForm] int? debitColumn, [FromForm] int? creditColumn,
        [FromForm] string? dateFormat, [FromForm] bool hasHeader = true,
        [FromForm] string? account = null, [FromForm] string? category = null)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "Choose a statement file." });
        if (!file.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Only .xlsx workbooks are supported here — use the CSV import otherwise." });
        if (amountColumn is null && debitColumn is null && creditColumn is null)
            return BadRequest(new { error = "Map either an amount column, or debit/credit columns." });

        var map = new BankCsvMapping
        {
            DateColumn = dateColumn,
            DescriptionColumn = descriptionColumn,
            AmountColumn = amountColumn,
            DebitColumn = debitColumn,
            CreditColumn = creditColumn,
            DateFormat = Clean(dateFormat),
            HasHeader = hasHeader,
            Account = Clean(account),
            DefaultCategory = Clean(category),
        };

        await using var stream = file.OpenReadStream();
        try
        {
            var (imported, skipped) = await _finance.ImportWorkbookAsync(Owner, stream, map);
            return Ok(new ImportResult(imported, skipped));
        }
        catch (Exception ex) when (ex is InvalidDataException or FormatException)
        {
            // A corrupt or password-protected workbook is the user's problem to fix, not a 500.
            return BadRequest(new { error = "That file could not be read as an .xlsx workbook." });
        }
    }

    /// <summary>
    /// Reads a statement PDF and returns the table it found, so the column mapping can be picked against
    /// real rows — a PDF has no header row to infer them from. Nothing is imported or stored here, and the
    /// password is used only to open this one stream.
    /// </summary>
    [HttpPost("transactions/import/pdf/preview")]
    [RequestSizeLimit(MaxStatementBytes)]
    public ActionResult<PdfStatementPreview> PreviewPdf(IFormFile file, [FromForm] string? password,
        [FromForm] int rows = 15)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "Choose a statement file." });
        if (!IsPdf(file)) return BadRequest(new { error = "Only .pdf statements are supported here." });

        using var stream = file.OpenReadStream();
        try
        {
            var grid = PdfStatementReader.Read(stream, password);
            var preview = grid.Rows.Take(Math.Clamp(rows, 1, 60)).ToList();
            return Ok(new PdfStatementPreview(grid.Pages, grid.Columns, grid.Rows.Count, grid.Truncated, preview));
        }
        catch (Exception ex) when (IsUnreadablePdf(ex))
        {
            return BadRequest(new { error = PdfError(ex) });
        }
    }

    /// <summary>
    /// Imports a statement PDF, password protected or not. Same column mapping as the CSV/.xlsx imports —
    /// take the indices from the preview above. The file is streamed and never stored, and the password is
    /// never logged or persisted.
    /// </summary>
    [HttpPost("transactions/import/pdf")]
    [RequestSizeLimit(MaxStatementBytes)]
    public async Task<ActionResult<ImportResult>> ImportPdf(
        IFormFile file, [FromForm] string? password,
        [FromForm] int dateColumn, [FromForm] int descriptionColumn,
        [FromForm] int? amountColumn, [FromForm] int? debitColumn, [FromForm] int? creditColumn,
        [FromForm] string? dateFormat, [FromForm] bool hasHeader = true,
        [FromForm] string? account = null, [FromForm] string? category = null)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "Choose a statement file." });
        if (!IsPdf(file)) return BadRequest(new { error = "Only .pdf statements are supported here." });
        if (amountColumn is null && debitColumn is null && creditColumn is null)
            return BadRequest(new { error = "Map either an amount column, or debit/credit columns." });

        var map = new BankCsvMapping
        {
            DateColumn = dateColumn,
            DescriptionColumn = descriptionColumn,
            AmountColumn = amountColumn,
            DebitColumn = debitColumn,
            CreditColumn = creditColumn,
            DateFormat = Clean(dateFormat),
            HasHeader = hasHeader,
            Account = Clean(account),
            DefaultCategory = Clean(category),
        };

        await using var stream = file.OpenReadStream();
        try
        {
            var (imported, skipped) = await _finance.ImportPdfAsync(Owner, stream, password, map);
            return Ok(new ImportResult(imported, skipped));
        }
        catch (Exception ex) when (IsUnreadablePdf(ex))
        {
            // Only a file the reader could not make sense of lands here. A failure to save what it read
            // is a server fault and goes to the exception handler, not back as "bad PDF".
            return BadRequest(new { error = PdfError(ex) });
        }
    }

    // ---- Statement analysis ----

    /// <summary>What the ledger says: monthly in/out, category split, recurring payments, suggestions.</summary>
    [HttpGet("insights")]
    public async Task<ActionResult<StatementAnalysis>> Insights([FromQuery] int months = 6) =>
        Ok(await _finance.AnalyzeAsync(Owner, months));

    /// <summary>Creates records from the suggestions the user accepted (salary, EMIs, standing bills).</summary>
    [HttpPost("insights/apply")]
    public async Task<ActionResult<ApplySuggestionsResult>> ApplySuggestions(ApplySuggestionsRequest r) =>
        Ok(new ApplySuggestionsResult(await _finance.ApplySuggestionsAsync(Owner, r.Suggestions)));

    // ---- Export ----

    [HttpGet("export")]
    public async Task<IActionResult> Export()
    {
        var bytes = await _finance.ExportWorkbookAsync(Owner);
        return File(bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "finance-export.xlsx");
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool IsPdf(IFormFile file) =>
        file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Whether this failure is "that file cannot be read", which is the user's to fix, rather than a
    /// fault of ours. Malformed PDFs surface through the reader in several shapes, hence the list.
    /// </summary>
    private static bool IsUnreadablePdf(Exception ex) =>
        ex is PdfDocumentEncryptedException or PdfDocumentFormatException or InvalidDataException
            or FormatException or ArgumentException or IndexOutOfRangeException;

    /// <summary>
    /// Turns a PDF failure into something the user can act on. Deliberately says nothing about the
    /// internals — and never echoes the password, whatever the underlying exception carried.
    /// </summary>
    private static string PdfError(Exception ex) => ex switch
    {
        PdfDocumentEncryptedException => "This PDF is password protected — enter the statement password and try again.",
        InvalidDataException => "No text could be read from that PDF. Scanned statements need to be exported as CSV or .xlsx instead.",
        _ => "That file could not be read as a PDF statement.",
    };
}
