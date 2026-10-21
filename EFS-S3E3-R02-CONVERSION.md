# EFS S3-E3-R02 — controlled reference conversion ledger

**Implementation:** `deployment/efs`
**Converter:** `scripts/efs/convert-reference.mjs` (reads `deployment/spokes/**`; never writes there)
**Runtime:** EFS resolves the binding, Entity, Facet, Site, Page, representation and capsule source.
The shared shell (header, navigation, footer, dictionaries, layout switcher, language control,
contact form) is reused from the same Spoke context. The legacy **page resolver is not used** for a
converted host.

**R05:** production now has ONE runtime. A publication's owner is resolved from its explicit
`spokeId`/`spokeHubId` against `spokes.json` on Page, asset, metadata, sitemap and robots; `null` and
the reserved implicit Spoke cannot authorize anything. A host introduced only by a binding is allowed,
but a host claimed by a different Spoke is a conflict. Ordinary one-website establishment converts a
legacy-shaped seed into an explicit one-Spoke EFS Installation at establishment time.

**R06:** ordinary establishment mints a fresh permanent EntityID per independently established website
from the injected secure entropy port; the fixed `e_…0001` fallback is gone. An existing explicit seed —
including an imported or moved capsule — keeps its identity and declarations byte-for-byte. The publication
host comes only from the authored `publication.host`; `site.url` is informational and cannot create or
modify a binding. Empty optional tagline/description values are omitted rather than declared.

**R07:** PageIDs are allocated once from the complete authored route set, deterministically and without
collisions; a route whose readable base is already taken receives a stable numeric suffix, never a changed
route. Establishment validates the full generated manifest and its Page/route/representation/source
inventory, plus every publication's declared Spoke owner, before writing successful state. Partial Home
localization uses an explicit same-Page fallback (default locale when it has Home, otherwise the first
authored Home locale), never a fabricated translation or false `hreflang`.

## Before / after

| Concern | Before | After (R02) |
| --- | --- | --- |
| Spokes | `foundation`, `germany` | Preserved as Spoke contexts; each is published to one Entity |
| Entities | None | `e_00000000000000000000000001` (Foundation), `e_00000000000000000000000002` (Germany) |
| Facets | Spoke content trees | `foundation`, `germany` |
| Sites | `ww`, `de` | Non-geographic Site `main` in each Facet. `ww`/`de` remain URL binding prefixes, not Site identities |
| Pages | Foundation Home/About; Germany Home/About/Berlin/Frankfurt | **6 Pages**, explicit route declarations |
| Representations | `ww/en`, `ww/de`, `de/de`, `de/en` | **12 localized representations** (6 Pages × declared en/de), copied byte-for-byte into ownership paths |
| JSON/Markdown precedence | JSON over Markdown | Unchanged; JSON over Markdown per representation |
| Dictionaries | Shared platform/Spoke dictionaries | Unchanged; the shared shell consumes the same dictionary capability |
| Navigation | `site.config.json` Home/About; Germany footer link | Unchanged; shared shell navigation + EFS Page `nav.label` public properties |
| Branding | Header/footer placeholders, favicon, shell | Preserved in the shell; brand name/tagline/description as public Entity properties; logo and favicon copied to each Entity/Facet capsule |
| Assets | `/spokes/<segment>/assets/**` | Shared shell assets unchanged; EFS owner assets at `/<prefix>/owner-assets/**` (logo, favicon) |
| Site Hubs / Inspection hosts | `provelopment-foundation.vercel.app` inspection host | Explicit Foundation binding for the inspection host; no implicit default |
| Publication bindings | Implicit Spoke hostname | Three explicit bindings: Foundation host, inspection host, Germany host |
| Publication ownership | Not declared | Each publication names its owning Spoke (`foundation`, `germany`) explicitly. Page, asset, metadata, sitemap and robots all resolve that owner against `spokes.json`; an unclaimed host may be introduced by a binding, a host claimed by another Spoke is refused |
| Presentation source | Legacy Site found through `prefix[0]` | Each publication names `presentationSiteCode` explicitly (`ww`, `de`); public URL base comes from the binding, not from a country or Site name |
| URL grammar | `/ww/<locale>/...`, `/de/<locale>/...` | **Unchanged** — prefix is the explicit binding base; Site `main` is closed |
| Geographic behavior | Germany `business.regions`, timezone, regional generation | Retired. `berlin`/`frankfurt` are ordinary Pages; no timezone/region/DST scheduling exists in the manifest or capsule |
| Discovery | Legacy sitemap/robots | EFS binding-derived sitemap/robots; public Pages only |

