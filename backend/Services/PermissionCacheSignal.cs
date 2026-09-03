namespace Admin.Api.Services;

/// <summary>
/// A one-integer "everything cached about permissions is stale now" signal, shared by the services
/// that CHANGE grants (roles, groups, a user's assignments) and the one that CACHES the result of
/// resolving them.
///
/// <para>It exists to break what would otherwise be a dependency cycle:
/// <see cref="PermissionsService"/> already depends on <see cref="CustomRoleService"/> and
/// <see cref="GroupService"/> to resolve access, so those two cannot depend back on it to say
/// "drop your cache". Both depend on this instead.</para>
///
/// <para>Invalidating by bumping a generation counter — which forms part of the cache key — retires
/// every entry at once without enumerating them, which matters because the entries are per-user and
/// a role change can affect any number of users at a time.</para>
/// </summary>
public sealed class PermissionCacheSignal
{
    private int _generation;

    /// <summary>The current generation. Include it in a cache key.</summary>
    public int Generation => Volatile.Read(ref _generation);

    /// <summary>
    /// Marks every resolved access set stale. Call after ANY write that could change what someone
    /// is allowed to do — a revoked permission must take effect now, not when a TTL happens to lapse.
    /// </summary>
    public void Invalidate() => Interlocked.Increment(ref _generation);
}
