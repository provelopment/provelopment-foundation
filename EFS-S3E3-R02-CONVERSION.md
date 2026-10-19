# EFS S3-E3-R02 — controlled reference conversion ledger

**Implementation:** `deployment/efs`
**Converter:** `scripts/efs/convert-reference.mjs` (reads `deployment/spokes/**`; never writes there)
**Runtime:** EFS resolves the binding, Entity, Facet, Site, Page, representation and capsule source.
The shared shell (header, navigation, footer, dictionaries, layout switcher, language control,
contact form) is reused from the same Spoke context. The legacy **page resolver is not used** for a
converted host.

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
| URL grammar | `/ww/<locale>/...`, `/de/<locale>/...` | **Unchanged** — prefix is the Site code position; Site `main` is closed |
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
