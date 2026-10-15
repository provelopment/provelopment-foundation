# Architecture

## Purpose

The platform is a reusable, re-brandable web template intended to support
small businesses in establishing and maintaining a web presence.

The application is initially frontend-only but must remain capable of evolving
into a full-stack application without requiring a fundamental architectural
rewrite.

## Architectural Style

The application follows Hexagonal Architecture / Ports and Adapters principles.

The objective is to keep business and application concerns independent from
frameworks, infrastructure, and external services.

## Architectural Boundaries

### `src/app`

Next.js App Router entry points.

Responsibilities:

- routing
- route composition
- framework-specific page/layout metadata
- framework-specific request/response concerns

This layer should remain thin.

### `src/components`

Reusable presentation components.

Responsibilities:

- UI composition
- visual presentation
- interaction
- accessibility

Components should not contain domain business rules.

### `src/core`

Domain concepts and business rules.

This is the most framework-independent part of the application.

Core code must not depend on:

- Next.js
- React
- Tailwind CSS
- Vercel
- browser APIs
- external service SDKs

### `src/application`

Application-level use cases and ports.

Responsibilities:

- orchestrating application behavior
- defining interfaces required by use cases
- coordinating core concepts

Application code may depend on `core`.

Application code must not depend directly on concrete infrastructure
implementations.

### `src/adapters`

Concrete implementations of external integrations and application ports.

Examples may include:

- content repositories
- external APIs
- persistence
- analytics
- email
- third-party services

Adapters may depend on external technologies.

### `src/config`

