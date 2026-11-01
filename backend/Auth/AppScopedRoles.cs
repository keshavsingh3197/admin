using KeshavSingh.Core;

namespace Admin.Api.Auth;

/// <summary>
/// Roles that confine an account to a single application, as opposed to <see cref="Roles"/>, which
/// every app in the family shares and which lives in a package other repositories consume too.
/// </summary>
/// <remarks>
/// <para>
/// They are kept out of the shared set on purpose. Putting one there would make it a name every
/// app has to understand and would need a package release; here it only takes this service
/// accepting the name and <c>SsoController</c> refusing the account on every
/// other app, which it already does.
/// </para>
/// <para>
/// A confined account has exactly that one role. Next to Admin or Editor the confinement is lifted
/// (those sign in anywhere), and next to Viewer it adds nothing, so a mixed set is refused rather
/// than quietly accepted.
/// </para>
/// </remarks>
public static class AppScopedRoles
{
    /// <summary>Signs in to AnimStudio and nowhere else. Granted by approving a request made from its sign-in dialog.</summary>
    public const string StudioUser = "StudioUser";

    private static readonly HashSet<string> Known = new(StringComparer.Ordinal) { StudioUser };

    public static bool IsAppScoped(string role) => Known.Contains(role);

    /// <summary>
    /// True when every role is a shared one, or the set is exactly one app-scoped role and nothing
    /// else. Matching is exact, like <see cref="Roles.IsValid"/>: "studiouser" is not a role.
    /// </summary>
    public static bool IsValidSet(IReadOnlyCollection<string> roles) =>
        roles.Any(IsAppScoped) ? roles.Count == 1 : roles.All(Roles.IsValid);
}
