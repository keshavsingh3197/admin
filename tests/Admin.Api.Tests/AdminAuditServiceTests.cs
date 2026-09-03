using Xunit;
using Admin.Api.Services;
using KeshavSingh.Core.Models;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace Admin.Api.Tests;

/// <summary>
/// Covers the audit viewer's filter translation. These render the filter to BSON rather than run it,
/// which is enough: the behaviour worth pinning is what the query SAYS, and that is where the
/// escaping lives.
/// </summary>
public class AdminAuditServiceTests
{
    private static BsonDocument Render(FilterDefinition<LoginAudit> filter) =>
        filter.Render(new RenderArgs<LoginAudit>(
            BsonSerializer.SerializerRegistry.GetSerializer<LoginAudit>(),
            BsonSerializer.SerializerRegistry));

    [Fact]
    public void No_filters_matches_everything()
    {
        var rendered = Render(AdminAuditService.BuildFilter(null, null, null, null, null));
        Assert.Empty(rendered);
    }

    [Fact]
    public void An_exact_event_is_an_equality_not_a_pattern()
    {
        var rendered = Render(AdminAuditService.BuildFilter("login.password.failed", null, null, null, null));
        Assert.Equal("login.password.failed", rendered["Event"].AsString);
    }

    [Fact]
    public void A_trailing_dot_selects_the_whole_family()
    {
        // "admin." is how the viewer offers "administrative actions only".
        var rendered = Render(AdminAuditService.BuildFilter("admin.", null, null, null, null));
        // The driver renders a regex filter as a bare BSON regex, not as a { $regex: … } document.
        var pattern = rendered["Event"].AsBsonRegularExpression.Pattern;

        Assert.StartsWith("^", pattern);
        // The dot is escaped, so "admin." cannot also match "adminXfoo".
        Assert.Contains(@"\.", pattern);
    }

    [Fact]
    public void The_search_term_is_escaped_so_it_cannot_widen_the_query()
    {
        // An operator pasting a regex into the search box must get a literal search, not a
        // match-everything query.
        var rendered = Render(AdminAuditService.BuildFilter(null, ".*", null, null, null));
        var clauses = rendered["$or"].AsBsonArray;
        var first = clauses[0].AsBsonDocument["Email"].AsBsonRegularExpression;

        Assert.NotEqual(".*", first.Pattern);
        Assert.Equal("i", first.Options);
    }

    [Fact]
    public void The_search_term_matches_actor_target_and_ip()
    {
        var rendered = Render(AdminAuditService.BuildFilter(null, "someone@example.com", null, null, null));
        var fields = rendered["$or"].AsBsonArray
            .Select(c => c.AsBsonDocument.Names.Single())
            .ToList();

        Assert.Equal(new[] { "Email", "Target", "IpAddress" }, fields);
    }

    [Fact]
    public void An_email_with_a_plus_is_searched_literally()
    {
        // Gmail-style addresses are the common case that an unescaped pattern silently breaks.
        var rendered = Render(AdminAuditService.BuildFilter(null, "a+b@example.com", null, null, null));
        var pattern = rendered["$or"].AsBsonArray[0].AsBsonDocument["Email"]
            .AsBsonRegularExpression.Pattern;

        Assert.Contains(@"\+", pattern);
    }

    [Fact]
    public void The_date_range_is_inclusive_of_from_and_exclusive_of_to()
    {
        // The viewer turns the operator's "to" day into the following midnight, which only gives the
        // day they picked if this bound is exclusive.
        var from = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var to = new DateTime(2026, 2, 1, 0, 0, 0, DateTimeKind.Utc);
        var rendered = Render(AdminAuditService.BuildFilter(null, null, null, from, to));
        var timestamp = rendered["Timestamp"].AsBsonDocument;

        Assert.True(timestamp.Contains("$gte"));
        Assert.True(timestamp.Contains("$lt"));
        Assert.False(timestamp.Contains("$lte"));
    }

    [Fact]
    public void Filtering_by_outcome_distinguishes_false_from_unset()
    {
        // `false` is a real filter ("show me the failures"), not the absence of one — the easy bug
        // here is treating it as unset and silently showing everything.
        Assert.Empty(Render(AdminAuditService.BuildFilter(null, null, null, null, null)));

        var failures = Render(AdminAuditService.BuildFilter(null, null, false, null, null));
        Assert.False(failures["Success"].AsBoolean);
    }

    [Fact]
    public void Filters_combine_rather_than_replace_one_another()
    {
        var rendered = Render(AdminAuditService.BuildFilter(
            "admin.console.write", "10.0.0.1", true, DateTime.UtcNow.AddDays(-1), DateTime.UtcNow));

        // One $and holding every clause: an operator narrowing by event AND date must get both.
        Assert.True(rendered.Contains("$and") || rendered.ElementCount >= 4);
    }

    [Fact]
    public void Every_admin_event_name_is_namespaced_so_the_family_filter_finds_it()
    {
        // The viewer's "administrative actions only" option is a prefix match on "admin.".
        var names = typeof(AdminAuditEvents)
            .GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)
            .Where(f => f.IsLiteral)
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToList();

        Assert.NotEmpty(names);
        Assert.All(names, n => Assert.StartsWith("admin.", n));
    }
}