Application and site configuration, loaded from the deployment's
`site.config.json` — the configuration file at the DEPLOYMENT ROOT (see
[The deployment root](#the-deployment-root) below). In this repository that is
the capsule's `deployment/spokes/foundation/site.config.json`.

The JSON file is the primary customization boundary for downstream website
clones: branding, languages, navigation, contact details, and feature flags
are all edited there without touching application code.

Rules:

- `site.config.json` is validated against the Zod schema in
  `src/config/schema.ts` by the loader (`src/config/loader.ts`). A bad edit
  fails the build with an actionable message.
- Application code reads configuration only through the loader's exported
  `siteConfig`; importing the JSON directly elsewhere bypasses validation.
- Optional functionality is expressed as feature flags under `features`
  and consumed by adapters (for example `features.analytics.provider`).
- UI-string dictionaries live in the deployment's `config/i18n/<locale>.json`; they are
  content, not settings — edited as JSON and validated against the Zod
  `dictionarySchema` at load time.

#### The deployment root

ONE authority — `src/config/deployment-root.ts` — resolves every DEPLOYMENT-OWNED
filesystem location: the configuration file, the `config/i18n/` dictionaries, the
`content/pages/` authoring roots and the `content/assets/` source tree. Foundation core
never spells those locations itself, and `tests/architecture/deployment-root-guard.test.ts`
keeps it that way. Three layouts are resolved once per build:

| Layout | Deployment root | When it applies |
| --- | --- | --- |
| **capsule** | `<repo>/deployment/` | a real deployment capsule exists. It is the accepted long-term write boundary for one deployment — the layout THIS repository uses, and the one `deployment/README.md` and `deployment/AGENTS.md` describe |
| **repository** | `<repo>/` | a standalone repository that owns its own deployment — a SPOKE with no platform capsule, where those locations sit at its own root. It is a supported capability, and the layout THIS repository must NOT use: a combined platform repository carries its reference deployment in the capsule |
| **override** | `FOUNDATION_DEPLOYMENT_ROOT` | the dev/test escape hatch that points a dev server at a synthetic deployment. Never a production mechanism |

The three layouts are a CAPABILITY of the platform, not a description of this
repository's install: an independent SPOKE repository — one deployment, no
platform capsule — legitimately keeps `site.config.json`, `config/i18n/**` and
`content/**` at its own root, and keeps resolving the `repository` layout. The
combined Foundation repository is the other shape: it carries a reference
deployment, so it owns that state in `deployment/**` alone. Deployment-owned
locations therefore have exactly ONE home per repository, and no code branches on
repository identity to decide which — the selector answers every repository the
same way, and `tests/architecture/deployment-root-guard.test.ts` proves both
halves: a standalone spoke still selects the `repository` layout, while
`site.config.json`, `config/i18n/**` or `content/**` reappearing at THIS
repository's root fails architectural validation.

`public/assets/**` is NOT deployment-owned: Next.js serves static files from `public/`
only, so it is GENERATED build output — ignored by Git and installed by `pnpm install`
(postinstall), `pnpm dev` and `pnpm build` (`pnpm assets:sync` / `pnpm assets:check`,
byte-verified by the deployment's own asset suites).

The generated tree is NAMESPACED (S3E1C): `public/assets/**` is the SHARED platform
namespace (the icon library, the platform marks, and — in a legacy Installation — the
replaceable role artwork), and each declared Spoke owns a separate namespace at
`public/spokes/<runtime-segment>/assets/**` for its OWN replaceable artwork. The segment
is derived from the Spoke's `SpokeId`, so two Spokes may ship the same filename without
either being able to overwrite the other, and no Spoke namespace ever appears beneath
`public/assets/**`.

### `content`

Human-authored content such as:

- pages
- documentation
- articles
- educational material

Content should remain separate from application implementation.

#### Content system

**One human-facing content area.** Everything a normal user authors as website
content has ONE obvious home: the deployment's `content/` tree (relative to the
deployment root — the capsule's `deployment/spokes/foundation/content/` in this repository), and
`content/README.md` is the map
that answers "where do I edit my website?". Content is never authored under
`config/` (configuration changes how the site *behaves*; content is what it *says*),
and unrelated technical configuration is never moved into `content/` to make the tree
look uniform. The layout is:

```text
                            every path below is relative to the deployment root
content/README.md      the human-facing map
content/pages/markdown/<site>/<locale>/<route-path>.md   simple, safe pages
content/pages/json/<site>/<locale>/<route-path>.json     advanced, declarative pages
content/assets/**      the ONE user-editable asset authority (see below)
```

**If authored content has its own URL, it is a page.** There are no separate
author-facing collections (offerings, portfolio, posts, testimonials, legal) and no
second content store: every one of those is a PAGE, authored in one of the two modes
above and served by the ONE page route. A collection-shaped directory under
`content/` is neither read nor shipped.

**A page's URL is its route path** — the path between the locale and the extension,
built from the folders the page is authored in:

```text
content/pages/markdown/ww/en/offerings/website-design.md   →  /ww/en/offerings/website-design
content/pages/markdown/ww/en/blog/choosing-a-domain.md     →  /ww/en/blog/choosing-a-domain
```

The rule for that value lives ONCE in `src/core/page-route-path.ts`: every segment is
a content slug (`src/core/page-content.ts`), so `.`/`..`, an empty segment, a leading
or trailing `/`, a backslash and a percent-encoded traversal are all refused before a
filesystem path is built. Depth (`PAGE_ROUTE_PATH_MAX_SEGMENTS`) and length
(`PAGE_ROUTE_PATH_MAX_LENGTH`) are capped and documented there rather than chosen ad
hoc, so discovery, routing and the sitemap cannot disagree about what exists.

**Pages** are authored in exactly two ways — safe Markdown and declarative JSON — see
[Page authoring](#page-authoring--two-first-class-modes) below.

**Assets** are authored under the deployment's `content/assets/**` and mirrored byte-for-byte into the
generated runtime namespaces by `scripts/sync-runtime-assets.mjs` (`pnpm assets:sync` /
`assets:check`). `content/assets/**` is the source of truth a human edits; the generated namespaces
(`public/assets/**` for platform-owned artwork, `public/spokes/<segment>/assets/**` for a Spoke's own)
are DERIVATIVES that are never edited by hand, are NOT
version-controlled (installed by the package lifecycle instead), and a test
asserts that no second user-editable asset authority exists at the repository root.

The content pipeline follows the ports and adapters boundaries:

  **The runtime asset CATALOG** (M16/M17) closes the one place that relationship used to be asked at request
  time. From the SAME mirror plan, the build publishes an immutable record of which basenames each generated
  namespace holds and how large each one is — `src/config/generated/runtime-asset-catalog.json`, written by
  `scripts/sync-runtime-assets.mjs` and drift-checked by `assets:check`. A page render reads that record, so
  asset ownership and intrinsic size are BUILD knowledge rather than a request-time filesystem probe: a
  serverless function does NOT contain `public/**` (`public/` is static deployment output served by the CDN),
  which is why every page route answered 500 while the sitemap, robots and metadata routes kept working. The
  served URLs are unchanged (`/assets/<file>`, `/spokes/<segment>/assets/<file>`), the namespaces keep their
  order and their non-shadowability, and the filesystem read survives ONLY as the compatibility mechanism for
  a namespace that carries no catalog inventory (a synthetic fixture over a temporary directory).

- `src/core/page-content.ts` defines the `PageContent` concept and the ONE
  content-segment rule.
- `src/core/page-source.ts` declares the two modes, their roots and the ONE
  precedence order; `src/core/page-route-path.ts` declares what a page's route path
  may be.
- `src/application/page-source-resolution.ts` applies that order behind the two mode
  readers; `src/adapters/content/page-sources.ts` wires the concrete readers and is
  the composition every page route and the sitemap consume.
- Framework code in `src/app` renders the resolved page through the safe Markdown
  renderer; Markdown becomes HTML only at that presentation boundary.

Route discovery is the ONE inventory: it walks the authoring tree recursively
(`src/adapters/content/authoring-source-discovery.ts`), and the sitemap derives its
per-locale route set from the same composition, so a new page (at any depth) joins
the sitemap as soon as its file exists — there is no hard-coded route list to update.
Navigation config controls exposure and ordering only; it does not define route
existence.

**Every page is statically generated by ONE route**: `src/app/[[...segments]]/page.tsx`
exports `generateStaticParams` (the discovered route paths plus the configured
regional landings and regional pages) with `dynamicParams = false`, so every page is
prerendered at build time and any other path returns a 404 — no on-demand rendering,
no ISR. The home page is served by the locale root (`src/app/[[...segments]]/page.tsx`), and
`/connect` + `/contact` keep their own route files for their specialised chrome; both
resolve their page through the same composition.

#### Page authoring — two first-class modes, and no third

A page is authored in exactly ONE of two first-class modes:

| Mode | Root | What it is |
| --- | --- | --- |
| **safe Markdown** | `content/pages/markdown/<site>/<locale>/<slug>.md` | ordinary Markdown for a non-technical author; the recommended mode |
| **safe declarative JSON** | `content/pages/json/<site>/<locale>/<slug>.json` | validated data for a page needing presentation Markdown cannot express (`@/core/page-document` is the schema; a document that does not satisfy it fails the build loudly, naming its file) |

Both modes are CONTENT and DATA, never executable code. The Markdown mode's policy
is enforced in TWO independent layers: the renderer
(`src/adapters/markdown/safe-markdown.ts`) turns author raw HTML into inert text,
escapes code, and asks `src/core/safe-url.ts` about every destination (which fails
closed and refuses executable/unknown schemes); the generated HTML is then
re-parsed against the allowlist in `src/core/markdown-policy.ts` by
`sanitize-html`, so a mistake in the renderer cannot produce active markup either.

**Heading fragments are generated, never authored.** An author may link to a section
of their own page (`[hours](#opening-hours)`), which requires a target they cannot
write (raw HTML is inert and no attribute is author-settable). The renderer therefore
derives a deterministic id from each heading by the ONE rule in
`src/core/heading-anchor.ts` (`## Opening Hours` → `#opening-hours`, accents and case
ignored, punctuation dropped, repeats disambiguated `-2`, `-3`, …), and `id` is
allowed on headings only — with layer 2 re-checking the id's SHAPE. The shell's
fragment clearance (`scroll-padding-top`) therefore applies to authored targets
exactly as it does to any other in-page target.

There is no third page-source kind, and nothing else in `content/` is a page source.
Everything the platform publishes from `content/` is a PAGE: a file at any other shape
(`content/README.md`, a stray directory) is never read, so it can neither answer nor
shadow a page.

**Resolution order** (`src/core/page-source.ts` → `PAGE_RESOLUTION_ORDER`), applied
by the ONE resolver (`src/application/page-source-resolution.ts`) through the ONE
composition the routes and the sitemap consume
(`src/adapters/content/page-sources.ts`):

```text
requested-locale JSON    →  requested-locale Markdown
default-locale JSON      →  default-locale Markdown     (only when fallback applies)
```

The default-locale steps apply only when fallback is permitted. **JSON wins over
Markdown within one locale**, and **an exact-locale page always beats a
fallback-locale page**, whatever the format. Both modes are served through the same route,
static-param generation and sitemap; a JSON document is validated against the ONE
page-document schema (`@/core/page-document`), and one that does not satisfy it fails the
build loudly, naming its file, rather than being silently ignored or partially rendered.

Rules that hold for both roots:

- only a file INSIDE a locale directory, at any depth, is a page source — so a
  root-level `README.md` can never become a page, a README beside nested pages is
  equally inert, and `.gitkeep` is ignored;
- a locale directory, or any folder inside it, MAY BE EMPTY — **a directory's
  existence is not publication** — and an unconfigured locale publishes nothing,
  because both the route generation and the sitemap iterate the site's configured
  locales;
- the segment rule has ONE authority (`src/core/page-content.ts`) and the route-path
  rule that builds on it lives in `src/core/page-route-path.ts`, consumed by the
  page-source contract, the discovery adapter, the authoring reader and the
  configuration schema;
- discovery (`src/adapters/content/authoring-source-discovery.ts`) reports what
  the tree holds and nothing else: it decides no precedence and parses nothing;
- every page route — the locale root, the ONE generic `[...path]` route and the
  dedicated `/connect` + `/contact` routes — resolves through this ONE
  composition and renders through the safe page renderer
  (`SafeMarkdownContent`). The trusted collection renderer (`MarkdownContent`) is
  unreachable from a page route, so trusted raw HTML is not a page-authoring
  capability.

**Dependency note (why `sanitize-html`).** The allowlist guarantee cannot be made
honestly with a hand-written regular expression; a real HTML parser applying an
allowlist is the boundary this project accepts. `sanitize-html` (MIT, built on
htmlparser2) is server-side only, imported by exactly ONE module
(`src/adapters/markdown/safe-markdown.ts`), and replaceable behind
`renderSafeMarkdown` — an architecture test asserts the single-importer rule.
#### Declarative JSON page authoring — the second mode's vocabulary (A2)

The Markdown mode is for an ordinary author; the JSON mode is for an advanced one who
needs page composition instead of prose. A JSON page is **data, never code**: an explicit
envelope and an ordered list of sections, every one of them declared here — the
vocabulary IS the schema.

```text
content/pages/json/<site>/<locale>/<route-path>.json
{
  "schemaVersion": 1,
  "title": "…",            // required: page identity, metadata title and the ONLY h1
  "description": "…",      // optional: the page's summary
  "sections": [ … ]        // required, ordered, bounded (40)
}
```

- **ONE document contract** — `src/core/page-document.ts` holds the envelope, the sixteen
  section types (`hero`, `prose`, `media`, `gallery`, `actions`, `callout`, `cards`,
  `features`, `columns`, `steps`, `stats`, `quote`, `table`, `faq`, `list`, `divider`),
  the finite presentation vocabularies (`surface`, `align`, `columns`, `position`,
  `ratio`, `ordered`, `variant`, `tone`), the structural bounds, the list of
  Markdown-bearing fields and the heading outline (`page: 1, section: 2, item: 3`) as
  DATA, plus the ONE Zod schema the types are inferred from (`@/core/contact-inquiry` is
  the precedent for Zod in core). It is framework-free: no filesystem, no React, no
  configuration.
- **STRICT validation.** Every object in the schema is strict, so an undeclared property
  is refused rather than ignored: a typo fails the build and names the file and the
  property (`sections[2].items[0].title`), never silently producing a page with something
  missing. The section union is discriminated on `type`, which is what makes those paths
  precise.
- **Accessibility is structural, not remembered.** An image either carries `alt` or
  declares `decorative: true` — mutually exclusive, so an unnamed content image cannot be
  published. Actions require a label (an accessible name). A table requires column
  headings, and a row must fill them exactly. FAQ answers are required. No document can
  choose a heading level, so the outline cannot be chaotic.
- **Interpretation is ONE reader** — `src/adapters/content/json-page.ts` parses JSON
  syntax (distinguishing malformed JSON from schema-invalid data), refuses an unsupported
  `schemaVersion`, names an unknown section type by VALUE, and validates against the
  schema. It renders nothing.
- **The safe Markdown renderer is reused, never re-implemented.** Every Markdown-bearing
  field goes through the SAME `renderSafeMarkdown` path as the Markdown authoring mode
  (via `SafeMarkdownContent`), so raw HTML in a JSON page is inert and unsafe destinations
  fail closed by the same policy. Paths are validated with `@/core/page-route-path`, and
  destinations with `@/core/safe-url` — the same authorities the Markdown mode uses.
- **ONE presentation boundary** — `src/components/site/page-document-content.tsx` is the
  only place that maps a section type to a presentation, through
  `src/components/site/page-sections/*`, which compose the existing primitives (`Heading`,
  `Grid`, `NavItem`, `SafeMarkdownContent`) rather than new collection-shaped components.
  The switch is exhaustive over the section union (a `never` assignment), so a new type
  cannot be added without a presentation. The composer is site-neutral and
  configuration-independent; the four page routes branch on the MODE, never on a section
  type, and an architecture test asserts both.
- **Assets are the site's normal assets.** An image references a same-site path
  (`/assets/<file>`, mirrored from `content/assets/**`) or an absolute `http(s)` URL.
  There is no second asset subsystem, no source import, and no `next/image` requirement
  (plain `<img>`, like the banner and icon paths).
- **No second route, no second store.** JSON pages use the SAME discovery, resolution,
  precedence (`@/core/page-source`), route, static-param generation and sitemap as
  Markdown pages: a valid JSON page is served, JSON wins over Markdown for the same
  locale+route, nested JSON routes work, and fallback is unchanged. The A1 placeholder
  that refused to serve JSON is gone.

**Deliberately NOT part of the vocabulary.** No executable or author-supplied behaviour
(no JavaScript, expressions, imports, JSX, component names, `eval`, handlers), no raw HTML
or Markdown escape hatch, no styling (no classes, CSS, pixels or `style`), no unbounded
nesting (a section has items; no sections inside sections), and no publishing metadata
beyond title/summary — article dates, feeds and draft states belong to a publishing
capability that does not exist yet and would need its own increment.

**The page title is the ONLY level-1 heading, in both modes.** A JSON document's envelope title
is its `h1` (sections are level 2, item titles level 3, and no field selects a level). The
Markdown mode reaches the same document shape from the other direction: a heading written in a
body is rendered RELATIVE to the page title, so `# Services` becomes `<h2 id="services">` and
`## Website design` becomes `<h3>`, capping at `h6`. Authors therefore keep writing ordinary
Markdown — a `#` heading is still how a section is written, nothing is removed and no page is
refused — while the rendered page cannot contain an authored `h1` at all (`h1` is absent from
the Markdown allowlist, so even a renderer mistake could not add one). The heading's generated
fragment id is derived from its WORDS, not its level, so section links
(`[hours](#opening-hours)`) and their sticky-navigation clearance are unaffected by the shift.

### `public`


### `public`

Static files served directly by the web application. The generated namespaces —
`public/assets/**` (shared platform artwork) and `public/spokes/<segment>/assets/**` (one
Spoke's own replaceable artwork) — are GENERATED mirrors of the user-editable source tree
`content/assets/**` (written by `scripts/sync-runtime-assets.mjs`); they are never edited by
hand, and `assets:check` fails on any drift between source and derivative.

### `tests`

Tests that cross application boundaries or require external/runtime behavior.

Unit tests should remain close to the code they test where practical.

## Write Ownership

Repository tooling and tests write only into the domain they own. There are exactly THREE sanctioned
durable writers, each with the ONE target it derives from the deployment authority:

| Writer | The only domain it may write |
| --- | --- |
| `scripts/sync-runtime-assets.mjs` | `<repo>/public/assets/**` and `<repo>/public/spokes/**` — the generated runtime namespaces (B3C1 / S3E1C) |
| `scripts/generate-country-code-reference.mjs` | `<selected deployment>/content/COUNTRY-CODES.md` (B3A) |
| `scripts/ci/change-scope.mjs` | `$GITHUB_OUTPUT` — the CI runner's own file, never repository state |

Everything else that writes is TEST SCRATCH: OS temp state, the synthetic deployment's disposable copy
(`tests/support/synthetic-deployment-root.ts`), a disposable copy of the SELECTED deployment
(`tests/support/disposable-deployment.ts`) and the owner's own ignored report directory
(`tests/browser/.report/**`). Foundation application code (`src/**`) contains no filesystem writer at all.

A deployment's authored state — `site.config.json`, `config/**`, `content/pages/**`, `content/assets/**`
and the generated `content/COUNTRY-CODES.md` — is READ by tests and by the browser harness, and is never
their fixture storage. A test that needs WRITABLE deployment state takes a disposable copy of the selected
deployment through the authority's own override selection, so no test depends on successful cleanup to
protect an owner's content (the ISO-C1 lesson).

This is NOT a ban on writing a deployment: a spoke's owner — or a workflow acting for them — authors its
own configuration, dictionaries, pages, artwork, generated documents and operational state. What is
forbidden is uncontrolled repository tooling and test execution treating shipped production state as
scratch space. Enforcement is deliberately small: an exact writer inventory plus sanctioned-writer
contracts (`tests/architecture/write-ownership-guard.test.ts`), a write guard around the browser harness
(`tests/browser/scratch.mjs`), and a runtime before/after manifest of the real deployment's authored state
around both Vitest projects (`tests/setup/production-state-integrity.ts`). Deployment-local rules are in
`deployment/AGENTS.md`; harness-specific ones in `tests/browser/README.md`.

## Dependency Direction

## Dependency Direction

The intended dependency direction is:

`core`
↓
`application`
↓
`adapters`

Presentation/framework code composes these capabilities.

The dependency direction must not be reversed.

In particular:

- `core` must not import from `application`, `adapters`, `components`, or `app`.
- `application` must not import concrete adapters.
- `components` must not contain domain business rules.
- `app` should remain a thin framework boundary.
- Concrete infrastructure must remain replaceable.

## Backend Evolution

The initial implementation is frontend-only.

Future backend capabilities should be introduced through application ports and
adapters rather than coupling the domain directly to a backend technology.

Possible future infrastructure includes:

- APIs
- databases
- authentication
- external content systems
- hosted services

The architecture should allow these to be introduced incrementally.

## Hosting and Deployment

The platform targets Vercel as its primary infrastructure provider.

Constraints and rules:

- The locale-detection proxy (`src/proxy.ts`) requires a host with
  edge-middleware support. Plain static-file hosting without middleware is
  not sufficient for this application.
- GitHub triggers deployments: pushes to `main` deploy to production, and
  pull requests receive preview deployments gated by CI.
- Vercel-specific APIs must not leak into `core`, `application`, or
  `adapters`. Hosting is an infrastructure detail composed at the outermost
  boundary.
- No environment variables are required today; deployment-specific values
  (such as the production origin) are owned by `src/config`.
- Hostnames resolve to Spokes in exactly three accepted kinds, and nothing else
  (FOUNDATION-MULTISITE-M20, extended M22): an exact authored Spoke hostname selects that
  Spoke; a hosting-platform **inspection** hostname the platform itself reports for this build
  (Vercel's `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`) selects the Spoke
  the Installation names in `"inspectionSpoke"`; and a deployment-owned **inspection alias** the
  Installation authored (`"inspectionHosts"` — a permanent provider project alias, which no build
  variable reliably carries) selects that same Spoke. Every other hostname is refused with a 404.
  Both halves of the policy are explicit — never a first-declared fallback — and the authored
  aliases are exact normalized hostnames that may not restate a Spoke's own hostname, may not be
  declared without a nominated Spoke, and may not contain a wildcard: there is no suffix rule, no
  Vercel API call at request time and no provider mutation.
- **Node.js**: the tested contract is the **24.x line**, and `package.json` pins
  `"engines": { "node": "24.x" }`. Node 24 is what every CI job runs
  (`.github/workflows/ci.yml`), what the hosting platform's build image is configured to provide, and
  what the release's own `requirements.node` names (`package.json` → `engines.node`, carried into every
  release manifest) — ONE deliberate baseline, so no build overrides it and no warning is left
  unexplained. A newer major is not adopted merely because it exists.
- **Where to read more**: this file and the manuals in
  [`instruction-manuals/`](instruction-manuals/README.md) are for anyone running a Foundation
  site. The full Provelopment-level compendium — installation structures, upgrade strategies,
  ownership transfer, cohorts and blast-radius choices — is the programme documentation
  (`.documentation/`), which deliberately goes deeper than this public guide.

See `DEPLOYMENT.md` for the operational runbook.

## Installation, Spoke Hub, Spoke, Site Hub, Site

The deployment vocabulary, from the outside in. The levels are never shortened, because they are different
concepts:

```text
Foundation Application          the reusable open-source platform (this repository)
        ↓
Foundation Installation         one independently operable adoption of it
        ↓
Spoke Hub                       the installation's coordinator of its Spokes (no hostname of its own)
        ↓
1..* Spokes                     independently addressed public origins sharing this installation's lifecycle
        ↓
1..* Site Hubs                  internal groupings of Sites inside ONE Spoke (no hostname)
        ↓
1..* Sites                      a global/country/regional context inside a Site Hub (ww, de, ca, fr …)
        ↓
1..* Page Hubs                  the language-neutral identity and route of one page
        ↓
1..* localized Page representations   one language's authored representation of that page
```

- A **Spoke** is an independently addressed domain (`acme.com`), never a Site and never a Hub. A **Site Hub** groups
  Sites inside one Spoke; a **Spoke Hub** coordinates Spokes inside one installation. Neither a Site Hub nor a
  Spoke Hub is a hostname, and the two are not interchangeable.
- **The two organisational layers, and their names** (FOUNDATION-ID-M2). A **Spoke Hub** is the OUTER layer — the
  coordinator of an installation's Spokes (`SpokeHub`). A **Site Hub** is the INNER layer — the grouping of Sites
  inside ONE Spoke (`Hub`, exported from `@/core/spoke` also as `SiteHub`, with `SiteHubId` and
  `SiteHubIdentity`). Those explicit names are compile-time ALIASES of the same entity: vocabulary, not a second
  layer, and the older names remain supported unchanged.
- **A Site Hub is not a lifecycle boundary and not an upgrade cohort.** Nothing is upgraded, rolled back or promoted
  per Site Hub, and a Site Hub never spans Spokes.
- A **Site** is a context inside a Spoke (a country, or the global one) — not a domain. Several Sites may live on
  one domain, and one Site may be served in several languages.

### What exists today, and what is approved but NOT yet implemented

Both layers are STRUCTURAL. How many of each an installation composes is a separate question, and the answer
today is narrower than the approved target. These two lists are not each other:

**Already implemented, and unchanged by this milestone:**

- ONE implicit Spoke Hub per installation — the outer coordinator of its Spokes, with no id of its own.
- One or more Spokes, declared by the manifest and independently addressed: the request hostname selects exactly
  one Spoke through that Spoke's declared, EXACT hostname claims, and an unclaimed hostname is refused.
- Site Hub grouping: one implicit Site Hub per Spoke, or the several the authored `sites[].hub` leaves name
  (all-or-none) — a Site Hub never being publicly addressed.
- Each Site's own locale support.
- The pure `(BusinessId, SiteId)` domain CONTRACTS merged in FOUNDATION-ID-M1 — the types, the grammar and the
  composite identity — which exist but are NOT yet connected to managed-mode Site resolution.

**Approved, and NOT implemented:**

- SEVERAL independently identified Spoke Hubs per installation.
- Spoke ids scoped to their owning Spoke Hub.
- Managed-mode composite Site ownership and resolution: `(BusinessId, SiteId)` carried through membership and
  lookup.
- The identity-safe addressing, content, dictionary and asset isolation that managed mode implies.

| Layer | Today | Approved, not implemented |
| --- | --- | --- |
| **Spoke Hub** | exactly ONE per installation, implicit and with no id of its own | SEVERAL independently identified Spoke Hubs per installation |
| **Spoke** | one or more, declared by the manifest; Spoke ids unique installation-wide | Spoke ids local to, and scoped by, their owning Spoke Hub |
| **Site Hub** | one implicit Site Hub per Spoke, or the several its `sites[].hub` leaves name; scoped to its Spoke either way | none — Site Hubs stay scoped to individual Spokes |
| **Site** | the EXISTING authored Site context (`sites[]`), resolved exactly as it always was; the `(BusinessId, SiteId)` contracts exist but are not connected | managed-mode composite Site ownership and resolution |
| **Locale** | per Site — already independent | none — locales stay independent within each Site |

FOUNDATION-ID-M2 adds NAMES, not capability: it changes no runtime behaviour at all, and no configuration leaf,
route, hostname rule, membership algorithm or resolved Site population changes with it.

### The organizational Spoke Hub boundary, and the Spoke-Hub-scoped Spoke switcher (R1)

The levels above are STRUCTURAL. One ORGANIZATIONAL rule sits on top of them, and it is binding:

- **In the CURRENT implementation, ONE Installation composes ONE Spoke Hub** for organizational/navigation
  purposes, and every Spoke that Installation declares is a **member** of it. (The approved target's SEVERAL
  independently identified Spoke Hubs per Installation are not implemented — see above.) **The declaration is
  the whole membership boundary** — there is no `hubId`, no organization registry and no second membership
  record anywhere in the platform.
- A **Spoke-Hub-scoped Spoke switcher** (`spokeSwitcher`, the fifth manifest leaf) may therefore offer **only**
  declared members, and every option's destination must route back to the member it names — its canonical
  origin, one of its additional hostname claims, or an inspection hostname the policy nominates for it. The
  ROUTING CHECK is the enforcement mechanism: an unrelated organization's hostname is refused at build time
  because it is not a routing claim of any member.
- A **domain suffix does not determine membership**: `support.acme.com`, `acme.de`, `acme-australia.com` and
  `www.acme.com` may be members together when they are **declared** in the same Installation; an unrelated
  `www.abc.com` is not switchable in that Spoke Hub no matter how its URL is authored.
- **Template/provisioning lineage is NOT Spoke Hub membership.** A centrally managed template (for example a
  white-label reseller template for several countries) may later provision and update INDEPENDENT
  Installations. That is a template/update relationship: using such a template does **not** place a reseller's
  website in the template owner's Spoke Hub switcher, and an autonomous reseller or customer remains its **own**
  Spoke Hub / Installation. Only being declared as a Spoke in the same manifest creates membership.

**The dimensions are not each other**, and the switcher collapses none of them:

| Dimension | What it is | Control that moves within it |
| --- | --- | --- |
| **Spoke Hub** | the OUTER organizational/navigation boundary — ONE per Installation today | none: it is the SCOPE the switcher moves within |
| **Spoke** | a complete website/domain context, a member of exactly one Spoke Hub | the Spoke-Hub-scoped Spoke switcher (`spokeSwitcher`) |
| **Site Hub** | the INNER grouping of Sites inside ONE Spoke (no public address) | none: it groups Sites, it is never addressed and never switches |
| **Site** | a country/global context INSIDE one Spoke | the Site selector |
| **Location** | a physical/business location INSIDE one Site | the Location selector |
| **Language** | an independent locale dimension | the Language selector |

So the Spoke switcher moves **Spoke → Spoke within the SAME Spoke Hub**. It is not Site switching, not Location
switching, not Language switching, and not arbitrary external navigation.

## The installation is the boundary

**A Foundation installation is the smallest Foundation lifecycle unit.** One installation is:

- the **ownership and transfer** boundary — it can be handed to someone else whole;
- the **hosting, upgrade and rollback** boundary;
- the **health and operational-state** boundary — one baseline and one operational record per installation;
- the **blast-radius** boundary: one installation failing, updating, upgrading or rolling back never alters
  another, and the runtime has no sibling-installation awareness at all.

Choose the boundary by the smallest unit that may ever need to be owned, transferred, hosted, upgraded, rolled
back or operated separately. **If two websites may need independent Foundation versions or owners, they belong
in separate installations** — do not couple them merely because one organisation happens to run both today.
Grouping similar websites (by risk, feature use or upgrade cadence) is done with *separate installations*, never
with Spoke Hubs or Site Hubs.

## Update, Upgrade and rollback

| Operation | Foundation release | Authored pages/assets | Scope |
| --- | --- | --- | --- |
| Install | established | established | the whole installation |
| **Update** | **unchanged** | changed | one or more Spokes, promoted as ONE installation candidate |
| **Upgrade** | **changed** (a different immutable release) | carried forward | the whole installation — every Spoke together |
| Rollback | the previous live release — or the SAME release after an Update | restored with the revision | the whole installation |

An installation has exactly **one live Foundation release**: there is no per-Spoke release field anywhere, and a
Spoke never carries an upgrade state of its own (`src/core/foundation-installation/README.md`). Update and
Upgrade are distinct lifecycle kinds, and an operation that contradicts the release it names is refused rather
than recorded under the wrong name — a failed Update leaves the live revision exactly as it was, and the
Foundation release unchanged.

An Update's logical blast radius is the Spoke whose authored bytes changed, but its **promotion boundary is the
whole installation**: nothing is half-promoted, and a failed candidate leaves the existing live revision
untouched, every Spoke included. Upgrading happens **in place** (build, validate, stage and inspect a candidate
on the new release, then promote the installation) or by standing up a **clean installation on the new release**
and moving Spokes into it one at a time or in batches. Both are operational strategies; the platform ships no
automatic fleet or migration executor, and independent installations are upgraded independently.

## Foundation releases

A Foundation **release** is a deterministic, platform-only **source set** constructed from one accepted
Foundation `main` commit and identified by an immutable contract tag: the canonical
`provelopment-foundation-vYYYYMMDD.HHMM` (the UTC publication minute) for every release after the first,
which is grandfathered as `v2026.09.30-foundation-release-initial`. A deployment **consumes and pins** a
release; it never consumes another deployment, and no Foundation release requires reference-deployment
state to exist.

- The release content boundary is **machine-owned, not prose**: every tracked path is classified by ONE
  policy as platform content or repository/deployment/build state, and a path nobody classified fails
  release construction rather than being silently included or silently dropped.
- `deployment/**` (the reference deployment's authored state and acceptance suite), this repository's
  own CI and every generated path (`public/**`, build output, dependencies) are excluded. The reference
  deployment is a bounded compatibility **canary** — never a release input.
- A release records its **source commit and tree** and a **normalised content digest** of its payload, so
  an adopted release can be verified by whoever received it and a previously adopted release can be
  re-materialised deterministically.

The mechanism, the content policy, the manifest schema, the digest definition and the
construction/verification procedure live in
[`scripts/release/README.md`](scripts/release/README.md).

## Re-brandability

A downstream project should be able to change its:

- brand identity
- visual theme
- content
- navigation
- contact information
- social links
- enabled features

without modifying the platform's core business/application logic wherever
practical.

## Internationalization

The platform supports multiple locales as a first-class concern.

### Locale routing

All user-facing routes live under a `[[...segments]]` dynamic segment, for example
`/ww/en/about`. Supported locales and the default locale are defined in
`src/config`.

Requests without a locale prefix are redirected by `src/proxy.ts` (Next.js
16's renamed middleware) using, in order:

1. the `NEXT_LOCALE` cookie,
2. the `Accept-Language` header,
3. the configured default locale.

### UI strings

User-facing interface strings ("dictionaries") live in
`config/i18n/<locale>.json` and must validate against the Zod `dictionarySchema`.
Hard-coded user-facing copy in reusable components is a violation of this
boundary.

Dictionaries are **discovered from the data surface**: the registry
(`src/config/i18n/registry.ts`) reads every `config/i18n/<locale>.json` at
load time, validates each against `dictionarySchema`, and verifies every
locale enabled in `site.config.json` has a matching file. There is no
hard-coded import list, so adding a locale is `site.config.json` + one JSON
file. A malformed dictionary or a configured locale with no dictionary fails
the build with an actionable error; only locales that are NOT configured fall
back to the default locale's dictionary.

### Localized content

Pages are organized per locale under `content/pages/markdown/<site>/<locale>/` (and
`content/pages/json/<site>/<locale>/`), and a nested page keeps the same structure one level
deeper (`content/pages/markdown/<site>/<locale>/offerings/website-design.md`), so a second
language mirrors the first exactly.
The page composition accepts a locale and falls back to the default locale when
a translation has not been authored yet. Missing translations must not
produce broken routes.

### SEO

Each locale is treated as a distinct page:

- `<html lang>` reflects the active locale.
- Pages expose `alternates.languages` (hreflang) including `x-default`.
- The sitemap lists every route for every supported locale.

Adding a new locale is a configuration-level change: register the locale in
`site.config.json`, add `config/i18n/<code>.json`, and author its content.
Platform logic must not require modification (dictionaries are discovered
from `config/i18n/` at load time).

## Business profile & hours

- **Configuration owns the data.** The `business` block in `site.config.json`
  (locations, hours, contact, timezone, type) is validated by the config
  schema and normalized by the loader to the framework-free `Business` shape
  in `src/core/business.ts`.
- **Timezone safety.** Timezones are validated against the runtime `Intl`
  timezone table at build time; an invalid identifier fails configuration with
  an actionable error. Evaluation precedence:
  `location.timezone → business.timezone → "Etc/UTC"`.
- **One hours model.** `src/core/business-hours.ts` evaluates regular and
  exceptional intervals identically. `close < open` is an overnight interval
  that carries into the next morning; an exceptional `closed` suppresses its
  date; a prior night's overnight interval is never revoked by the next day's
  schedule. `open === close` is rejected as ambiguous. All evaluation uses
  wall-clock resolution in the location's IANA timezone (DST-safe via `Intl`).
- **UI.** The footer renders each location's weekly schedule with localized
  day labels, its exceptional/holiday dates, a timezone indicator, and a live
  "Open now/Closed" badge computed client-side in the location's timezone —
  statically generated pages therefore never bake a build-time timestamp.
- **Structured data.** The config-driven JSON-LD (`Organization` /
  `LocalBusiness`) includes an `openingHoursSpecification` built from the
  configured intervals.
- **Locale-aware NAP resolution (Phase G).** A location may carry an optional
  `locales` map keyed by BCP-47 locale code, each value a partial override of
  `address`/`phone`/`geo`. `resolveLocationForLocale(location, locale)` in
  `src/core/business.ts` resolves it (per-field address merge, deterministic
  fallback: locale override → global location → existing behavior); a missing
  override never throws. `resolveBusinessForLocale(business, locale)` resolves
  every location. The footer (`BusinessInfo`) and the JSON-LD (`StructuredData`)
  both consume these shared resolvers, so visible data and structured data can
  never diverge. A locale is a visitor context, not a geography mapping, and
  no locale list is hard-coded in `src/` — adding an override is a
  configuration/data change only. `timezone` and `hours` deliberately stay at
  the location level (single global operating schedule) and are not localized
  in Phase G.

## Locale-specific business identity & address representation (Phase I)

Business identity is **owner-configured, per market** — the Foundation provides
the model, resolution, validation and presentation, never the data. A locale is
a customer context, never an implicit country: no `locale → country → phone`
inference exists anywhere in `src/`.

- **Customer-facing contact per locale.** `business.contact` may carry a
  `locales` map (keyed by BCP-47) of partial `{ email?, phone? }` overrides.
  `resolveBusinessContactForLocale(contact, locale)` (in `src/core/business.ts`)
  applies a locale override's fields, falling back to the global contact
  per-field; `resolveBusinessForLocale` resolves **contact and every location
  together**. `BusinessInfo` (footer) and `StructuredData` both consume the
  resolved business, so visible and structured contact can never diverge.
  Precedence: locale override → global contact.
- **Two structured address representations.** A location has `address`
  (native/local) and an optional `addressInternational` (Latin/international
  form of the same place) plus `addressMode` (`"local"` → local only,
  `"local-international"` → local + Latin). Both forms are **owner-supplied** —
  no transliteration, translation or geocoding is ever performed.
  `addressMode` is a **display** control for human-facing pages only.
- **Resolution & validation.** `resolveLocationForLocale` merges the native
  form per-field, the international form per-field (override → base), and the
  mode per-value (default `"local"`). `assertValidAddressPresentation(business,
  locales)` — called by the loader at build time — enforces that
  `local-international` **requires** `addressInternational`, for the base
  location and every locale override, throwing a descriptive error naming the
  offending location/locale instead of silently dropping the Latin form.
- **Consumer rules (each reads the same resolved location):**
  - Visible UI (footer): follows `addressMode`.
  - JSON-LD / structured data: `addressInternational ?? address` (global machine
    readability — Latin is not treated as "more valid", it is simply preferred
    when owner-supplied).
  - Directions/maps: geo coordinates first; otherwise the address query prefers
    `addressInternational ?? address`. The provider adapter only formats the
    already-resolved location — no locale/address logic moves into it.
- **Adapter boundary enforced (F2).** A boundary guard in `boundaries.test.ts`
  asserts that concrete provider adapters under
  `adapters/{maps,booking,analytics,contact-inquiry}` are importable only by
  their directory factory (`index`) or by tests — arbitrary
  application/UI/domain code must consume the capability seam/factory. The
  pre-existing `adapters/content/**` content repository is explicitly excluded.
- **Booking label invariant (F1).** When `features.booking.provider =
  "external-url"`, every configured locale must provide a non-empty
  `dictionary.booking.book`. `assertBookingLabelPresent` (defined in
  `src/config/i18n/invariants.ts`, re-exported by `src/config/i18n/index.ts` and run at build time; the
  production binding is ONE `RuntimeDictionaryAccess` for the current build context — S3F2A2-D2 — and
  applies the SAME rule when that access is created) throws a descriptive error
  naming the offending locales instead of silently hiding an enabled CTA.
  Disabled/absent booking requires no label.

## Regionalized pages & operating context (Phase K)

Phase K separates **Locale** (how the site communicates) from **Region**
(where and under what operational conditions the business operates) from
**Page** (which content/route the customer sees):

```text
Page = locale + content slug + optional region
Region = timezone + address + geo + contact + seven-day hours + holidays
```

- **Model (`src/core/region.ts`).** `OperationalRegion` carries its own
  required IANA `timezone`, address (+ optional international), geo, phone,
  email, and a seven-day `RegionSchedule` (monday…sunday, each an array of
  `HH:mm` intervals) plus structured `holidays` (`date` + `name` + `closed` /
  `intervals`). `PageRegionBinding` maps `(locale, slug) → region id`. Pure
  `resolvePageRegionBinding` / `resolveRegion` never throw; `assertRegionsValid`
  (build time, from the loader) rejects unknown regions, duplicate bindings,
  unconfigured locales, `local-international` without an international address,
  and invalid holiday dates/names.
- **Evaluation (`src/core/region-hours.ts`).** Regions reuse the ONE
  DST-safe time engine: `openStatusFromIntervalsStartingOnDay` in
  `src/core/business-hours.ts` (extracted so locations and regions share one
  algorithm). Holiday precedence is *weekly schedule → date override → resolved
  hours* — a listed holiday without intervals is closed. Overnight intervals
  (`close < open`) carry into the next day, including from a holiday.
- **Page context (`src/application/page-context.ts`).** The single, pure
  compositor: `resolvePageContext(regions, bindings, locale, slug)` yields the
  page's optional region. The dynamic route `app/[[...segments]]/[slug]/page.tsx` is
  the ONLY consumer of page→region resolution; it statically lists per-locale
  content slugs minus those owned by static routes (`about`, `contact`,
  `resources`), so page existence stays content-driven and per-locale.
- **Route/timezone authority.** A regional page's timezone, address, phone,
  email, geo, hours, holidays, status, directions, and JSON-LD come ONLY from
  its resolved region — never inferred from locale, and never merged with the
  legacy global `business` block. `locale → timezone` is not a rule: `/ww/en/toronto`
  (America/Toronto) and `/ww/en/los-angeles` (America/Los_Angeles) are different
  timezones for one locale; `/ww/en/toronto` and `/fr/toronto` share one region.
- **Consumers.** `components/site/region-block.tsx` renders the resolved
  region's visible identity (address, phone/email, IANA timezone, all seven
  days individually with locale-localized names, holidays, live open/closed
  status, directions via the existing maps seam — `regionToLocation` adapts a
  region to the `BusinessLocation` port without giving the adapter region
  awareness). `components/site/region-structured-data.tsx` emits ONE
  `LocalBusiness` node for the resolved region. Non-regional pages render no
  operational NAP/JSON-LD — they must not invent an identity.
- **Deterministic modal precedence.** `business.regions` present (non-empty)
  → the site is in regional mode: the layout/footer suppress the legacy global
  `BusinessInfo`/`StructuredData` so nothing can leak. `business.regions`
  absent → the legacy global model renders exactly as before (Phase G/I
  behavior). The two are never merged.
- **Sitemap.** Routes are derived per locale from that locale's content
  (page inventories may differ), so `/ja/toronto` is never emitted and a
  regional page only appears where it exists.

## Locale + Location as first-class page context (Phase L)

Locations are **not** ordinary navigation links. A rendered page is the
product of two independent selectors — **Language** and **Location** — plus the
content page:

```text
Page = locale + region + page      (e.g. /en/toronto/about)
```

- **URL model.** `/{locale}` (site home), `/{locale}/{region}` (regional
  landing), `/{locale}/{region}/{page}` (regional page). The ONE generic page
  route `[[...segments]]/[...path]/page.tsx` serves every page (flat or nested) and keeps
  `dynamicParams = false`, so a path that no page answers is a proper 404
  (e.g. `/ja/toronto`, `/ww/en/toronto/contact`).
- **Config shape (`business.pages`).** Entries are `{ locale, region }`
  (landing) or `{ locale, region, slug }` (regional page). Every bound
  `(locale, region)` MUST have a landing entry (validated at build time);
  duplicate `(locale, region, slug)` entries fail; region ids may not collide
  with static route slugs. The Phase K form `{ locale, slug, region }` with
  `slug === region` is migrated automatically by the loader.
- **Pure resolution (`src/core/regional-pages.ts`).** `regionsForLocale`,
  `pagesForRegion`, `hasPageEntry`, `resolveLocationDestination`,
  `resolveLocaleDestination`, `regionalPath`, `parseRegionalPath`, and
  `buildRegionalLanguageAlternates` answer every inventory + navigation
  question. Components receive resolved options/destinations; there is no
  `RegionalService<T>`-style abstraction.
- **Deterministic switching.** Switching LOCATION keeps the locale: same page
  → landing → (defensively) first configured page → option omitted (never a
  dead link). Switching LANGUAGE keeps the region: same page → landing → first
  page → the locale simply is not offered (never a silent region change).
  The header renders a Location `<select>` beside the Language `<select>`;
  both are config-driven, show the active selection, and produce real URLs
  (no client-side state determines the current location).
- **Page independence.** Any region may expose any page inventory under any locale: a
  regional page exists exactly when it is BOTH authored as a page AND bound for that
  `(locale, region)` in config. The private reference demo proves same locale →
  different timezones and currencies (e.g. en/sydney with AUD, en/london with GBP,
  en/toronto with CAD, en/new-york with USD) and same region → multiple locales
  (en+fr toronto).
- **Regional content is PAGES with region chrome (A1E).** `/{locale}/{region}` is the
  region's landing and `/{locale}/{region}/{page}` a configured regional page; both are
  ordinary page sources resolved through the ONE composition, and the region supplies
  the operational identity (timezone, address, contact, hours, holidays, status,
  directions, JSON-LD). Nothing else inside a region's namespace is served, so a
  regional URL can never render without its region. The former regional offerings
  routes (and their per-region price/currency resolution) went with the offerings
  collection.
- **SEO.** Regional pages emit canonical URLs, hreflang only for genuinely
  configured `(locale, region, page)` equivalents (with landing fallback for
  a region that lacks the exact page), and `x-default` only when the default
  locale has a destination. The sitemap contains only real configured
  combinations — regional content slugs are not double-emitted as flat routes.

## Selector semantics, Connect & template identity (Phase M)

Phase M makes the two-dimensional UX explicit and unambiguous without
redesigning the Phase K/L model.

- **Location selector inventory & alphabetical sorting.** The **Location** selector lists
  every CONFIGURED operating location (`business.regions` is authoritative) in strict
  alphabetical order (Berlin, Jakarta, London, Los Angeles, Madrid, Moscow, New York,
  Paris, Seoul, Shanghai, Sydney, Tokyo, Toronto) plus a permanent leading **Unspecified** option.
  Option text is computed via `regionDisplayName(locale, region)`:
  - In non-English locales: the selected language name appears first, followed by the English
    name in brackets if distinct (`서울 (Seoul)`, `東京 (Tokyo)`, `Londres (London)`).
  - In the English locale: the English name appears first; for locations whose primary
    language is non-English, the native name appears in brackets if distinct (`Tokyo (東京)`,
    `Seoul (서울)`, `Moscow (Москва)`), while English-primary locations omit brackets (`London`,
    `Sydney`, `New York`).
  The **Language** selector lists locales with the default locale (English) pinned first,
  followed by all remaining locales in alphabetical order.
- **Unspecified location.** Explicitly labeled (never a bare "Location" that
  reads like a real location). Selecting it returns to the equivalent
  non-regional page: `/ww/en/toronto/about` → `/ww/en/about`, `/ww/de/berlin` → `/de`
  (`unspecifiedDestination`). Generic pages still invent no operational
  identity.
- **Deterministic locale on a location switch.** When the current locale is
  not bound to the target region, the destination becomes the region's
  configured **`defaultLocale`** + its landing (a forced locale change ends at
  the landing; the page is never preserved across it). `defaultLocale` is
  explicit per region (validated at build time: it must be a configured locale
  AND bound to the region); absent, it derives from the region's first landing
  binding. Never inferred from country/browser/timezone.
- **Region-aware navigation.** Primary/footer navigation is resolved through
  the URL-authoritative `ContextNavLinks` client component + the pure
  `resolveNavHref` core function. In a regional context only pages that
  actually exist for `(locale, region)` are exposed — a nav item never
  promises one page and silently delivers another, and never silently drops
  the visitor into the generic context. `href === "/"` always resolves to the
  regional landing: **Home means home for the currently selected location**.
  Global pages reachable from regional contexts are an explicit future
  configuration concept, not an implicit fallback.
- **Connect page + configuration.** `site.config.json` gains a small
  domain-specific `connect.methods` array (`{ id, label, href, demoOnly? }`).
  The Connect page (`/{locale}/connect`, static route like About) renders each
  mode + a visible demo notice; `demoOnly` entries carry a demo badge. The
  Contact page stays at `/contact` with a visible "not connected to a real
  backend" notice (no fake backend, no provider). The footer's **Connect**
  column carries the Connect/Contact page links + methods + `socialLinks`;
  Contact no longer appears under **Navigate**.
- **Template identity.** The Foundation demo brand is "Your Business Site"
  (name, header, metadata, demo copy); "My Site" is gone from visitor-facing
  output. Adopters keep their own brand.

## Presentation localization & Connect UX (Phase M refinement)

A focused consistency pass over Phase M — no architecture redesign, no new
service layer, no changes to the hours/DST engine or the region authority
model. All presentation data is explicit configuration or the platform's
`Intl` table; nothing is inferred from country/browser/timezone.

- **Display-name helpers (`src/core/display-labels.ts`, framework-free).**
  `displayNameWithEnglish(localized, english)` shows `Localized (English)`
  only when the two differ (never `English (English)` / `Toronto (Toronto)`).
  `regionDisplayName(locale, region)` renders the **location selector** names:
  `region.labels[locale]` where configured, else the canonical English
  `region.label ?? name ?? id`, with the English suffix when different
  (`東京 (Tokyo)`, `Montréal (Montreal)`). `locale`'s are nothing more than
  labels; region ids stay language-neutral.
- **Language selector.** `i18n.locales[].englishLabel` (explicit config) +
  `displayNameWithEnglish`: `Français (French)`, `Deutsch (German)`, …
  applied in the one shared switch, on every page and regional context.
- **Timezone in the Business Hours heading.** The timezone is no longer a
  standalone element beside the hours block. Both `RegionBlock` and the
  legacy `BusinessInfo` render `Hours (Time Zone: <localized (<English>) —
  <IANA>)` as ONE heading unit. Human names come from
  `Intl.DateTimeFormat(...).timeZoneName` (the platform ICU table) against a
  fixed reference date for determinism; the English parenthetical is omitted
  when identical; the authoritative IANA identifier is always present. The
  DST/hours engine is untouched.
- **Footer Connect section = pure gateway.** The section **heading IS the
  `/connect` link** (`ContextConnectHeading`, resolved via the same
  URL-authoritative `resolveNavHref` the header uses — regional contexts get
  `/{locale}/{region}/connect`, absent regional pages render no link). Beneath
  it sit ONLY the configured connection methods through `ContextNavLinks` (no
  duplicate Connect item, no separate Contact item). Method labels come from
  ONE shared helper **`connectMethodLabel`** (`dictionary.connect.methods[id]`
  → config fallback), used identically by the Connect page and the footer.
  The `/contact`-backed **Message Us** action is the single message-form
  action and is omitted in regional contexts where `/contact` is not a
  regional page (no invented URLs, no silent locale/location reset — external
  deep links can never reset context).
- **Viber.** Added to the demo as a configured `connect.methods` entry
  (`viber://chat?number=…`, `demoOnly: true`) — Connect page + footer both
  derive it purely from configuration. No provider/SDK/backend.
- **Message Us naming.** The connection action is consistently "Message Us"
  (config label + `dictionary.connect.methods.message`); the technical route
  stays `/contact`; the Contact page keeps its explicit demo-only notice.

## Contact inquiry (Phase B)

The inquiry capability is a frontend + integration seam: `/contact` renders a
config-driven, localized form; submissions flow through a server action into a
framework-free application port; the adopter owns the receiving system.

- **Layering:** browser → `src/app/[[...segments]]/contact/page.tsx` +
  `src/app/contact-actions.ts` (thin Next.js boundary) →
  `src/application/contact-inquiry-service.ts` (orchestration: honeypot →
  Zod validation → sender) → port `src/application/contact-inquiry-sender.ts`
  (`ContactInquirySender`) → adapters in `src/adapters/contact-inquiry/`
  (`webhook`, `stub`). Core `src/core/contact-inquiry.ts` owns the shared
  schema and types (framework-free; validated server-side and mirrored by the
  client).
- **Providers:** `features.contact: { provider: "webhook" | "stub" }`.
  No feature → explicit "not configured" page state. `stub` is the default and
  returns an explicit "nothing was sent" demo result; the webhook is the only
  production-capable path and there is **no mailto adapter**.
- **Misconfiguration:** a webhook provider without `CONTACT_WEBHOOK_URL`
  throws `ContactInquiryMisconfigurationError` at the server action (the
  earliest runtime boundary — no build-time secrets required) and surfaces as a
  distinct "misconfigured" state; it can never silently act as the demo stub.
  Non-loopback webhook endpoints must be HTTPS.
- **External contract (minimal):** POST
  `{ id, name, email, subject?, message, locale, submittedAt }`; a UUID `id`
  gives adopters a correlation/idempotency key without any Foundation storage.
  No visitor telemetry is collected.
- **Security model:** server actions are POST-only endpoints with an implicit
  per-build Action ID; Next.js enforces a same-origin check (Origin is compared
  against Host/configured origins; mismatch → HTTP 403), which is Next.js's
  CSRF mitigation. The honeypot (`website` field, discarded before validation)
  adds bot defense. Request/response payload limits are enforced by the shared
  Zod schema; no inquiry contents are ever logged; rate limiting is the
  adopter's responsibility.

## Provider Integration Pattern (Phase H)

External services are integrated through a small, **domain-specific** hexagonal
seam. There is deliberately **no generic `ExternalService<T>` abstraction, no
provider registry, and no DI container** — each capability owns its own port,
result types, configuration, and adapters, and they share a documented
convention rather than a shared runtime substrate.

```
Business capability
      ↓
small port                  (src/application/<domain>.ts)
      ↓
provider factory            (src/adapters/<domain>/index.ts)
      ↓
small adapter               (src/adapters/<domain>/<provider>.ts)
```

The four current seams:

| Capability | Port | Adapters | Provider config |
|---|---|---|---|
| **Maps directions** | `DirectionLinkResolver` (`direction-link.ts`) | `maps/{google,none}` | `features.maps` |
| **Booking action** | `BookingActionResolver` (`booking-action.ts`) | `booking/{external-url,none}` | `features.booking` |
| **Analytics** | `createAnalyticsProvider` factory | `analytics/{index,vercel-analytics}` | `features.analytics` |
| **Contact inquiry** | `ContactInquirySender` | `contact-inquiry/{webhook,stub}` | `features.contact` |

Guiding rules:

- **Domain-specific ports.** A port is the smallest interface that expresses the
  business capability (a directions action, a booking action, a sender). Ports
  live in `src/application`, depend only on `src/core`, and never import
  adapters or provider SDKs.
- **Adapters own provider behavior.** The concrete provider implementation
  (URLs, SDKs, network, secrets) lives entirely inside `src/adapters/<domain>/`.
  A deep-link maps provider is **keyless** (a public address/coordinate in a URL
  is not a secret); if a future provider needs credentials, it introduces its
  own env-backed configuration without contaminating the common contract.
- **Factories select, adapters do.** `src/adapters/<domain>/index.ts` resolves
  the configured provider to an adapter. The factory must not contain the
  provider's behavior in one giant file — provider logic lives in per-provider
  adapter files.
- **Composition boundary is `src/app`.** Provider selection is passed into
  `src/app` (e.g. `createDirectionLinkResolver(siteConfig.mapsFeature)`), and
  the composition result is passed down to presentational components. Components
  receive the **already-resolved** action (or nothing) — they must never
  construct provider URLs or branch on `provider ===`.
- **Optional by default.** Every integration is optional. No `features.*` block,
  or an explicit `"none"` provider, means the integration is intentionally
  disabled: no directions link, no booking CTA, no analytics, and the site works
  unchanged. There is no forced third-party account.
- **Misconfiguration fails loudly, never silently to `none`.** A configured-but-
  invalid provider (e.g. `features.booking` with `provider: "external-url"` but
  no url) is rejected by the schema at build time and, at the factory, throws a
  typed domain `MisconfigurationError` (analogous to
  `ContactInquiryMisconfigurationError`). It is never silently downgraded to the
  disabled adapter, so a deployment error is caught immediately.
- **Provider replacement is a local change.** Switching `maps: google` to a
  future `maps: apple` (or booking to another scheduler, or analytics to another
  provider) is an adapter + configuration change — never a rewrite of
  `src/app`, `src/components`, `src/core`, or `src/application`.
- **Static links vs interactive embeds.** Maps and booking are currently
  **static external actions** (keyless directions deep links; a public booking
  URL). An interactive embed (Calendly inline, a map iframe with a keyed tile
  provider, a hypothetical analytics widget) is a separate future capability
  and is explicitly deferred; the seam accommodates it additively.

### Outbound intent seams — verified contract (Phase I)

The Phase B/H/M/C outbound seams were verified in Phase I as a single,
cross-cutting contract rather than rebuilt:

- **`tests/unit/outbound-seams.test.ts`** proves the common principle across
  capabilities: each seam exposes a bounded, provider-neutral result
  appropriate to its intent (booking/maps link actions `{kind, provider, href}`
  or `{kind: "none"}`; contact's operation/status domain), honors explicit
  off/demo states, fails loudly for a configured-but-invalid provider (typed
  `*MisconfigurationError`, never a silent fallback), never substitutes one
  provider for another, and never fabricates a delivery (transport failure and
  the demo stub can never report success).
- **`tests/architecture/boundaries.test.ts`** ("outbound server-action &
  isolation boundaries") additionally proves the negative guarantees: the
  contact server action imports senders only through the contact-inquiry
  factory; webhook secrets are read lazily from `process.env` at the server
  action and exist nowhere in `src/config`, `src/core` (outside the sanctioned
  `ContactInquiryEnv` type in `contact-inquiry.ts`), `content/`, or
  `site.config.json`; presentation cannot import concrete provider adapters;
  core cannot import adapters or config (Phase I).
- **Naming note.** This roadmap *Phase I — Outbound Integrations & Action
  Seams* is distinct from the earlier locale-identity milestone whose release
  tag was `v2026.08.29-foundation-phase-i`. To disambiguate, the outbound
  milestone ships as **`v2026.09.03-foundation-phase-i-outbound-seams`**.

### Locale integration (Phase G composing)
### Trust & publishing content (Phase T, re-expressed by A1E)

Testimonials, portfolio/case studies, the blog and the offerings catalogue all used to
be author-facing **collections** with their own directories, parsers, feature flags,
chrome components and route files. FOUNDATION-PAGES-A1E removed that second model:
**if authored content has its own URL, it is a page**, so each of those is now
authored as ordinary pages under `content/pages/` and served by the ONE page route.

What that means in practice:

- **No collection store.** `fs-page-content-repository` and its port are gone, along
  with the `ContentCollection` union. Nothing but the two page modes can produce a
  route, and a test asserts that neither can return.
- **No collection roots.** `content/offerings/`, `content/legal/`,
  `content/testimonials/`, `content/portfolio/` and `content/posts/` are gone from
  the human-facing area and from the tree.
- **No feature-flag gating for content.** `features.offerings`,
  `features.testimonials`, `features.portfolio` and `features.blog` are gone: a page
  exists because a file exists, and it is exposed by linking to it (or by
  `navigation[]`). A flag that could hide an authored page would be a second,
  competing notion of existence.
- **No collection chrome.** The offering/portfolio/post/testimonial cards, lists,
  details, empty-state and card-image primitives, and their dictionary sections, went
  with the collections.
- **Testimonial quotes, feature cards, statistics and FAQ rows are EMBEDDED content**:
  they live inside the page that shows them — as Markdown today, or as declared sections
  (`cards`, `quote`, `stats`, `faq`, `features`) in the declarative JSON mode A2 added.
  They never needed a filesystem collection.
- **The booking CTA survives.** `features.booking` still composes the booking action
  seam the home page renders; it was never collection-specific.
- **Legal documents survive as configured links to pages.** `legal[]` still decides
  which policy documents the footer surfaces, in order, with a fallback label and
  localized labels; the document itself is a page
  (`content/pages/.../legal/<slug>.md`, served at `/{locale}/legal/<slug>`), and
  existence is checked through the page composition — so a configured entry without a
  page is never linked.
- **Deliberately removed with the collections:** the demo blog's per-locale
  `/blog/rss.xml` feed and its `buildRssXml` helper. A feed needs an ordered, dated
  list of records, which pages do not carry (a page has a title, a summary and a
  body); re-introducing one would be a structured-record capability, not a page
  capability. Reported rather than replaced speculatively.
- **Also removed:** the per-region offering price/currency resolution
  (`resolveOfferingPrice`), which existed to price a catalogue entry in a region's
  currency. The region `currency` / `currencySymbol` configuration keys were left in
  place — they are region identity data, not collection machinery — and a deployment
  that needs currency today states it in the page's own text.
### Analytics privacy posture(Phase U — audit, documentation only)

Phase U prosecuted the consent question against evidence instead of adding a consent
subsystem. Findings:

- **Client-side injection only.** The analytics element is composed through the Phase I
  adapter factoryand injected by the browser after hydration(script
  `/_vercel/insights/script.js`, same-origin; deduplicated by `src`). The built server
  HTML never references `/_vercel/insights`, so SSR/SSG output is identical with or
  without the feature enabled.
- **No client-side storage.** The inspected `@vercel/analytics` v2.0.1 client
  runtime(`dist/index.mjs`) reads/writes no cookies, `localStorage`, or
  `sessionStorage`;the package's only `cookie` references live in the unused server
  request-forwarding helper (`dist/server/*`).
- **Vercel describes Web Analytics as cookieless and anonymized** — vendor claim,
  attributed, not a Foundation legal conclusion. The Foundation ships **no consent
  gate** — no banner, no consent cookie, no analytics-gating capability. A future
  consent capability would require a concrete requirement that cannot be satisfied
  through configuration/documentation alone.
### Locale integration (Phase G composing)

Maps composes with the Phase G locale resolution — there is no second
localization mechanism:

```
locale
  ↓
resolveLocationForLocale(location, locale)
  ↓
resolved BusinessLocation (address / geo / phone)
  ↓
DirectionLinkResolver.resolve(resolvedLocation)
  ↓
provider directions URL
```

No geography is inferred from a locale anywhere in platform code
(`de` → Germany or `ja` → Japan never appears in `src/`); the locale merely
selects a configuration entry. The visible footer address, the structured-data
`PostalAddress`/`GeoCoordinates`, and the directions link all derive from the
**same** resolved location, preserving the Phase G invariant that visible
business data and structured data can never diverge.

## Offerings catalogue (Phase C, superseded by A1E)

The offerings catalogue was the first author-facing collection: a listing route, a
detail route per offering, a feature flag, a dedicated parser, its own
`OfferingsContent` model, sort/featured/price helpers and presentation components
served by a shared `PageContentRepository`.

**All of it is gone.** An offering — like any other authored content with its own URL —
is a PAGE:

```text
content/pages/markdown/ww/en/offerings.md                →  /ww/en/offerings        (the catalogue)
content/pages/markdown/ww/en/offerings/website-design.md →  /ww/en/offerings/website-design
```

That is the same two-mode authoring path as every other page, the same precedence, the
same per-locale fallback, the same safe Markdown policy and the same ONE route. Nothing
about it is special-cased, so there is no catalogue chrome to configure and no feature
flag that could disagree with a file's existence. (See
[Trust & publishing content](#trust--publishing-content-phase-t-re-expressed-by-a1e)
for the complete account of what the removal covered.)

## Legal documents (Phase D, re-expressed by A1E)

A legal document (privacy policy, terms, cookies) is a **PAGE**, reached from the footer
and never listed at an index URL:

```text
content/pages/markdown/ww/en/legal/privacy.md   →  /ww/en/legal/privacy
```

- **Exposure = config ∧ exists.** A document is surfaced only when it is BOTH listed in
  the `legal` config block (`{ slug, label }[]`) AND authored as a page. Configuration
  alone never invents a page and a page alone is never advertised; existence is checked
  through the SAME page composition every route uses, so there is no second store and no
  second notion of "exists". The pure helpers are `configuredLegalDocs`,
  `legalPageRoutePath` and `legalLabel` in `src/core/legal.ts`.
- **Footer discoverability:** the footer renders a legal `<nav>` (localized heading +
  links) only when a configured document's page exists; labels fall back from
  `dictionary.legal.labels[slug]` to the config label. The links point at the page's own
  URL (`/{locale}/legal/<slug>`), which is produced by the file being there.
- **Body localization is the page's own fallback**: a German page is served from
  `content/pages/markdown/ww/de/legal/<slug>.md` when it exists, and the default locale's
  page answers otherwise — the same rule as every other page. No legal-specific
  translation system exists.
- **Sitemap/SEO:** an authored legal page is a page, so it appears in the sitemap and
  carries canonical + hreflang through the ONE page route like any other page. No
  JSON-LD and no legal-advice semantics.

## Content body localization (all pages)

Content **bodies** are localized by the SAME rule for every page: the requested
locale's file is served when it exists, and the default locale's file answers
otherwise. A file at `content/pages/markdown/<site>/<locale>/<route-path>.md` is served when
present; otherwise the default locale answers. There is **no translation system**
beyond the content files — no per-locale schema, no dictionary involvement for bodies,
and no per-kind rule: a page is a page.

The rule applies to the COMPLETE route path, so a nested page falls back exactly as a
top-level one does (`offerings/website-design` resolves through the same four
candidates). Frontmatter travels with the file, so a localized `title`/`description`
is served together with that locale's body. (Footer **labels** and other interface
strings are dictionary-owned and independent — see the Internationalization sections.)

## Error handling & recovery (Phase E)

Unexpected failures have a three-tier boundary model, each of which is a
**Client Component** (App Router requirement) and never surfaces any detail of
the thrown error (message, stack, internal path, or environment) to users:

- **`[[...segments]]/not-found.tsx`** — expected missing routes and resources
  (unknown in-locale paths via the `[...rest]` catch-all, unknown locales via
  `dynamicParams = false`). It is a Server Component that preserves the locale
  via `next/root-params` `locale()` and renders localized copy from
  `dictionary.notFound` within the `[[...segments]]` layout.
- **`[[...segments]]/error.tsx`** — recoverable render errors in the locale segment
  and its children. Because it renders inside `[[...segments]]/layout.tsx`, the site
  header, footer, and current locale are preserved. It offers a working
  `reset()` ("Try again") and a "Return home" link to `/{locale}`.
- **`[[...segments]]/global-error.tsx`** — catastrophic/root-layout failures. It is a
  sibling of the root `[[...segments]]/layout.tsx` and must render its own
  `<html>`/`<body>` (the failed root layout is replaced), so it is intentionally
  minimal and unlocalized with no dependency on header/footer or a known locale.

Both `error.tsx` and `global-error.tsx` are Client Components, so their recovery
UI renders on the client during hydration; the server still returns the correct
status (500) and never leaks exception details. The recovery copy for
`error.tsx` is the canonical `dictionary.error` block, transported from the
`[[...segments]]` layout (which already resolves the per-locale dictionary) into the
client boundary through the minimal `ErrorMessagesProvider` context seam in
`src/components/site/error-messages-context.tsx`. There is no client-side locale
registry and no duplicated translation data — adding a locale (or changing the
default) is configuration/data work only. `global-error.tsx` stays deliberately
minimal and unlocalized because it renders when the layout itself may have
failed.

- **Security rule (hard acceptance):** no error UI may render `error.message`,
  a stack trace, internal paths, environment details, or `console` output. A
  regression guard in `tests/architecture/boundaries.test.ts` enforces this.

### Why `global-error.tsx` lives at `[[...segments]]/global-error.tsx` (not `app/global-error.tsx`)

Next.js requires `global-error.js` to be a **sibling of the root layout** — the
layout that renders `<html>`/`<body>`. In most projects that is the conventional
`app/layout.tsx`, which is why the docs show `app/global-error.tsx`.

This project intentionally has **no root `app/layout.tsx`**: the root layout is
the dynamic `[[...segments]]/layout.tsx` (the documented, recommended i18n layout that
renders `<html lang>`/`<body>` and owns `generateStaticParams` +
`dynamicParams`). The Step 0 empirical finding (Phase E, verified against a
Next.js 16.3.1 production build) is that introducing a true root
`app/layout.tsx` **breaks the existing locale contract**: `[[...segments]]` must remain
the root segment for `next/root-params` `locale()` to resolve. With a root
`app/layout.tsx` added, the production build fails with
`Error: Export locale doesn't exist in target module` at
`src/app/[[...segments]]/not-found.tsx` (the same build failure also breaks every
server component reading the locale via `next/root-params`).

Per the Phase E implementation gate ("do not introduce a broader layout
refactor unless Next.js requires it"), that trade-off was rejected. The global
error boundary is therefore placed as the sibling of this project's root layout
at **`src/app/[[...segments]]/global-error.tsx`** — it still renders its own
`<html>`/`<body>`, still catches catastrophic failures in the root layout, and
remains intentionally minimal and unlocalized because the root layout (and with
it the header, footer, and known locale) is exactly what failed.

## UI System Architecture & Configuration Contract (UI program)

The Foundation UI system is governed by `plan/foundation_ui_roadmap.md` (what)
and `plan/master-ui-phase.md` (the sequential implementation phases). UI-01
(this milestone) establishes the **contract layer only**: the `ui`
configuration namespace, the composition model, the precedence model (types
only), and the boundaries later phases build against. It introduces no new
rendering, no shell, and no responsive behavior; the existing classic-style
composition in `src/app/[[...segments]]/layout.tsx` is the pre-UI rendering and
remains untouched until later phases consume the contract.

### Configuration namespace

Intent-level configuration lives under the optional top-level `ui` key in
`site.config.json` (roadmap §11). Configuration describes intent; the
Foundation handles implementation — the namespace contains no pixel-level
switches.

| Key | Vocabulary | Meaning |
| --- | --- | --- |
| `shell.header` / `shell.footer` | `standard` \| `minimal` | Page-frame intent |
| `navigation.desktop` | `top` \| `sidebar` \| `minimal` \| `floating` | Desktop composition override |
| `navigation.tablet` | `top-compact` \| `collapsed-sidebar` \| `minimal` \| `floating` | Tablet composition override |
| `navigation.mobile` | `drawer` \| `bottom-bar` \| `top` \| `overlay` \| `persistent-sidebar` | Mobile composition override. NAV1D — `persistent-sidebar` presents the SAME persistent rail the ≥md bands present: it is how a configuration says "the sidebar, at every width" instead of letting a breakpoint substitute a drawer for it |
| `density` | `compact` \| `comfortable` \| `spacious` | Overall density intent |
| `content.width` | `narrow` \| `standard` \| `wide` \| `full` | Content area width intent |
| `cta.enabled/action/label/href/style` | boolean / semantic action / string(s) / `standard` \| `prominent` | Primary CTA intent (action/label/href adopter-owned) |
| `theme.mode` / `theme.radius` | `system` \| `light` \| `dark` / `none` \| `small` \| `medium` \| `large` | Visual theme intent |

Every value is validated by `src/config/schema.ts` (`uiConfigSchema`) and flows
through the single validated loader path as `siteConfig.ui`. The allowed values
derive from `src/core/ui/vocabulary.ts` (framework-neutral) — the single source
of truth shared by the schema and the engine. Unknown keys and invalid
values fail the build with an actionable message.

### Precedence model

```text
Explicit developer override (ui.* leaf)
        ↓
Foundation canonical default (FOUNDATION_UI_DEFAULTS)
        ↓
Completeness invariant (assertResolvedUiConfigComplete)
        ↓
Resolved UI configuration (ResolvedUiConfig)
```

UI-01 fixed the model and the types. **UI-02 delivers the single resolution
machinery** — `src/core/ui/resolve.ts` (`resolveUiConfig(raw: UiConfigInput): ResolvedUiConfig`,
pure, deterministic, framework-free, with the exported completeness guard
`assertResolvedUiConfigComplete`). The resolver never depends on the
configuration layer: the input shape `UiConfigInput` mirrors the validated
`UiConfig` surface structurally and lives in core (`siteConfig.ui` is directly
assignable to it).

### Foundation-level defaults (UI-02, owner-approved)

`src/core/ui/defaults.ts` — neutral platform defaults; no business action is
ever invented:

| Leaf | Foundation default |
| --- | --- |
| `shell.header` / `shell.footer` | `standard` |
| `navigation.desktop` | `sidebar` |
| `navigation.tablet` | `collapsed-sidebar` |
| `navigation.mobile` | `bottom-bar` |
| `density` | `comfortable` |
| `content.width` | `standard` |
| `cta.enabled` | `false` |
| `cta.action` / `cta.label` / `cta.href` | `undefined` (adopter-only business strings; `href` never inferred from `action`, UI-07 D1) |
| `cta.style` | `standard` |
| `theme.mode` | `system` |
| `theme.radius` | `medium` |

### Shared UI Primitives (UI-03)

`src/components/ui/` — reusable, **identity-agnostic, prop-driven** primitives
the Shell Engine (UI-04) composes into the canonical presentation and later
reuse. They accept semantic intent as plain props (labels, hrefs, active state,
items) and never import configuration, core, adapters, `siteConfig`,
`ResolvedUiConfig`, or any presentation (boundary-enforced).

| Primitive | Responsibility | Client? |
| --- | --- | :-: |
| `AppShell` | Composition frame (header / nav / main / secondary / footer / mobile slots); the deterministic `<main id>` skip-link target. **Frame only — no shell-engine policy** | — |
| `Navigation` / `NavItem` | Landing landmark + list; NavItem is server-safe and data-only (label/href/active/external/badge/variant), `aria-current="page"` | — |
| `NavGroup` | Heading + items; collapsible variant = client disclosure (`aria-expanded`/`aria-controls`) | collapsible |
| `NavCta` / `NavBadge` | CTA variant + presentational chip | — |
| `BottomNavigation` | Bottom-bar landmark + list (touch-target spacing via tokens). The LANDMARK box and the LIST are separate props: the list owns its item rows, so horizontal flow, wrapping and the gap belong to it — never to the `<nav>` that wraps it (NAV1A) | — |
| `Sidebar` | Rail + disclosure toggle (`aria-expanded`/`aria-controls`). Its open/closed state is the ONE visitor-owned presentation preference of the rail: persisted browser-locally (`foundation.sidebar` open\|closed — the contract lives once, beside the primitive, in `src/components/ui/sidebar-contract.ts`) and resolved ONCE per document, so a rail re-created by a reload or a client-side navigation renders the visitor's state from its first render — no correction, and therefore no collapse/expand flicker while a destination loads. On a FRESH document the preference is applied by a synchronous pre-paint bridge (`@/components/ui/sidebar-preference-boot` + `src/components/ui/sidebar-contract.ts`, marking `<html>` for the boot interval only) so a stored OPEN rail is painted OPEN before hydration and the marker is relinquished at the first runtime commit; that same seam presents the rail's state-dependent CONTENT, because the disclosure CONTROL declares both states' artwork and label and the stylesheet presents exactly one of them (FOUNDATION-UI1-A3) — so the control's icon and its Show/Hide navigation copy belong to the visitor from the first painted frame as well, instead of being swapped at hydration — and it applies the OPEN state's SEMANTICS too (FOUNDATION-UI1-A3-A1): `aria-expanded` and the control's accessible name are single-valued attributes a static document can only carry canonically, so the same script writes them for every control as it appears (in the author-supplied-name modes the name is declared in the control's own markup) and stops at `DOMContentLoaded`, after which the runtime owns them — the presented state and what the control claims about it are therefore the same state from first paint through hydration; the canonical no-preference state is CLOSED and the toggler is the only thing that changes it (see `CUSTOMIZING.md` — the sidebar disclosure) | collapsible |
| `Drawer` | Generic overlay/dialog primitive behind the roadmap's "MobileDrawer"/overlay concepts (naming note); `role=dialog` + `aria-modal` + `aria-labelledby`, Escape closes, closed-by-default SSR (nothing rendered when closed) | ✅ |
| `OverlayNavigation` | Composition over `Drawer` (full-viewport overlay use) | ✅ |
| `state.ts` | Pure `disclosureReducer` / `createInitialDisclosure` (framework-free) | — |

**Composition boundary (preserved):** `Configuration → ResolvedUiConfig → Shared
Primitives (UI-03) → Shell Engine (UI-04) → Canonical presentation`. The primitives are
**not wired into the live layout in UI-03**; UI-04 owns shell composition and
responsive transformation (the primitives contain no breakpoint/media-query
policy and no presentation-selection logic).

**Accessibility contract — structural vs behavioral:** UI-03 ships the semantics
(landmarks, ARIA attributes, disclosure states, deterministic SSR-safe closed
defaults, conditional rendering so closed panels contribute nothing focusable).
The **behavioral matrix** (keyboard navigation, focus trap/return, Escape,
scroll locking, responsive interaction, reduced motion) is a **mandatory UI-10
browser-validation gate** — UI-03 implements the underlying behavior but does
not fake browser verification in unit tests.

### Shell Engine (UI-04)

`src/core/ui/shell.ts` + `src/components/shell/*` — the orchestration layer
that consumes the RESOLVED semantic intent (UI-02) and the shared primitives
(UI-03) to render the responsive shell.

- **Decision core (`src/core/ui/shell.ts`)** — pure, framework-free:
  `resolveShellPattern(resolved)` maps the resolved per-viewport navigation
  patterns + shell/CTA values into a deterministic `ShellPatternDecision`
  (primitive kind per viewport, slot, CTA placement, density/content-width
  utility classes). It is a pure function of the VOCABULARY VALUES — never
  presentation identity — so no composition needs a change here.
- **Engine (`shell-engine.tsx`, server)** — composes the `AppShell` frame with
  content slots; applies density/content classes; renders a primary CTA only
  when `resolved.cta.enabled` AND label+href are supplied (the Foundation never
  invents one by default); composes the aside/sidebar and mobile bottom-bar
  layers for aside/bottom-bar compositions (UI-05). The ≥md header-slot nav
  landmark and the <md mobile layer (`ShellMobileNav`: trigger + closed-by-
  default drawer/overlay) are composed into the header by the content layer
  (`SiteHeader`).
- **Boundaries (master §7):** the engine understands intent, not business
  content; it imports no configuration/adapters and receives resolved/config
  context (locale, pageBindings) via props; it branches ONLY on vocabulary/
  structural values, never presentation identity. The shared primitives stay
  breakpoint-free; the only responsive utilities are the Tailwind classes the
  engine/layout emit.
- **Wiring (UI-04/UI-05):** `layout.tsx` computes `resolveUiConfig(siteConfig.ui ??
  {})` once and renders through `ShellEngine`. Responsive behavior:
  * **Desktop/tablet (≥`md`) → existing composition preserved** — a
    header-slot (top-bar) composition renders byte-identically to the previous
    shell at those widths.
  * **Mobile (<`md`) → intentionally modernized** to the declared mobile
    pattern (the roadmap-Classic drawer; with Adaptive, the bottom bar — which
    carries EVERY configured destination and wraps its rows; no overflow drawer).
  Note: this is NOT a "zero visual delta" claim across all viewports — the
  mobile navigation is intentionally the declared (modernized) pattern.

### One canonical presentation (2026-09 closure)

The Foundation presents **one canonical composition**. There is no
presentation/profile selection layer anywhere in the active architecture:

- **No `ui.preset` key.** `uiConfigSchema` is `.strict()`, so a configuration
  that still carries the retired key fails validation as an unknown key rather
  than silently activating another presentation.
- **No profile table.** `src/core/ui/presets.ts` (the five semantic profiles and
  `uiPresetProfiles`) was deleted; `defaults.ts` declares no `defaultPreset`.
- **No selection point.** Resolution is exactly
  `override ?? FOUNDATION_UI_DEFAULTS.<leaf>` (see the precedence model above):
  `src/core/ui/resolve.ts` contains no profile lookup and no fallback selection
  string (source-scan tested).

The composition values the canonical presentation used are ordinary entries in
`FOUNDATION_UI_DEFAULTS` (`src/core/ui/defaults.ts`):

| Leaf | Value |
| --- | --- |
| `navigation.desktop` | `sidebar` |
| `navigation.tablet` | `collapsed-sidebar` |
| `navigation.mobile` | `bottom-bar` |
| `shell.header` / `shell.footer` | `standard` |
| `shell.sidebar.collapsible` | `true` |
| `presentation` | `PRESENTATION_DEFAULTS` (balanced / default) |
| `density` | `comfortable` |
| `content.width` | `standard` |
| `theme.mode` / `theme.radius` | `system` / `medium` |
| `cta.enabled` / `cta.style` | `false` / `standard` |

Because the flattening reused the exact effective values, the resolved
configuration and the rendered site are **unchanged** by the removal.

**Capability claims (P0-6).** `FOUNDATION_UI_CAPABILITIES`
(`src/core/ui/defaults.ts`) is the Foundation's single audited row of the roadmap
§24 capability matrix. A level may only be raised when the implementation +
composition + (for `supported`) the browser verification exist, and the claim
gate (`tests/architecture/capability-claims.test.ts`) is updated with the
evidence in the same change. The levels are `supported` (sidebar,
collapsibleSidebar, bottomMobileNavigation, mobileDrawer, primaryCta),
`optional` (topNavigation), `limited` (complexNavigation,
applicationDashboard) and `unsupported` (overlayNavigation, secondaryPanel,
visualFirst).

**Retired feature (historical).** UI-05–UI-10 built and shipped a *selectable*
presentation model: five semantic profiles (`classic`, `adaptive`, `focus`,
`workspace`, `immersive`), an adopter-facing header selector, and five externally
hosted demo deployments. The owner retired the feature in 2026-09: the selector,
the profile table, the `ui.presetComparison` deployment map and the
five-presentation browser permutations are gone, and the sibling demo repository
and its deployments were removed. The engine architecture those milestones
established — vocabulary-driven resolution, identity-free shared primitives, a
pure decision core, the shared modal/accessibility contract and the committed CDP
matrix — is unchanged, and is still exactly what the canonical presentation runs
on. The detailed milestone history is preserved in this repository's Git history.
### Theme/layout separation

The composition leaves (`shell`, `navigation`) select the layout & interaction
structure; `theme` selects visual styling. Visual styling stays token-driven in `src/app/globals.css` (Phase D).
A client-side theme controller for explicit `light`/`dark` modes is a
later-phase concern and is not introduced by the contract.

### Accessibility contract

Every later UI phase ships accessibility as part of the implementation
(master-ui-phase §22): semantic landmarks, full keyboard operability, the
single `--ring` focus contract, correct focus management for drawer/overlay/
bottom-bar patterns, adequate touch targets, `prefers-reduced-motion` support,
and WCAG 2.1 AA contrast (existing token pairs remain enforced by
`tests/unit/design-tokens.test.ts`).

A **persistent top region** additionally clears fragment targets:
`html:has(.ui-shell-top)` carries a `scroll-padding-top` clearance
(`--ui-shell-top-clearance`), removed in exactly the bands where the rail — not
the header — is persistent, so a skip link or an in-page anchor never lands
beneath the sticky header (see *Persistent navigation* below).

### Persistent navigation (shell top region + rail content column)

A visitor must never have to scroll back to the top of the page to reach another
page. The shell therefore composes **two persistent regions, never at the same
width**:

| Where | What persists | Why |
| --- | --- | --- |
| any width where a **rail band** is composed beside the content | the rail's **content column** (`.ui-sidebar-rail-sticky`: its show/hide control and its navigation list) | the composition already puts the navigation beside the content |
| everywhere else — a header-slot composition, and every width below `md` | the shell's **top region** (`.ui-shell-top`: the header — identity, the navigation-mode selector, any header-slot navigation, and the contextual controls) | the header is where the controls are |

- The engine (UI-04 `ShellEngine`) emits the rail-band markers
  (`ui-shell-top--rail-md` / `ui-shell-top--rail-lg`) as a pure function of the
  **resolved slot vocabulary** (`decision.{desktop,tablet}.slot === "aside"`).
  The stylesheet returns the top region to normal flow inside exactly those
  bands, so the two regions can never be sticky at once, can never overlap, and
  no measured offset between them is needed. Neither value carries presentation
  identity, configuration or business content.
- Both regions use `position: sticky`, never `fixed`: they stay in flow, reserve
  their own height, can never cover page content, and the footer still scrolls
  into view beneath them.
- The rail's content column is bounded by the **viewport** (`max-height: 100dvh`)
  and scrolls on its own when the navigation is taller than that
  (`overflow-y: auto`, `overscroll-behavior: contain`), so no destination becomes
  unreachable. The rail is therefore `overflow-x: clip`, never `hidden` —
  `hidden` would make the rail a scroll container and pin its sticky child to the
  rail instead of the viewport.
- The **primary CTA is deliberately NOT part of what persists**: it keeps its one
  top-region home and stays in normal flow (P6-3C), because persistence exists
  for navigation — a destination list — not for actions.
- Asserted by `tests/unit/shell-persistent-navigation.test.ts` (the composition
  and CSS contract) and by the browser matrix's `persistent-navigation` scenario
  (rendered behaviour: stickiness, reachability, one persistent region per width,
  no rail/content overlap, a long navigation scrolled inside the column, fragment
  clearance, the mobile disclosure while scrolled, and unchanged destinations).

### Shell layout presentation — the optional visitor switcher (N2)

A Foundation site has **one** shell composition. N2 adds the *optional* capability for a
visitor to choose between the platform's two layouts — a **sidebar** and a bottom **menu bar** —
which exists so a deployment can demonstrate the same site in two presentations.

- **A layout is a PRESET, not a second shell system.** It names three existing vocabulary
  leaves — one per viewport width: `sidebar` = `navigation.desktop: "sidebar"` +
  `navigation.tablet: "collapsed-sidebar"` + `navigation.mobile: "persistent-sidebar"`; `menu-bar` =
  `"top"` + `"top-compact"` + `"bottom-bar"` (`@/core/ui/layout.ts`). Every decision still
  flows through the ONE decision core (`resolveShellPattern`), so a layout cannot invent a
  composition the shell engine does not already implement.
- **The viewport changes HOW a mode is presented, never WHICH mode it is** (NAV1A). The
  mobile leaf belongs to the layout precisely so that narrowing a window cannot turn a
  sidebar site into a menu-bar site. One shared mobile surface for both — the shipped behaviour
  this contract corrects — made viewport width the owner of the navigation architecture,
  removed the mode control below `md` because there was "nothing to switch", and left the
  sidebar layout's bottom bar stacking its links one per row. No pre-existing mode was
  repurposed, and no navigation data is duplicated.
- **A VIEWPORT MAY NOT SUBSTITUTE A DIFFERENT NAVIGATION FOR THE MODE, AND WHERE AN OPEN RAIL PUTS
  THE PAGE IS A PER-BAND CONTRACT** (NAV1D, corrected by NAV1D-V3). Changing HOW a mode is presented
  is not a licence to present something else: the sidebar preset used to name the capability's
  off-canvas drawer (`navigation.mobile: "drawer"`) and so, below `md`, replaced the sidebar with a
  `Show navigation` disclosure band — a substitute the owner rejects, because the site's navigation
  had become a button rather than the sidebar. The preset therefore names `persistent-sidebar`, the
  ONE `navigation.mobile` value meaning "the SAME persistent rail, here too": the three rail bands
  (mobile `<md`, tablet `md…lg`, desktop `≥lg`) render from ONE composition, with byte-identical rail
  markup per band and a single visitor-owned state, and the page frame is a wrapping row at every
  width. Adding that value is a vocabulary extension made in the ONE place the closed vocabularies
  live (`@/core/ui/vocabulary.ts`; the schema derives from it), and it is deliberately NOT called
  `sidebar`, so each tier's vocabulary stays disjoint (`ui-architecture.test.ts`). Sidebar mode
  consequently composes no drawer, no disclosure band, no trigger and no dialog at all; the generic
  `Drawer`/`OverlayNavigation` capability, and a site that explicitly configures
  `navigation.mobile: "drawer"`, are untouched.
- **THE CLOSED RAIL IS IDENTICAL IN EVERY BAND; OPENING IT DIFFERS BY BAND** (NAV1D-V2, corrected by
  NAV1D-V3 — owner decisions). The three bands are RETAINED as separate surfaces, deliberately, for
  future configurability; today they render from the ONE composition. CLOSED, the rail is persistent
  at the PAGE EDGE in every band (it carries no outer shell gutter: any such offset is a placement
  defect, not a padding one). OPEN, the rail keeps its accepted 220px and the band decides how the
  page coexists with it: at `md` and above — tablet AND desktop — the rail expands **IN FLOW**, so the
  page's x-position and width change exactly as they do for any in-flow column and the rail never
  covers the content; below `md` — mobile — the rail leaves the flow and is painted **above** the
  page, so the page keeps the geometry it had while the rail was closed and the document gains no
  width. Only the mobile band has overlay stacking, and it is the existing persistent-navigation band
  (`z-index: 30`, the value the shell's top region itself uses) — no new z-index vocabulary and no
  window-measuring JavaScript, because the shell's own width bands own the distinction. **SELECTING a
  destination dismisses an open rail in every band**: the close goes through the rail's ONE state
  owner (`Sidebar.apply`, shared with the disclosure control), is decided by the SELECTION rather than
  by the route — so it also closes for the page the visitor is already on, and never depends on a
  breakpoint — and is reachable by pointer, keyboard and assistive technology alike, because it is one
  delegated click listener on the rail's own panel. `NavItem` stays plain data + href, and no routing
  API enters the state modules.
- **THE RAIL'S SURFACE IS OPAQUE AND ITS COLOUR IS THE SITE'S ONE BACKGROUND AUTHORITY** (NAV1D-V3).
  The rail used to be a transparent column — it looked like the page only because the page's own
  background showed through it — which is wrong the moment it covers content. It now paints itself
  with `--background`, the same token the body and the shell's top region consume and the one the
  adopter-owned `ui.theme.background` (FS-5) resolves onto `<html>`. So one authority governs the
  closed rail, an open desktop/tablet rail and the mobile overlay alike; nothing about the rail's
  geometry, padding, divider or stacking changes, and an opened overlay can never let page content
  blend through its text.
- **THE PAGE LAYOUT HAS A DELIBERATE MINIMUM WIDTH** (NAV1D-V2). `--ui-shell-min-inline-size`
  (320px, the platform's established support boundary) is applied to the shell frame only BELOW that
  boundary. At and above it the layout fits the viewport's own content box — no horizontal scrollbar,
  with the rail closed or open — and a narrower viewport scrolls horizontally instead of deforming the
  layout.
- **MENU BAR MEANS THE STICKY BOTTOM BAR AT EVERY WIDTH** (NAV1B). The top navigation bar
  presentation is no longer part of Menu Bar mode: the layout's preset also CLOSES its ≥md top
  menu (`topMenu: "closed"` — the shipped three-state menu contract), so no ≥md header
  navigation is composed in any band, and the sticky bottom bar — which covers EVERY band the
  composition leaves without navigation — IS the navigation at desktop, tablet and mobile
  widths alike. Nothing is left behind: a closed menu composes no landmark at all, so there is
  no hidden duplicate to reach by keyboard or assistive technology.
- **Which BANDS a surface occupies is a composition property, never a call-site breakpoint.**
  `resolveShellPattern` reports, per band, whether the composition presents navigation of its own
  (`presentsNavigation`, and the slot it presents it in) and which bands it leaves open
  (`openBands`); `mobileSurfaceBands` + `bandClassName` turn that into the surface's width gate
  (an exhaustive table, unit-tested), while `railCompositions`/`railLayouts` read the same decision
  per band, INCLUDING the mobile band (NAV1D). The canonical sidebar composition therefore keeps
  the historic `<md` bottom bar EXACTLY as shipped, a Menu-bar composition presents it at every
  width, and a `persistent-sidebar` composition presents its rail in all three bands — one
  mechanism, no per-surface special case.
- **The Menu Bar surface spans the viewport** (NAV1D). The sticky bar is a flex item of the shell
  frame, and in the wrapping row an aside composition lays the page out in it shrinks to its
  content unless it carries a width basis — which is how the bar came to read as a small left-hand
  block at desktop/tablet widths. It therefore declares `w-full basis-full` (its own row, full
  viewport width) and its INNER region is bounded only by the page-edge inset: the page's own
  `max-w-page` container is deliberately not applied to a navigation SURFACE. The LIST still owns
  the rows and the wrapping, exactly as NAV1A established.
- **Configuration decides whether it exists.** `ui.layoutSwitcher: { enabled, default }`
  (`@/core/ui/defaults.ts` → `FOUNDATION_UI_DEFAULTS.layoutSwitcher`) is **disabled by
  default**: the Foundation's own composition offers no choice, exactly as it renders no
  CTA. When it is enabled the default layout's patterns ARE the resolved
  `navigation.desktop`/`tablet`/`mobile`, and the schema REFUSES enabling it alongside any
  of those three leaves (two answers to one question is a contradiction, and the Foundation
  fails loudly rather than picking one).
- **THE HEADER'S TWO SEMANTIC ROWS NEVER CHANGE OWNERSHIP** (NAV1B). The header composes two
  regions at every width: the TOP row owns the identity and the navigation-MODE selector, which
  is anchored to the right edge of the padded content (a TEXT identity too long to share the line
  wraps below the selector rather than moving it); the SECOND row owns every other header control
  — the contextual Site/Location/Language selectors, and the ≥md header navigation a CUSTOM
  composition presents. Responsive behaviour may wrap a region's own content, close the sidebar
  or wrap the bar's links; it may never move a control between rows, enlarge a navigation control
  because the viewport narrowed, or relocate a mode's navigation. The sidebar's constrained-width
  disclosure is composed by the ENGINE at the SIDEBAR BOUNDARY (`sidebarLead`, above the content
  row) for exactly that reason: inside the header it migrated between the rows as the visitor
  controls changed width, which is the reported defect.
- **A GRAPHIC IDENTITY UNDERLAYS THE SELECTOR — IT DOES NOT REFLOW AROUND IT** (NAV1B-V1). The
  owner's rule distinguishes the two identity kinds, and so does the shell: a text identity wraps
  inside its own column, while a configured logo keeps the row's ONE track (so its clamp is the
  header's content width — never a narrow column, never shrunk, never distorted) and may continue
  beneath the selector's occupied area, the selector staying right-aligned in the same cell and
  painting ABOVE it (`.ui-site-header-top--graphic` in the stylesheet). Nothing becomes
  interactive: the graphic keeps its existing identity semantics and the selector keeps every
  pointer event inside its own box.
- **One exposed navigation, by construction.** The shell composes the structures of both
  layouts and marks each one with the layouts it is the active navigation for
  (`data-ui-shell-part="rail" | "top-nav" | "bottom-bar" | "mobile-drawer"` +
  `data-ui-shell-layouts`); the stylesheet (`globals.css` — shell layout presentation)
  exposes exactly one for the active `data-ui-shell-layout` value on `<html>`. The gate is
  `display: none`, which is SEMANTIC: the inactive structure leaves the accessibility tree
  and the focus order, so there is never a second focusable navigation system and never a
  duplicate landmark. The MOBILE surfaces are part of that same contract (NAV1A/NAV1B): where
  a rail is not composed the sidebar layout exposes its drawer, and the menu-bar layout exposes
  its bar at every width — never both.
  An open drawer whose layout stops being active also CLOSES itself (the active layout is
  watched on `<html>`), so a withdrawn disclosure can never keep the body scroll lock or
  the background `inert` it applied. Persistent navigation and fragment clearance follow
  the active layout in the same CSS layer (in the menu-bar layout the top region becomes
  the persistent navigation at the widths where a hidden rail structure is also composed).
- **Static generation is untouched.** The server emits the attribute for the configured
  default and the preference lives in browser-local storage (`foundation.layout`) read by
  one small client control (`@/components/site/layout-switcher.tsx`) after hydration — no
  cookie, no session, no server state, so no route becomes dynamically rendered and
  hydration can never disagree with the server. Unavailable/blocked storage or a value the
  vocabulary does not declare falls back to the configured default. With the switcher
  disabled, no attribute, marker, control or extra structure is emitted at all: the markup
  is byte-identical to the single-composition shell.
- **Content is never duplicated.** There is one content tree, one route namespace and one
  locale model; `/ww/de/about` stays `/ww/de/about` under both layouts, and switching changes no
  DOM content — only which of the two composed navigation structures is exposed.
- Asserted by `tests/unit/ui-layout-switcher.test.ts` (vocabulary, resolution, the mobile
  leaf each layout owns, the band each surface covers, configuration coherence, completeness),
  by `tests/unit/shell-header-rows.test.ts` (the header's two semantic rows and their ownership),
  by `tests/unit/shell-layout-presentation.test.ts` (the composed markup, the scope markers
  including the two mobile surfaces, the byte-identity guarantee, and the stylesheet
  contract) and by the browser matrix's `layout-switcher` scenario (rendered behaviour:
  one exposed navigation, Tab never reaching the hidden structure, unchanged content/route/
  locale, persistence through client navigation and reload, an unusable stored value ignored,
  the control available at every width, the per-layout navigation at
  1280/1024/900/768/767/390/360/320 — the menu-bar sticky bar at EVERY width with no top
  navigation, and the SIDEBAR layout presenting the SAME persistent rail at every width (its
  geometry, its symmetrical padding, its focus-ring room and its sticky persistence measured at
  every requested width, with no disclosure band, trigger or header substitute anywhere) — real
  resize transitions, and mobile mode switching) plus its
  `bottom-nav-wrap` scenario (the sticky bar's list layout: one row when the links fit, genuine
  wrapping when they do not, page-edge inset, a full-width surface whose region uses the available
  width, no horizontal overflow, no clipping) and its `header-rows` scenario (the fixed semantic rows under a very
  long identity and under long contextual labels, with test-owned fixtures).

### Boundaries

### Boundaries

| Concern | Owner | Status |
| --- | --- | --- |
| Vocabulary, schema surface, composition semantics, contract types | UI-01 | ✅ shipped |
| Configuration resolution, canonical defaults, overrides, resolved configuration | UI-02 | ✅ shipped (`resolveUiConfig` / `FOUNDATION_UI_DEFAULTS`) |
| Shared UI primitives | UI-03 | ✅ shipped (`src/components/ui`; unwired until UI-04 — the next consumer) |
| Shell orchestration & responsive shell behavior | UI-04 | ✅ shipped (`ShellEngine` + `resolveShellPattern`; wired into the live layout) |
| Canonical aside + bottom-bar composition (**preset framing retired 2026-09**; values now `FOUNDATION_UI_DEFAULTS`) | UI-05 | ✅ shipped (aside rail + collapsed tablet rail + bottom bar) |
| Top-bar composition family (declarative proof — no engine change required) | UI-06 | ✅ shipped (explicit leaves; zero engine changes) |
| Minimal-header composition + the CTA contract (`cta.href`, one top placement, `prominent`) | UI-07 | ✅ shipped (D1–D3; `minimal` chrome DEFERRED) |
| Sidebar+drawer composition (shared sidebar machinery); **grouped nav + secondary panel DEFERRED** | UI-08 | ✅ shipped (zero production-code change; shell SSR-proven) |
| Floating/overlay composition + **overlay-CTA consumer fix**; distinct floating/minimal treatments DEFERRED | UI-09 | ✅ shipped (1 content-layer consumer fix; shell + overlay CTA SSR-proven) |
| Shared behavioral & accessibility gate — focus/inert/backdrop/Escape/scroll in the shared Drawer + B1/B2 ARIA-consumer fixes + committed CDP validation capability | UI-10 | ✅ shipped (browser-validated desktop/tablet/mobile matrix; collapsed-sidebar visual + mobile header-CTA placement DEFERRED) |

## AI Development

The repository is intentionally designed to provide strong context for AI
coding agents.

Agents must understand and preserve:

- dependency direction
- architectural boundaries
- configuration boundaries
- content/application separation
- framework isolation

Before making architectural changes, an agent should inspect the relevant
repository instructions and existing implementation.

---

## S1 — sites, languages and the four visitor dimensions

The request hostname selects the **Spoke**. Within that Spoke, every public page URL names its
**Site**, language and page route — and the Site is the country/global context **inside** the
already-selected Spoke, never a website of its own.

### Page identity

```
/<site>/<locale>/<route>
```

| Part | Meaning | Example |
| --- | --- | --- |
| `site` | the country/global Site context **inside the active Spoke** (the Spoke is selected by hostname, never by a URL segment): a recognized lowercase country code, or `ww` (Worldwide / Global, Foundation-defined, not a country) | `ca` |
| `locale` | the language, addressed by a lowercase **path key** | `fr`, `fr-ca`, `zh-hant` |
| `route` | the page's own path inside that site + locale | `about`, `services/web-design` |

Filesystem:

```
content/pages/markdown/<site>/<locale>/<route>.md
content/pages/json/<site>/<locale>/<route>.json
```

There is **no** hidden default site segment, no `main`, and no `pathPrefix`: the site code is
always the first segment. `/en/about` (the pre-S1 site-less form) is completed to the default
site's address by `src/proxy.ts`, so an old link still lands on a real page.

The ONE route that serves pages is `src/app/[[...segments]]/page.tsx`; the page chrome for the
dedicated URLs (home, connect, contact) is composed by `src/app/[[...segments]]/dedicated-pages.tsx`
from the SAME resolved page. Two invariants the architecture tests guard:

- a page never resolves across a site boundary — not even for a site that enabled cross-locale
  fallback, which is scoped to that site's own tree;
- a site code is never a locale candidate and a locale is never a site candidate, so a redirect can
  never move a visitor between sites.

### The generated social image lives OUTSIDE the catch-all

`src/app/[site]/[locale]/opengraph-image.tsx` — not `[[...segments]]/opengraph-image.tsx`. Next.js
requires a catch-all segment to be the LAST segment that modifies the path, so a static metadata
segment under `[[...segments]]` refuses to build (Turbopack panics before any page renders). The image
keeps the accepted URL (`/<site>/<locale>/opengraph-image`) by using the same two dynamic segments a
page URL carries.

### Locales

A path key is lowercase; standards-facing values use the canonical tag. A country site derives its
country for a simple key, and the reserved Worldwide site derives nothing:

```
ca/en → en-CA      ca/fr → fr-CA      ch/de → de-CH      br/pt → pt-BR
ww/fr → fr         ww/en → en-US      (explicit canonical mapping)
```

Two locale keys of ONE site that resolve to the same canonical tag (`en` and `en-ca` in `ca`, both
`en-CA`) are a HARD configuration error, never a warning: the author chooses one.

### Four independent visitor dimensions

| Dimension | What it changes | Where it lives |
| --- | --- | --- |
| **Site** | the country/global context *inside* the active website/Spoke (own pages, languages, locations) | the first URL segment |
| **Language** | the locale used *inside* the active Site | the second URL segment |
| **Location** | the office/city/region context *inside* the active Site | `business.regions` + that Site's `business.pages` bindings |
| **Layout** | presentation only (Sidebar / Menu bar) | the visitor's own preference, never part of a URL |

The four dimensions are the visitor's **inside the selected Spoke**; the hostname-selected Spoke is
not a visitor selector and is never a UI control. A control that has nothing to choose disappears:
the active Spoke declaring one Site → no Site selector; the active Site
serving one language → no Language selector; no locations bound to the ACTIVE Site → no Location
selector; the Layout switcher disabled → no Layout control. The Location inventory is **the active
site's** (`regionsForSite`): a location belongs to one Site's page tree, so a Site that binds none
never offers another Site's locations — and never a destination that does not exist.

### Required Locations — the per-Site location-selection policy (FOUNDATION-LOC1, LOC2)

A **Site** is the country/global context inside the active website; a **Location** is the physical or
business place *inside* that Site. Until LOC1 every Site had two visitor states — a Location, or the
explicit *unspecified* one — because that is what the reference deployment wants. A Site whose every
page belongs to a place wants the opposite, and must be able to say so **about itself alone**:

```jsonc
"sites": [
  {
    "code": "ca",
    "locales": ["en", "fr"],
    "defaultLocale": "en",
    "locationSelection": { "mode": "required", "default": "toronto" }
  }
]
```

**LOC2 — an explicit refinement per locale.** A multi-locale Site whose languages are *different places*
would otherwise complete every language into one Location. The adopter may therefore name, **once and
explicitly**, the Location that completes an otherwise Location-less request **for one locale**:

```jsonc
"locationSelection": {
  "mode": "required",
  "default": "toronto",              // the Site-wide fallback (LOC1)
  "localeDefaults": { "fr": "montreal" }   // OPTIONAL, explicit, per locale path key
}
```

The policy is **optional, per Site and explicit**:

* **absent** → the established optional behaviour, EXACTLY: the Location selector keeps its explicit
  unspecified option, non-regional routes stay valid, and no existing configuration needs migrating.
  No Installation becomes required-Location by accident.
* **`mode: "required"`** → the Site has **no visitor-facing unspecified state**. Its non-regional public
  paths are completed into the Location the effective default answers, and its Location control offers no
  unspecified option. `"required"` is the ONLY mode; there is no second one, and no deployment-wide
  switch.
* **`default`** → an adopter decision, **never inferred** — not from alphabetical order, binding order,
  locale, timezone, country, the browser, "the first region" or "the first binding".
* **`localeDefaults`** (LOC2) → an adopter decision too, and **never locale→Location inference**: the
  platform knows no association between a language and a place ("French means Montréal" exists nowhere
  in it). Each entry is *authored* data keyed by a locale path key the Site serves, and an entry is used
  **only while completing a request that does not yet name a Location** — see *Routing* below. It is
  OPTIONAL, and a policy without it is exactly the LOC1 policy.

**Routing.** `/{site}/{locale}` and `/{site}/{locale}/{page}` of a required Site answer with a PUBLIC
redirect into the Location the **effective default** answers — `localeDefaults[locale] ?? default`, the
ONE rule (`effectiveDefaultLocation`) every surface reads. The destination is resolved by the accepted
Location destination rule: the same page there when it exists, that Location's landing otherwise, and
the accepted `regionDefaultLocale` rule when the requested locale is not bound to the Location. There is
no second locale algorithm, no second destination rule and no hidden state: the Location stays
**URL-authoritative**, so a request that already names one of the Site's Locations is answered exactly
as it is — including a Location other than the effective default, and including in a locale that has a
refinement — and no cookie, session, client state or environment variable is consulted. **Language and
Location stay independent dimensions**: LOC2 applies exactly and only where a required request names no
Location yet, so once a Location is in the URL the URL wins.

**Selection and inventory.** The Location control's inventory is unchanged (`regionsForSite` — the
ACTIVE Site's own Locations); in required mode the EFFECTIVE default Location for the locale being read
leads — the refinement on the locale it names, the Site-wide default elsewhere — and the remaining
Locations keep the accepted deterministic ordering. The active Location is still read from the URL: the
refinement supplies the leading option, never the selection. A Location of another Site can never
satisfy a requirement, enter the routing or enter a selector: every lookup is Site-scoped
(`bindingsForSite`), by construction.

**Discovery.** A required Site's canonical inventory is its regional one: its non-regional URLs are
redirects, so they are deliberately not advertised as visitor destinations in the sitemap. LOC2 adds no
discovery rule of its own — the regional canonical URLs remain the authoritative inventory and no
locale-default-specific duplicate is emitted. Optional Sites are untouched.

**Refusal, not repair.** A policy that cannot be honoured fails at **configuration/build time**, naming
the Site, the configured Location and the violated rule. For the Site-wide `default`: it must be an
operating Location of `business.regions`; the Site must actually have Locations; it must belong to THIS
Site's inventory; and it must have a usable landing destination in this Site. For EACH LOC2 refinement:
its key must be a locale THIS Site serves; its Location must exist; it must be THIS Site's own inventory
(the Site that owns it is named otherwise); and it must have a landing **in that exact locale** — a
refinement is never allowed to fall back to another locale, because that fallback is precisely what it
was authored to prevent. An unhonourable policy is never allowed to become a runtime 404.

**What it is not.** It does not collapse Site into Location, it does not create a Location, it does not
move a Location between Sites, it does not touch Languages or Layout, and it never applies to a Site that
did not declare it. LOC2 in particular is **not** a locale→Location table: it introduces no association
between a language and a place, infers no refinement from a language, a country, a timezone or an order,
and changes nothing about a request whose URL already names a Location.

### The reference deployment demonstrates the full model

The public reference deployment is configured as the worked example, so the architecture above has a
running counterpart. It is **two Spokes**, each a complete website with its own hostname:

```text
Foundation Spoke   foundation-template.provelopment.com
  Site ww (Global)    languages en, de — no locations, its own Home/About

Germany Spoke      foundation-template-germany.provelopment.com
  Site de (Germany)   languages de, en — Locations Berlin and Frankfurt,
                      an INDEPENDENT page tree (never a Global fallback)
```

Consequences it makes visible: **each Spoke currently carries exactly one Site, so NO Site selector
is rendered on either reference website**; the two websites are reached only through ordinary
authored reciprocal links, and there is no cross-Spoke Site control. Germany's
`de`/`en` path keys derive the canonical tags `de-DE`/`en-DE` because `de` is a COUNTRY Site; the
Location control appears only inside the Germany Spoke's Site `de`, and its neutral choice is *All
locations* / *Alle Standorte* (never the word used for a Site); Location switches stay inside that
Site and change neither the Site nor the language; and Layout is untouched by all of them. **Germany,
Berlin and Frankfurt are demonstration data** — placeholders an adopter replaces, not claims about
Provelopment.

### Site-scoped configuration and dictionaries

A site may override page-facing configuration (navigation, footer navigation, legal destinations,
Connect configuration, the page CTA destination, its locales/fallback, its region bindings) while
shared concerns stay shared (theme, assets, component vocabulary, the shell). Dictionaries resolve
in this order, and never across sites:

```
shared language base (e.g. config/i18n/fr.json answering fr, fr-ca and fr-fr)
  → optional exact shared locale dictionary        config/i18n/fr-ca.json
  → optional site language-base override           config/i18n/sites/ca/fr.json
  → optional site exact-locale override            config/i18n/sites/ca/fr-ca.json   (wins)
  → complete schema validation of the result
```

An unknown key in an override is refused; another site's override is never read.

## Multi-host Spoke runtime (FOUNDATION-MULTISITE-M16/M17 — CLOSED)

An Installation may declare **1..\* Spokes**, and the runtime below renders whichever one a request's host
names. The build selects the INSTALLATION (its root, its routing description); it never selects a Spoke.

```text
Host  →  src/proxy.ts  →  exact hostname claim  →  PRIVATE upstream header  →  public catch-all  →  M13/M14 renderer
```

* **Proxy is the sole `Host` → Spoke authority.** It normalizes the raw host with the domain's own rule
  (`@/core/spoke`) and matches **exact** claims: a differently-cased or ported host resolves, and every
  unclaimed host — a subdomain, a suffix lookalike or an absent `Host` — is **refused (404)**. There is no
  wildcard rule, no default Spoke and no "first" Spoke.
* **The selected runtime segment travels privately upstream.** The boundary passes the request through with
  `x-foundation-spoke-segment` set on the *request* (`NextResponse.next({ request: { headers } })`) and never
  adds it to a response. The header is **overwritten** on every handled request, so a client cannot select a
  Spoke by sending it, and an unclaimed host stays refused whatever it claims. One spelling authority lives in
  `src/config/spoke-selection.ts`.
* **The public App Router pathname remains the route identity.** `src/app/[[...segments]]/{layout,page}.tsx` is
  the ONLY normal page identity; the boundary performs **no page rewrite**, and the retired `/~spoke/<segment>`
  page tree does not exist (a direct request to `/~spoke/**` is refused). This is what makes client-side
  navigation ordinary App Router **soft navigation**: a `<Link>` click commits on the public pathname, with the
  rendered document proving it (a browser sentinel survives the transition; a reload would destroy it).
* **Page rendering resolves an explicit `SpokeRuntimeContext` from the trusted selection**
  (`runtimeContextForCurrentRequest()` → `requestPublicDestination()` → `spokeServerComposition(context)`). The
  route files resolve no hostname and hold no global configuration: they choose a context and hand it to the
  one shared composition (`pageForContext`, `pageMetadataForContext`, `layoutForContext`,
  `layoutMetadataForContext`).
* **The same public pathname may render different Spokes on different hostnames**, so public pages are
  **request-time selected** rather than duplicated static artifacts for one pathname: the public route
  generates no static parameters and claims no static pathname. The discovered per-context inventory remains a
  domain capability (`staticParamsForContext`) used by the sitemap, validation and tooling.
* **Spoke asset namespaces remain runtime-segment based and host-bound**: `/spokes/<segment>/assets/**` is
  served only on a host that Spoke answers for (any other host is refused, dotted paths included), while the
  **platform namespace `/assets/**` stays shared**.
* **`sitemap.xml`, `robots.txt` and `/[site]/[locale]/opengraph-image` are request-isolated**: each is composed
  from the Spoke the request resolves to, so Alpha publishes Alpha's origin and inventory and Beta publishes
  Beta's. There is no union sitemap and no cross-host URL.
* **`currentBuildRuntimeContext()` remains legacy / exactly-one-Spoke compatibility only.** It answers for a
  legacy or single-Spoke Installation, still **refuses** an Installation declaring two or more, and is no
  longer the public page authority.
* Site/locale completion is unchanged in its rules and now runs at the public boundary: an incomplete public
  path (a bare Site, an unknown second segment, no Site at all) is completed with a **public** redirect inside
  the selected Spoke only.

`inspectionSpoke: foundation` is an explicit **inspection-host policy** — it names the Spoke that
answers the owner's inspection hostname — and it is **not** a default Spoke: it is no fallback for
other hosts, and a request on a host no Spoke answers is still refused.


## Establishment: making ONE complete installation (FOUNDATION-B4B)

The domain model of an installation is `src/core/foundation-installation/**`; the act of creating one is
**establishment**, and its shape follows from one distinction the platform keeps deliberately:

```text
complete Foundation installation = immutable release content + authored capsule + generated state
                                   (the platform)           (the seed)          (the operational record)
```

* A Foundation **release** is platform-only (`scripts/release/release-content-policy.mjs` excludes
  `deployment/**`), because a release must never carry one site's authored material. A release is therefore
  NOT a complete installation, and establishment cannot invent the rest: the authored material is an input.
* The authored material is a **seed**: `site.config.json`, `config/i18n/**`, `content/**` — the capsule, in
  this repository `deployment/`. What establishment copies is the seed's **portable** authored material, so
  an existing installation's capsule is the ordinary seed: the records a capsule carries about ITSELF — its
  `foundation-baseline.json`, which names the release that installation adopted — are excluded rather than
  refused (an installation always has one), while generated `operational-state.json` is machine state rather
  than authorship and is refused outright.
* Establishment writes exactly two things of its own: the installation's **adoption record**
  (`foundation-baseline.json`: which immutable release this installation adopted, written from the release it
  established) and its **operational record** (`operational-state.json`: generated state, never authored).

The dependency direction is unchanged and load-bearing:

```text
release tooling (scripts/release/**)  →  pure release contract (src/core/foundation-release)
                                      →  installation lifecycle (src/core/foundation-installation)
```

`src/**` never imports `scripts/**`. The establishment mechanism is
`src/application/establish-foundation-installation.ts` (a use case over ports) with
`src/adapters/installation/**` (the Node mechanisms: reading a release directory, reading a seed, the guarded
target writer, the operational-record store), and the operator surface is
`scripts/installation/index.mjs`. It writes ONLY beneath the target root it is given, it never overwrites or
deletes, and it records no connection to anything: an installation needs no network, no GitHub and no other
installation to operate.

**What the record may claim (FOUNDATION-B4B-A1).** A durable operational event describes an operation that
actually happened, and health is an OBSERVATION rather than a step. Establishment therefore records a
COMPLETE, verified, ACTIVATED installation — `live` names the exact candidate that became this installation's
Foundation state — and leaves health unevaluated (`offline`, `healthEvaluatedAt: null`), because no health
check ran. Promotion is not health, and only `recordInstallationHealth` — a real evaluation of the live
installation — can make it `online`.

## Deployment topology — one Installation, many Spokes (FOUNDATION-MULTISITE-M18)

One Installation is ONE repository with ONE request boundary, and it may declare MORE THAN ONE **Spoke**.
A Spoke is a complete website: its own `site.config.json`, its own `config/i18n/` dictionaries, its own
`content/` tree (pages and artwork sources), its own page tree and its own Site collection. The
declaration lives in `deployment/spokes.json`, and each entry gives the Spoke an id and a root beneath the
installation root.

| Spoke | Public origin (its own `site.url`) | Site | Owns |
| --- | --- | --- | --- |
| `foundation` | https://foundation-template.provelopment.com | `ww` (Global) | the Global page tree, in English and German |
| `germany` | https://foundation-template-germany.provelopment.com | `de` (Germany) | the Germany page tree and the Locations Berlin and Frankfurt |

The request boundary is hostname-dispatched: the public `Host` header is the ONLY input, it selects at
most ONE Spoke by its exact canonical claim, and the selection travels as a private, unspoofable request
context rather than through the URL. Everything a visitor sees — chrome, navigation, dictionaries, pages,
sitemap, `robots.txt`, OpenGraph images and asset namespaces — is answered from THAT Spoke, and from no
other. This repository declares exactly two Spokes, and `deployment/README.md` documents the capsule that
holds them.

**Language is not ownership.** `/ww/de` is the German-language representation of the Global Site `ww`
and belongs to the Foundation Spoke; `/de/de` is the German-language representation of Site `de` and
belongs to the Germany Spoke, which is the only Spoke that binds the Berlin and Frankfurt locations.
Because each Spoke declares exactly ONE Site, neither offers a Site control and no cross-Spoke control
exists: ownership is a property of the hostname, not a visitor choice.

**Foreign coordinates fail closed.** A Site-shaped path addressed to the wrong Spoke is never served with
the other Spoke language and never redirects to the other hostname. The accepted completion rules may
still normalise a first segment that names one of the ANSWERING Spoke own LOCALES (so a Foundation-host
request for `/de/about` completes to `/ww/de/about`), and the result stays inside that Spoke and is
ultimately refused. Ownership, not the first status code, is the contract.

## Cross-Spoke discoverability — authored links, never a selector

The two Spokes are independent public websites, so a visitor who lands on one has no technical way to
reach the other unless the website SAYS SO. Isolation without discoverability is a defect, and the
correction is the ordinary web one: **authored reciprocal links between two public origins**, configured
through the existing secondary/footer navigation surface (`footerNavigation`) and localized through the
existing dictionary mechanism (`dictionary.navigation.items[href]`):

| Source website | Authored destination | Label |
| --- | --- | --- |
| Foundation (`foundation-template.provelopment.com`) | `https://foundation-template-germany.provelopment.com/` | `Germany` / `Deutschland` |
| Germany (`foundation-template-germany.provelopment.com`) | `https://foundation-template.provelopment.com/` | `Global` |

Four properties make this ordinary navigation rather than a second selection mechanism:

* **The destination is the target website's ROOT.** The source Spoke constructs no `/ww/en` or `/de/de`:
  the target performs its OWN root/locale completion (its supported-language negotiation, then its Site
  default), exactly as it does for a typed address.
* **The link is external.** It renders through the shared `NavItem` contract (new tab,
  `rel="noreferrer"`), and no `~spoke` prefix, private selection header, rewrite or client Spoke state is
  ever visible to the visitor.
* **The Site control is not restored.** Each Spoke still declares exactly ONE Site, so no control offers a
  cross-Spoke option: the header's contextual controls (Site/Location/Language/Layout) keep describing the
  CURRENT website only, and the footer carries ordinary secondary navigation.
* **Sitemap ownership does not merge.** `footerNavigation` is a rendering concern and was never a sitemap
  source, so each Spoke's `sitemap.xml` continues to publish its OWN origin and its OWN pages only.

The contract is proved at both ends: `deployment/tests/unit/m19-cross-spoke-discoverability.test.ts`
asserts the authored configuration, the localized labels, the external rendering, the absent Site control
and the sitemap invariant, while the deployment's browser scenario drives the real hostnames and follows
each link to the target's own completion.
