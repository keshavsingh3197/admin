using System.ComponentModel.DataAnnotations;

namespace Admin.Api.Dtos;

// Requests are validated at the trust boundary (allowlisted enums via the string binder, ranges,
// lengths) before any value reaches the advisory engine. Enums/metrics come from KeshavSingh.Finance
// (globally imported). Range bounds use doubles for the attribute; properties stay decimal.

public sealed record UpdateHouseholdRequest(
    [MaxLength(120)] string? Name,
    [MaxLength(3)] string? Currency,
    [Range(0, 60)] int? EmergencyFundTargetMonths);

public sealed record CreateMemberRequest(
    [Required, MaxLength(120)] string Name,
    [MaxLength(60)] string? Relation,
    DateTime? DateOfBirth,
    bool IsEarning);

public sealed record UpdateMemberRequest(
    [MaxLength(120)] string? Name,
    [MaxLength(60)] string? Relation,
    DateTime? DateOfBirth,
    bool? IsEarning);

public sealed record CreateIncomeRequest(
    [Required, MaxLength(120)] string Label,
    IncomeType Type,
    Frequency Frequency,
    [Range(0, 1_000_000_000_000)] decimal Amount,
    [MaxLength(40)] string? MemberId,
    bool IsActive = true);

public sealed record UpdateIncomeRequest(
    [MaxLength(120)] string? Label,
    IncomeType? Type,
    Frequency? Frequency,
    [Range(0, 1_000_000_000_000)] decimal? Amount,
    [MaxLength(40)] string? MemberId,
    bool? IsActive);

public sealed record CreateExpenseRequest(
    [Required, MaxLength(120)] string Label,
    ExpenseCategory Category,
    Frequency Frequency,
    [Range(0, 1_000_000_000_000)] decimal Amount,
    bool IsEssential,
    [MaxLength(40)] string? MemberId);

public sealed record UpdateExpenseRequest(
    [MaxLength(120)] string? Label,
    ExpenseCategory? Category,
    Frequency? Frequency,
    [Range(0, 1_000_000_000_000)] decimal? Amount,
    bool? IsEssential,
    [MaxLength(40)] string? MemberId);

public sealed record CreateInvestmentRequest(
    [Required, MaxLength(120)] string Name,
    AssetClass AssetClass,
    AccountType AccountType,
    [Range(0, 1_000_000_000_000)] decimal InvestedAmount,
    [Range(0, 1_000_000_000_000)] decimal CurrentValue,
    [Range(-100, 1000)] double? ExpectedReturnPct,
    [Range(0, 1_000_000_000_000)] decimal? SipMonthly,
    [MaxLength(40)] string? MemberId);

public sealed record UpdateInvestmentRequest(
    [MaxLength(120)] string? Name,
    AssetClass? AssetClass,
    AccountType? AccountType,
    [Range(0, 1_000_000_000_000)] decimal? InvestedAmount,
    [Range(0, 1_000_000_000_000)] decimal? CurrentValue,
    [Range(-100, 1000)] double? ExpectedReturnPct,
    [Range(0, 1_000_000_000_000)] decimal? SipMonthly,
    [MaxLength(40)] string? MemberId);

public sealed record CreateLiabilityRequest(
    [Required, MaxLength(120)] string Name,
    DebtType Type,
    [Range(0, 1_000_000_000_000)] decimal Outstanding,
    [Range(0, 100)] double InterestRatePct,
    [Range(0, 1_000_000_000_000)] decimal? EmiMonthly,
    [MaxLength(40)] string? MemberId);

public sealed record UpdateLiabilityRequest(
    [MaxLength(120)] string? Name,
    DebtType? Type,
    [Range(0, 1_000_000_000_000)] decimal? Outstanding,
    [Range(0, 100)] double? InterestRatePct,
    [Range(0, 1_000_000_000_000)] decimal? EmiMonthly,
    [MaxLength(40)] string? MemberId);

public sealed record CreateGoalRequest(
    [Required, MaxLength(120)] string Name,
    [Range(0, 1_000_000_000_000)] decimal TargetAmount,
    [Range(0, 1_000_000_000_000)] decimal CurrentSavings,
    [Required] DateTime TargetDate,
    GoalPriority Priority);

public sealed record UpdateGoalRequest(
    [MaxLength(120)] string? Name,
    [Range(0, 1_000_000_000_000)] decimal? TargetAmount,
    [Range(0, 1_000_000_000_000)] decimal? CurrentSavings,
    DateTime? TargetDate,
    GoalPriority? Priority);

public sealed record OverviewResponse(HouseholdMetrics Metrics, IReadOnlyList<Advisory> Advisories);

// ---- Transactions (ledger) ----

public sealed record CreateTransactionRequest(
    [Required] DateTime Date,
    [Required, MaxLength(250)] string Description,
    [Range(0, 1_000_000_000_000)] decimal Amount,
    TransactionDirection Direction,
    [MaxLength(60)] string? Category,
    [MaxLength(80)] string? Account,
    [MaxLength(40)] string? MemberId);

public sealed record UpdateTransactionRequest(
    DateTime? Date,
    [MaxLength(250)] string? Description,
    [Range(0, 1_000_000_000_000)] decimal? Amount,
    TransactionDirection? Direction,
    [MaxLength(60)] string? Category,
    [MaxLength(80)] string? Account,
    [MaxLength(40)] string? MemberId);

/// <summary>Zero-based column mapping for a bank-statement CSV import.</summary>
public sealed record ImportTransactionsRequest(
    [Required, MaxLength(5_000_000)] string CsvText,
    [Range(0, 200)] int DateColumn,
    [Range(0, 200)] int DescriptionColumn,
    [Range(0, 200)] int? AmountColumn,
    [Range(0, 200)] int? DebitColumn,
    [Range(0, 200)] int? CreditColumn,
    [MaxLength(40)] string? DateFormat,
    bool HasHeader,
    [MaxLength(80)] string? Account,
    [MaxLength(60)] string? Category);

public sealed record ImportResult(int Imported, int Skipped);

/// <summary>
/// The table recovered from a statement PDF, so the column mapping can be chosen against what was
/// actually read rather than guessed. Rows are trimmed to a handful for the preview; nothing is stored.
/// </summary>
public sealed record PdfStatementPreview(
    int Pages,
    int Columns,
    int TotalRows,
    bool Truncated,
    IReadOnlyList<IReadOnlyList<string>> Rows);

// ---- Statement analysis ----

/// <summary>
/// One suggestion the user accepted. Sent back rather than referenced by id because the analysis is
/// computed on the fly, not stored — and re-validated here, since it arrives from the browser.
/// </summary>
public sealed record AppliedSuggestion(
    [Required, RegularExpression("^(income|liability|expense)$")] string Kind,
    [Required, MaxLength(120)] string Label,
    [Range(0.01, 1_000_000_000_000)] decimal MonthlyAmount,
    IncomeType? IncomeType,
    DebtType? DebtType,
    ExpenseCategory? ExpenseCategory,
    bool IsEssential = true);

public sealed record ApplySuggestionsRequest(
    [Required, MinLength(1), MaxLength(50)] IReadOnlyList<AppliedSuggestion> Suggestions);

public sealed record ApplySuggestionsResult(int Created);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, long Total);
