using Microsoft.Extensions.Hosting;

namespace Admin.Api.Services;

public sealed class SessionRetentionCleanupWorker : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<SessionRetentionCleanupWorker> _logger;

    public SessionRetentionCleanupWorker(IServiceProvider services, ILogger<SessionRetentionCleanupWorker> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(30));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var sessionCleanup = scope.ServiceProvider.GetRequiredService<SessionRetentionService>();
                var visitCleanup = scope.ServiceProvider.GetRequiredService<WebsiteVisitService>();
                var dataRetention = scope.ServiceProvider.GetRequiredService<DataRetentionService>();

                var sessionDeleted = await sessionCleanup.CleanupAsync(stoppingToken);
                var visitDeleted = await visitCleanup.CleanupOldAsync(stoppingToken);
                var auditDeleted = await dataRetention.PurgeExpiredAsync(DataRetentionService.LoginLogsDomain, stoppingToken);

                if (sessionDeleted > 0 || visitDeleted > 0 || auditDeleted > 0)
                {
                    _logger.LogInformation(
                        "Cleanup removed {SessionDeleted} refresh tokens, {VisitDeleted} visit records, and {AuditDeleted} login audit records.",
                        sessionDeleted, visitDeleted, auditDeleted);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Cleanup worker failed.");
            }

            await timer.WaitForNextTickAsync(stoppingToken);
        }
    }
}
