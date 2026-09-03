using System.Threading.RateLimiting;

namespace Admin.Api.Startup;

/// <summary>
/// Every rate-limit policy the app defines, in one place.
///
/// <para>They exist for two different reasons and it is worth keeping the distinction in mind when
/// tuning one: the <c>auth</c> family blunts credential guessing, while the public-surface policies
/// (contact, account requests, visitor chat, analytics, short links) stop an anonymous endpoint from
/// being used to fill the database. Every policy partitions on the client address, which is
/// trustworthy here only because <c>UseForwardedHeaders</c> runs first and resolves it from the
/// proxy's own X-Forwarded-For entry.</para>
/// </summary>
public static class RateLimitingExtensions
{
    /// <summary>Adds the rate limiter and every named policy the controllers reference.</summary>
    public static IServiceCollection AddAdminRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 20,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
            // The public contact form: a real visitor sends one message, so this only has to be generous enough
            // not to block a retry, and tight enough that the inbox can't be flooded from one address.
            options.AddPolicy("contact", context => RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 5,
                    Window = TimeSpan.FromMinutes(10),
                    QueueLimit = 0,
                }));
            // "Request an account". A real applicant submits once, so this only has to be loose enough to
            // survive a retry and tight enough that the queue cannot be filled from one address.
            options.AddPolicy("account-request", context => RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 5,
                    Window = TimeSpan.FromMinutes(15),
                    QueueLimit = 0,
                }));
            // The anonymous config + localisation reads. Every public page load fetches these, and clients
            // poll the manifest, so the budget is generous — it exists to stop one address hammering them,
            // not to pace a normal visit. Responses are ETagged, so a poll that finds nothing new is a 304.
            options.AddPolicy("public-config", context => RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 240,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
            // Visitor chat polls every few seconds while the widget is open, so this has to be roomy — it is
            // here to stop a flood, not to pace a conversation.
            options.AddPolicy("visitor-chat", context => RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 120,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
            // Starting a conversation is once-per-visitor, so it gets its own much tighter budget: this is what
            // stops the queue being filled with empty threads.
            options.AddPolicy("visitor-chat-start", context => RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 5,
                    Window = TimeSpan.FromHours(1),
                    QueueLimit = 0,
                }));
            // Public page-view tracking. One beacon per page load from a real visitor, so this only has to be
            // loose enough for a busy site and tight enough that the collection cannot be filled from one
            // address — it is the only unauthenticated write in the app.
            options.AddPolicy("analytics-visit", context => RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 60,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
            // Public short-link redirects: generous, since a shared link can get a real burst of clicks — this
            // exists to blunt scripted abuse, not to pace normal traffic.
            options.AddPolicy("shortlink-redirect", context => RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 120,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
        });
        return services;
    }
}
