# Site Customization — configuration-first operation

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-10-29.1`
> **Content model described:** the **current EFS installation model** — one immutable Foundation release established into one autonomous Installation that owns its authored capsule and serves explicitly declared Entities, Facets, Sites, Pages and localized representations through publication bindings owned by declared Spokes. Pages are language-neutral; each localized representation is a JSON or Markdown source; JSON visibility is per representation; `unlisted` means reachable but not advertised, never private. Update changes authored material; Upgrade adopts a different immutable release. Legacy country-coded Sites, regional pages, Location routing and computed timezone/DST behavior are historical only.
> **Procedure validation:** the release and establishment procedures retain their 2026-09-30 end-to-end baseline. Revision `2026-10-22.1` reconciles the distributed model to the merged EFS runtime and the A1-R2F receiver-key isolation, reference and hygiene correction, and the A1-R2F-C1 injective identified-Hub receiver-key correction, and is verified by the Foundation unit, integration, architecture, deployment and browser gates recorded in `FOUNDATION-COMPLETE-A1-R2F` (including its C1 correction record); no release tag is claimed by this revision.
> **Adopter baseline:** the installation's own adoption record — `deployment/foundation-baseline.json` inside the installation's capsule. An adopter's own governance record is the adopter's; it is never the Foundation's adoption record.
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed** and byte-identical to the master revision above — SHA-256
> verified at propagation — and is never edited in place: edit the master upstream and
> propagate.

## The principle

> **Prefer configuration, content and assets before source-code modification.**

The Foundation is a validated configuration-driven platform. Almost everything a
business needs — identity, navigation, calls to action, presentation, locale,
feature enablement — is **data**, validated at build time. Reaching into the
platform's own files to change behaviour breaks the upgrade path, and is almost
always unnecessary.

Full schema reference: the Foundation's `CUSTOMIZING.md`. This manual is the
**procedure**; that document is the **specification**. Do not duplicate the schema here.

## What you may change (adopter-owned)

- site configuration (identity, URL, contact, navigation, features, CTA, theme), including the
  per-Site overrides a deployment needs when its website serves more than one Site
- per-site interface wording (`config/i18n/sites/<site>/<language>.json`), which refines the
  shared language dictionary
- business content
- business imagery/artwork and its wiring
- the adopter's own locale dictionaries
- project documentation

## What you must not change

- the Foundation's own implementation. In an **installation** those files are what the immutable
  release wrote: they are never edited in place, and a later release replaces them. In a
  repository-shaped project, the platform copy it carries must stay faithful to the release the
  project records — an unrecorded local edit to it is a defect, not a customization (see
  `validation.md` and `foundation-upgrade.md`).

If a requirement genuinely cannot be met by configuration, content or assets, that
is an escalation — see `agent-operating-rules.md` — not a licence to fork the platform.

## Procedure

### Website identity (the Spoke)

Set the business name, tagline and description. These drive page titles, metadata,
structured data and the visible brand text. Keep them consistent across content,
dictionaries and metadata.

### Website URL

Set the website's canonical URL to the **actual production hostname** before deploying.

> **Configured canonical URL and actual production hostname must agree.** A
> mismatch silently publishes wrong canonical/OpenGraph/sitemap/robots URLs — a
> production defect that local validation cannot catch. See `troubleshooting.md`.

### Presentation

The Foundation ships **ONE canonical presentation**: a coherent presentation
intent (typography, rhythm, surface, header, hero, density, content width,
radius) resolved by the shared UI engine from the shipped configuration.
Presentation is **not an adopter-selectable surface** — there is no preset
selector, no preset switching and no multi-presentation deployment map (the
former preset-comparison feature was retired in 2026-09). Do not add one.

### Theme

Theme mode (light/dark/system) and radius are configuration. Do not hand-edit
design tokens to fake a theme change.

### Navigation

Navigation is configuration: order, labels, targets, regions/groups where the
project uses them, and permitted per-item icons. Keep labels business-meaningful
and targets real routes. **Removing an item does not remove the page:** there is no
content feature flag, a page exists because its file exists, and it stays live at its URL
— so to stop publishing it you must remove (or unpublish) the file itself.

### Call to action (CTA)

The primary CTA is configuration: enabled, label, destination, style, icon,
icon position and state.

Current platform behaviour — treat as the contract:

- The CTA renders **once**, in the shell's **top region** (below the header, above
  the main content), at **every** width.
- It is never rendered inside the sidebar, the bottom bar, or a mobile
  menu/overlay, so it cannot be duplicated, collapsed away, or obscured.
- Disabled, or missing a label/destination, renders **nothing** — the platform
  never invents a destination or an accessible name.

## CURRENT EFS OPERATING MODEL

This section is authoritative for the production runtime. The country/Site/Location guidance
below belongs to the retained legacy test runtime and historical releases.

- **Content ownership:** `Entity → Facet → Site → Page → localized representation`.
- **Operational ownership:** `Foundation Installation → Spoke Hub → Spoke`.
- A **Site** is a content context such as `main`, not a country, host, locale or prefix.
- A **publication** explicitly names its owning `spokeId` (and `spokeHubId` when applicable), the
  Entity, the Facet and its bindings.
- `deployment/efs/manifest.json` is the publication authority; `deployment/spokes.json` is the
  Spoke-hierarchy authority. Neither name nor hostname establishes ownership.
- Page sources live in `deployment/efs/capsule/<entityId>/<facetId>/<siteId>/pages/...`; both the
  manifest declaration and a validated source are required.
- Canonical URLs, `hreflang`, Open Graph URLs, assets and the sitemap come from the effective
  binding. `site.url` is optional and informational.
- A publication may select `presentationSiteCode` from its owning Spoke for the shared shell. That
  selection does not change identity or content ownership.
- **Contact ownership:** the Server Action matches the exact host/prefix binding and resolves the
  owning Spoke. Different Spokes may share one host with disjoint prefixes. An unclaimed host/prefix
  has no destination; forged fields/headers/EntityIDs cannot choose one. Two Entities in one Spoke
  intentionally share its receiver. `CONTACT_WEBHOOK_URL`/`TOKEN` are installation-wide defaults;
  `CONTACT_WEBHOOK_URL__<SPOKE_KEY>`/`TOKEN__<SPOKE_KEY>` are additive per-Spoke overrides. Conventional
  flat ids retain `ACME_SPOKE`; other flat ids use `__ENC_FLAT_…`, and identified Hub/Spoke pairs always
  use the injective `__ENC_HUB_<HUB_HEX>__<SPOKE_HEX>` form. An ambiguous legacy key is refused. The
  webhook payload adds a server-derived `origin` (publication/binding/Entity/Facet/Site/host/path) so a
  shared receiver can attribute the inquiry; existing clients may ignore it.
- JSON Page visibility is per localized representation; absent means public. `unlisted` is
  reachable but not advertised, never private. The manifest has no Page-level visibility.
- EFS does **not** infer geography or language from IDs, names, routes, Spokes or prefixes, and
  does **not** derive timezone or currency, compute opening status or route by location.
- `my.provelopment.com` is a public website hosting address, not a portal or Dashboard. A future
  Dashboard is a separate optional application and never a dependency of public sites.

Configuration validation for an EFS change:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test:deployment
pnpm build
pnpm test:browser:deployment
```


