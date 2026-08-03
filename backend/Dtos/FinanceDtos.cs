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
