namespace Admin.Api.Models;

/// <summary>
/// Roles for the personal admin. Access is default-deny — a user can do nothing unless a
/// role explicitly grants it (enforced by [Authorize(Roles = ...)]).
/// </summary>
public static class Roles
{
    public const string Admin = "Admin";     // Full control (you).
    public const string Editor = "Editor";   // Can create/edit content across SSO apps (e.g. the blog).
    public const string Viewer = "Viewer";   // Read-only, if you ever share limited access.

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>(StringComparer.Ordinal) { Admin, Editor, Viewer };

    public static bool IsValid(string role) => All.Contains(role);
}
