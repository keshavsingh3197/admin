# Localisation and runtime configuration

Every user-facing string, and every value an app used to hard-code — URLs, icons, colours, feature
flags, page sizes, topic cards — lives in this API's database and is served over HTTP. Adding Hindi,
fixing a wording, changing a logo or retargeting a link is a database edit, not a deploy.

English (`en`, the default) and Hindi (`hi`) are seeded on first run. Nothing here is a one-off: a
third language needs a row in `locales` and an import, not a code change.

## Where the code lives

The engine is **not** in this repo. It is two shared packages, so the blog and the portfolio get the
same behaviour without a second implementation:

| Package | Repo | What it owns |
| --- | --- | --- |
| **`KeshavSingh.Localization`** (NuGet) | `KeshavSingh-Packages-Localization` | The locale registry, the catalogue, JSON/CSV/**Excel** import-export, the config registry, the validators, and the `/api/i18n/**` + `/api/app-config/**` controllers. |
| **`@keshavsingh3197/web-config`** (npm) | `KeshavSingh-Packages-Web` | The browser client: fetching, ETag/version handling, language resolution, fallbacks, interpolation, polling, persistence, and the `CONFIG_KEYS` contract. Framework-agnostic, because the apps span Angular 16 to 22. |

**What stays in this repo** is only what is specific to this deployment:

- `Localization/AdminAppSeeds.cs` — this app's own strings and the family's `url.*` / `feature.*` keys.
- `Localization/PublicSiteSeeds.cs` — the blog's and portfolio's strings, and the `blog.*` JSON
  documents. Seeded here because this API is the single writer for the whole family; the sites only read.
- `Controllers/ConfigController.cs` — the `GET /api/config` envelope. It belongs to the app, not the
  package, because only the app knows what else (branding, launcher URLs from its own settings) goes in it.
- `Services/WebsiteContentService.cs` — per-locale structured page content.
- `Localization:AllowedHosts` in appsettings — the URL/icon host allowlist for this deployment.

Wiring is three lines in `Program.cs` (`AddKeshavLocalization`, two `AddLocalizationSeeds`,
`AddKeshavLocalizationControllers`) plus `InitKeshavLocalizationAsync()` after `Build()`.

---

## The four moving parts

| Concern | Collection | Served at | Managed on |
| --- | --- | --- | --- |
| Which languages exist | `locales` | `GET /api/i18n/locales`, `/manifest` | Localization → Languages |
| The strings | `translations` | `GET /api/i18n/bundle/{locale}` | Localization → Translations |
| Everything previously hard-coded | `config_entries` | `GET /api/config` | Localization → Configuration |
| Per-language page content | `website_content` | `GET /api/website-content/public/{site}/{key}?locale=` | Websites |

The two singleton documents that already existed are unchanged: `config`/`app-config` still carries
startup infrastructure config, and `settings`/`app-settings` the auth knobs and launcher URLs.

---

## How a client boots

```text
GET /api/config                      → URLs, icons, flags, limits, the language list, a version
GET /api/i18n/manifest               → per-locale bundle versions (cheap; poll this)
GET /api/i18n/bundle/hi?ns=common,blog → { "blog.nav.home": "होम", … }
```

1. **Config first.** It carries the language-persistence key and the poll interval, so the i18n layer
   needs it before it starts.
2. **Then the bundle** for the resolved locale: the visitor's stored choice → the browser's preferred
   language → the server's default. The server has the last word — an unknown or disabled code
   resolves to the default rather than failing.
3. **Then poll the manifest** every `i18n.pollseconds` (default 300; `0` disables it). Re-fetch a
   bundle only when its version moved, so an editor's change reaches an open tab without a reload.

Both steps fail soft. If this API is unreachable the sites still render, using each component's
fallback glyph and English text.

All three apps use the same client (`@keshavsingh3197/web-config`) with a thin per-app adapter — a signal in
admin (Angular 22) and the blog (21), a `BehaviorSubject` in the portfolio (16). The portfolio keeps its
existing `| translate` templates: `ApiTranslateLoader` points ngx-translate at these endpoints and merges
three layers — the bundled `assets/i18n` as an offline base, the per-locale structured blocks from
`website_content` (its about paragraphs and experience timeline, which a flat bundle cannot express),
then the flat bundle on top.

### Fallbacks, so a half-translated language still works

Each locale has a `FallbackCode` (Hindi → English by default) and the default locale is the
last-resort fallback for everything. Bundles are built by walking that chain from the least specific
end, so a key with no Hindi value renders its English string instead of a blank. The chain is
validated on write: no self-reference, no cycles, and the default locale can be neither disabled nor
deleted.

### Caching

Bundle and config responses carry an ETag derived from a hash of their content — not a timestamp — so
an edit that changes nothing does not invalidate every client's cache, and a poll that finds nothing
new costs one 304. `/api/config` varies on `Authorization` and is marked `private` for a signed-in
caller, because such a caller may see more entries.

---

## Editing

### Translations

**Localization → Translations** lists every key known in the default language beside its translation
in the language being edited, with an "untranslated only" filter and a per-language coverage table.
Edits are held locally and saved as one bulk request.

### Import / export

**Localization → Import / export.** Four formats:

| Format | Export | Import | Use it for |
| --- | --- | --- | --- |
| `json` | ✓ | ✓ | Flat keys (`"blog.nav.home": "होम"`). Version control, diffs. |
| `nested` | ✓ | ✓ (as `json`) | Nested objects, what most translation tooling expects. |
| `csv` | ✓ | ✓ | Spreadsheet-lite, or a translation service that wants CSV. |
| **`xlsx`** | ✓ | ✓ | **Handing it to a person.** See below. |

**Excel** is the one to give a translator. One sheet per namespace, columns
`Key | Source | Translation | Notes`, header frozen. `Source` is the default language's text — reference
only, never read back on import. They fill in `Translation` and send the file back; nothing else needs
touching, and an exported file re-imports unchanged.

- Keys the target language has no row for yet appear as **blank** rows, so the gaps are visible and
  fillable in the file itself.
- A blank `Translation` cell means "not done yet", **not** "clear the stored value" — so exporting and
  re-importing can never wipe existing text.
- Columns are located by header name, so a translator who reorders them or inserts a `Reviewer` column
  does not break the import.

Modes, for every format:

- **Merge** (default) adds and updates, leaving keys absent from the file alone.
- **Replace** clears the namespaces the file touches first, so a re-import mirrors the file exactly.
- **Target namespace** treats each key (or each sheet) as belonging to it, instead of reading the
  namespace from the first path segment / the sheet name.

Spreadsheets go through the **upload** control — `.xlsx` is binary, so it cannot be pasted. JSON and CSV
work either way. Imported values go through exactly the same validation as a hand edit; the result
reports created/updated/removed/skipped counts and a reason per rejected row.

### Namespaces

The bundle a client asks for. A public site requests `common,blog,brand` and therefore cannot reach
the admin app's strings at all. Add one simply by using it: `admin.i18n.title` creates `admin`.

### Configuration

**Localization → Configuration** is the typed key/value registry. Each entry declares:

- **type** — `string` · `number` · `bool` · `json` · `url` · `icon` · `color`, which decides how it is
  validated and how a client parses it.
- **scope** — `public` (served anonymously), `authenticated` (only to a signed-in caller), or
  `internal` (never leaves the server).
- **localized** — the value is a translation key rather than literal text, so one entry renders per
  language. This is how the brand name is both editable and translatable.
- **secret** — AES-encrypted at rest and **write-only**: no endpoint returns the value, not even to an
  Admin, and exports carry the metadata without it.

Built-in (`isSystem`) keys can be edited but not deleted, and their type and scope are fixed: other
apps rely on the contract. Their seeded default is exactly what the code used to hard-code, so
seeding changes no behaviour — it only moves the value somewhere reachable.

### Per-language page content

`website_content` is keyed by site + content key + **locale**, so the same key carries Hindi and
English copy. A public read walks the locale's fallback chain and reports which language it actually
served. On the **Websites** screen an entry shows which languages it is missing and offers to start a
translation from the current payload.

---

## Security

These values are edited at runtime and most of them are rendered into anonymous pages, so the
registry is validated like any other untrusted input:

- **URLs and icons are allow-listed by host.** The deployment's `Localization:AllowedHosts`
  (`keshavsingh.in`, `keshavsingh.net`) plus `localhost`, and subdomains of each; same-origin relative
  paths are always fine. Anything else is refused unless an Admin deliberately widens
  `config.url.allowedhosts` — an internal entry that is itself never served, and which can only widen,
  never narrow below what the deployment declared. No `data:` URIs, no inline SVG, no protocol-relative
  URLs, no credentials in a URL. An omitted allowlist means the strictest one: it fails closed.
- **Translated text is plain text.** Values that look like an HTML tag, or carry `javascript:` /
  `data:text/html`, are rejected. Clients render through their framework's escaping; refusing
  tag-like content keeps that true even if some future screen reaches for `innerHTML`.
- **Exposure is decided server-side.** The public projection is built by filtering on each entry's
  stored scope. No request parameter can widen it, and secret entries are excluded before that filter
  even runs.
- **The anonymous reads are rate-limited** (`public-config`: 240/min per address) and ETagged.
- **CSV export escapes formula-leading characters**, so a downloaded file cannot execute in a
  spreadsheet.

---

## Endpoints

### Public (anonymous)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/config` | URLs, icons, flags, limits, languages, version |
| GET | `/api/i18n/manifest` | Languages + per-locale bundle versions |
| GET | `/api/i18n/locales` | Language-picker data |
| GET | `/api/i18n/bundle/{locale}?ns=` | Flat `namespace.key → value`, fallbacks merged |
| GET | `/api/website-content/public/{site}/{key}?locale=` | Localised content block |

### Editorial — Editor or Admin

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/i18n/admin/locales` | Languages, with string counts |
| GET | `/api/i18n/admin/entries` | Raw grid, filtered and paged |
| GET | `/api/i18n/admin/translate/{locale}` | Side-by-side editor rows |
| GET | `/api/i18n/admin/namespaces` · `/coverage` | Namespaces · per-language completeness |
| PUT | `/api/i18n/admin/entries` | Save one string |
| POST | `/api/i18n/admin/entries/bulk` | Save many |
| DELETE | `/api/i18n/admin/entries/{id}` | Remove one string |
| POST | `/api/i18n/admin/import` | Import a pasted JSON or CSV payload |
| POST | `/api/i18n/admin/import/file` | Upload `.json` / `.csv` / `.xlsx` (multipart, 8 MB cap) |
| GET | `/api/i18n/admin/export?locale=&format=&ns=` | Export `json` · `nested` · `csv` · `xlsx` |

### Admin only

| Method | Path | Description |
| --- | --- | --- |
| PUT · DELETE | `/api/i18n/admin/locales[/{code}]` | Add/edit · delete a language and its strings |
| DELETE | `/api/i18n/admin/keys/{ns}/{key}` | Retire a key from every language |
| POST | `/api/i18n/admin/refresh` | Re-read languages and strings from the database |
| GET | `/api/app-config/entries` · `/groups` · `/meta` | The registry, its groups, its allow-lists |
| PUT · POST · DELETE | `/api/app-config/entries[/bulk\|/{key}]` | Edit the registry |
| GET · POST | `/api/app-config/export` · `/import` | Back up / promote config between environments |
| POST | `/api/app-config/refresh` | Re-read the registry from the database |

`refresh` on either side is the escape hatch after an out-of-band change (a restored backup, a
migration script). Normal edits refresh the in-memory caches themselves.

---

## Adding a language

1. **Localization → Languages → Add language**: code (`ta`), names, icon, fallback (usually `en`).
2. Export the default language as JSON, translate it, import it against the new code with
   *mark as needing review* on.
3. Leave it **disabled** while translating — a disabled language is invisible to the public API, so a
   visitor cannot reach it by typing its code.
4. Enable it. Open tabs pick it up on their next manifest poll.

## Adding a string

1. Add it in the default language on **Localization → Translations** (or import it), using a
   `namespace.dotted.key`.
2. Reference it: `{{ i18n.t('blog.nav.about') }}` or `{{ 'blog.nav.about' | t }}`.
3. Translate it in the other languages. Until then it renders the default language's text.

A key with no value anywhere renders as the key itself — visible on the page and in a screenshot,
which is what gets it noticed rather than shipping a blank label.

## Adding a previously hard-coded value

1. **Localization → Configuration → New key**: `ui.icon.print`, type `icon`, scope `public`.
2. Add it to `CONFIG_KEYS` in `@keshavsingh3197/web-config` (`src/config-keys.ts`) so a typo is a compile
   error in all three apps at once, and publish that package.
3. Read it through the typed accessor: `config.icon(CONFIG_KEYS.iconPrint, '🖨')`. The second argument
   is only what renders before the API answers — never a second source of truth.

To make it part of the shipped contract instead, add it to a seed source — `AdminAppSeeds` for this
app and the family's URLs/flags, `PublicSiteSeeds` for the public sites, or the package's own
`BaselineSeedSource` if it is genuinely app-neutral. It is then seeded on every deployment, its type and
scope are reasserted as a contract, and it cannot be deleted.