> **LEGACY RUNTIME — NOT EFS.** The Site-as-country, Location and regional-selector guidance below
> is historical. It is not an EFS configuration instruction and creates no geographic capability.

### Spokes, Sites, and per-Site configuration

A deployment serves a website — the **Spoke**, selected by hostname — and inside it one or more
**Sites**: a country, or `ww` for Worldwide/Global. Each
Site owns its own page tree, its own languages and its own **page-facing** configuration, and
any of these may differ per Site:

- navigation items, and the secondary footer navigation group;
- the legal destinations the footer surfaces;
- the Connect configuration;
- the shell CTA''s page destination;
- the site''s locale and fallback configuration;
- the pages and locations bound to the Site.

Everything generic stays **shared** unless it genuinely differs: theme and design tokens,
business artwork (`content/assets/` is one shared tree), the component vocabulary, and the
shell/layout system. You do **not** need a duplicated complete configuration file for every
country — configure once at the top level and override only the part that differs.

The full schema for site-scoped keys is the Foundation''s `CUSTOMIZING.md`.

### Spokes, Sites and Locations are different things

A **Site is not a Location.** Another office, city or region inside the same website is a
**Location** within the Site — Canada and France may be **Sites inside one Spoke** when one website
exposes both country contexts, while Toronto, Montreal and Vancouver are Locations inside one of
them. **Do not create a Site because a business opened another office**, and do not create a Site
for an independent website: that website is a **Spoke**. See `content-management.md`, *Spokes, Sites
and Locations are different things*.

### The four dimensions, and their controls

**Site**, **Language**, **Location** and **Layout** are independent: **Site** selects the
country/global context **inside the current website**, **Language** the locale inside that Site,
**Location** a physical/regional context inside that Site, and **Layout** only the Sidebar/Menu-bar
presentation. Switching one never changes another, and a control a
deployment does not need **does not appear** — a single-language, single-location Site renders
no language or location selector at all. The website itself is the **Spoke**: it is selected by
hostname and is never one of these visitor controls.

### Contact information

Contact values are configuration. Where the platform wires a contact route, all
touchpoints must point at that route consistently — including the CTA, connect
methods and footer.

### Business metadata

Keep description, OpenGraph/social art and any structured-data inputs aligned with
the real business. Metadata must not make claims the business cannot support.

### Configuration validation

Every configuration change ends with the validation that matches what changed (`validation.md`).
A configuration or content change is a **deployment-scoped** change:

```bash
pnpm exec tsc --noEmit        # the configuration still type-checks against the schema
pnpm lint
pnpm assets:check             # if artwork or an asset role changed
pnpm country-codes:check      # if a site or locale code changed
pnpm test:deployment          # the deployment's own acceptance tests
pnpm build
pnpm test:browser:deployment  # rendered contract, responsive, accessibility, where required
```

**Test scope follows change ownership:** a page or configuration edit does not require the
Foundation repository's own maintainer suite. A schema failure is a **loud, intended** signal —
never work around it by editing the schema.

## Common mistakes

- Editing platform source to achieve a configuration outcome.
- Publishing a canonical URL that does not match the live hostname.
- Removing a navigation item while leaving the route reachable (or vice versa).
- Configuring a language or location control the deployment does not need, or adding one by
  hand: a single-language or single-location Site renders no such selector.
- Treating another office as another Site — an office is a Location inside a Site.
- Duplicating a complete configuration file per country instead of overriding only what
  differs.
- Configuring two language folders that mean the same locale (`ca/en` together with
  `ca/en-ca`): Foundation refuses it as a hard error — choose one form.
- Changing a locale dictionary key structure rather than its values.
- Forgetting that presentation differences come from the shipped presentation
  configuration, not from ad-hoc CSS.