## Explicit bindings

| Binding | Host | Prefix | Entity / Facet / Site | Locales |
| --- | --- | --- | --- | --- |
| `foundation-web` | `foundation-template.provelopment.com` | `ww` | Foundation / foundation / main | en, de |
| `foundation-inspection` | `provelopment-foundation.vercel.app` | `ww` | Foundation / foundation / main | en, de |
| `germany-web` | `foundation-template-germany.provelopment.com` | `de` | Germany / germany / main | de, en |

No URL changed. No host claim moved between Entities. Unknown hosts, prefixes, Sites,
representations and Pages are refused.

## Source and ownership

- Every representation exists at
  `deployment/efs/capsule/<EntityID>/<FacetID>/main/pages/<PageID>/<locale>.{json,md}`.
- Brand assets exist at
  `deployment/efs/capsule/<EntityID>/<FacetID>/assets/brand/{logo,favicon}.svg`.
- Private properties (`internal.ownerNotes`, `internal.facetNotes`, `internal.pageNotes`) are
  declared `public: false`; the public renderer cannot read them through the effective cascade.
- `brand.logo` is a capsule-relative path; external and malformed URLs are refused.

## Verification references

- `deployment/tests/unit/efs-reference-conversion.test.ts` — manifest validity, bindings, every
  representation source, owner assets, absence of geographic scheduling.
- `tests/browser/efs-reference.scenario.mjs` — real server with explicit Host: all 12 localized
  reference URLs, shell, canonical/hreflang, favicon bytes, private-data refusal, unknown
  Page/host refusal and sitemap.
- `tests/browser/efs.scenario.mjs` — real browser: managed/dedicated synthetic bindings, assets,
  navigation, metadata, structured data, responsive layout.
- `tests/unit/efs-public-rendering.test.tsx` — private property/nav-label leakage and external logo
  refusal.
- `tests/integration/efs-assets.test.ts` — owner isolation, traversal, nested-prefix route.
- `tests/unit/efs-owner.test.ts` — owner resolution against real flat and identified Hub
  Installations; reserved implicit, wrong-Hub, ambiguous and undeclared owners refused.
- `tests/integration/efs-ownership-runtime.test.ts` — one rule on Page, metadata, asset, sitemap and
  robots, including a binding-introduced host and a host-conflict refusal.
- `tests/integration/efs-established-one-website.test.ts` — an ordinary one-website seed is
  established as an explicit EFS Installation and immediately serves through it.
- `tests/unit/efs-establishment-seed.test.ts` — establishment-time conversion produces valid
  `spokes.json` + `efs/manifest.json` + owner-scoped capsule; an EFS seed is left unchanged.
- `tests/unit/legacy-test-runtime.test.ts` — the released resolver cannot be selected when
  `NODE_ENV=production`.
- `tests/integration/efs-publication-isolation.test.ts` — one Entity across Facets, multiple
  Entities under one Spoke, and one Entity through two distinct Spokes, all through the actual EFS
  request/rendering boundary.
- `tests/integration/efs-independent-installations.test.ts` — the same Entity served from two
  independent on-disk manifests and capsules.
- `deployment/tests/integration/efs-shared-shell.test.tsx` — complete rendered shared shell at a
  dedicated root, single prefix, multi-segment prefix and Site-open publication; owner refusal and
  name invariance.
- `tests/unit/efs-shell-presentation.test.ts` — explicit presentation source/public base and complete
  geography/locale neutrality.
