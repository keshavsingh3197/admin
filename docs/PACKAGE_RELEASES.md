# Private package release workflow

The package inventory at `/packages` is the source of truth for private package version alignment across the workspace. It reads producer and consumer manifests dynamically and compares source versions with GitHub Packages.

## Version locations

- .NET producer version: `<Version>` in the package `.csproj`.
- .NET consumer version: matching `<PackageReference Version="...">` entries.
- npm producer version: `version` in the package `package.json`.
- npm consumer version: matching dependency entries in each consuming `package.json`.
- Lockfiles are refreshed only after the new package is published and available from the registry.

Use a minor version bump for a pre-1.0 compatibility change such as moving the target framework to .NET 10. Use a patch bump for backward-compatible fixes that do not change platform requirements.

## Publication order

Publish dependencies before packages that consume them:

1. `KeshavSingh.Security`, `KeshavSingh.Mongo.NoSql`, `KeshavSingh.Storage`, and `KeshavSingh.Finance`.
2. `KeshavSingh.Auth`.
3. `KeshavSingh.Core`.
4. `KeshavSingh.Realtime` and `KeshavSingh.Localization`.
5. Application backends: admin, content-blog, and ghar-ledger.

For npm, publish `@keshavsingh3197/web-config` and `@keshavsingh3197/web-ui` before running `npm install` in consuming applications.

## Local and deployed builds

When sibling repositories exist, MSBuild automatically uses `ProjectReference` entries. This allows coordinated source changes to build before packages are published, even when `PACKAGES_READ_TOKEN` is set.

Isolated CI and deployment checkouts use `PackageReference` entries and therefore require the referenced versions to be published. Set `UseLocalProjectReferences=false` to explicitly test registry restore from a full workspace.

## Package inventory configuration

The admin API discovers a workspace automatically when its parent contains both `admin` and `shared-security`. For other hosts configure:

- `PackageInventory__WorkspaceRoot`: absolute path containing the repositories.
- `PackageInventory__GitHubOwner`: package owner; defaults to `keshavsingh3197`.
- `PackageInventory__GitHubToken` or `PACKAGES_READ_TOKEN`: token with package read access for private publication status.

The inventory response and UI never expose the workspace root or token. Results are cached for 15 minutes; use Refresh on `/packages` to bypass the cache.

## Release checks

1. Build and test package projects using sibling source references.
2. Run `dotnet list <project> package --vulnerable --include-transitive` for .NET packages.
3. Run `npm audit` and the package build/test command for npm packages.
4. Publish in dependency order.
5. Refresh consumer lockfiles with normal restore/install commands.
6. Open `/packages`; all rows should report `Current`.
