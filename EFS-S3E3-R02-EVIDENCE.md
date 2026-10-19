# EFS S3-E3-R02 — final evidence ledger

**Implementation:** converted reference Installation at `deployment/efs`; EFS content resolution plus
the accepted shared shell. D21 remains for independent Architect/owner acceptance.

## 1. Eighteen accepted use cases

| UC | Status | Evidence |
| --- | --- | --- |
| UC-01 standalone website | **proven** | `EFS-S3E3-R02-CONVERSION.md`; `efs-reference` scenario 19/19; `establishWebsite` tests |
| UC-02 one Entity, several Facets | **preserved** | Facet ownership/cascade contract (`efs-identity-cascade-contract.test.ts`); schema accepts multiple Facets; reference has one Facet per Entity |
| UC-03 agency, three customers | **preserved** | Entity/Facet separation, owner-scoped capsules and foreign-owner refusal; no agency product introduced |
| UC-04 agency publishes itself | **preserved** | Same Entity can publish through another explicit binding (Foundation + inspection host) |
| UC-05 franchise one Spoke | **preserved** | One Entity → one publication/binding; shared shell/multi-Spoke suites |
| UC-06 franchise many Spokes | **proven** | Two converted Spokes; `multihost` 105/105 and multi-Spoke unit suites |
| UC-07 one Entity two Spokes | **proven** | Foundation host + inspection host resolve the same Entity/Page with distinct bindings |
| UC-08 one Entity two Installations | **preserved** | Capsule export/import preserves identity (`efs-portability.test.ts`); installation autonomy suite |
| UC-09 customer leaves agency | **preserved** | Export/import of one Entity capsule; neighbouring Entities untouched |
| UC-10 tenant moves Installation | **preserved** | Relative capsule paths and import validation; no host/source path stored in identity |
| UC-11 multi-Hub mixed cardinality | **proven** | `multi-hub` browser 219/219; `spoke-multi-hub-runtime` 15 tests |
| UC-12 Facets vs Entities | **preserved** | Distinct Facet IDs inside an Entity; explicit publication names Entity+Facet |
| UC-13 authored navigation | **proven** | Shared shell navigation from authored Spoke config; EFS Page `nav.label` public projection; `efs-public-rendering` negative test |
| UC-14 reused identifiers/assets | **proven** | Owner asset route, MIME, traversal and foreign-prefix refusal; `efs-assets` 5 tests |
| UC-15 legacy Site Hubs/non-geographic Sites | **proven / retired geography** | Both converted Sites are `main`; `ww`/`de` are binding prefixes only; no regional scheduling |
| UC-16 copy-once templates | **proven** | `instantiateTemplate` new EntityID, rewritten paths, provenance (`efs-portability.test.ts`) |
| UC-17 failure/misroute | **proven** | Unknown prefix/host/Page/assets refused; same-Page fallback only; reference scenario |
| UC-18 publishing vs administration | **preserved** | Manifest/publication is explicit and separate from authored capsule content; no admin product introduced |

**Count:** 8 proven, 10 preserved by the accepted contracts/preservation suites; no unknown or unclassified use case.

## 2. Forty preservation rows

| PM | Capability | Status |
| ---: | --- | --- |
| 01 | Establishment | **proven** — actual reference conversion + establishment tests |
| 02 | Installation autonomy | **proven** — full suite |
| 03 | Lifecycle / operational state | **proven** — full suite |
| 04 | Upgrade boundary | **proven** — full suite |
| 05 | Implicit one-Spoke legacy | **preserved** — single-Spoke suite; byte equivalence not claimed |
| 06 | Flat `spokes[]` | **proven** |
| 07 | `spokeHubs[].spokes[]` | **proven** |
| 08 | Hub-local/composite identity | **proven** |
| 09 | Host claims/aliases | **proven** |
| 10 | Unknown-host rejection | **proven** — EFS reference + request context |
| 11 | Inspection hosts | **proven** — Foundation inspection binding |
| 12 | Spoke/cross-Spoke isolation | **proven** |
| 13 | Implicit Site Hub | **preserved** |
| 14 | Explicit Site Hubs | **proven** |
| 15 | Site resolution/default | **preserved** — non-geographic Sites; country behavior retired |
| 16 | Site selector/switcher | **proven** — shared shell + EFS open binding |
| 17 | Locales/tags/fallback | **proven** — BCP 47, hreflang, same-Page fallback |
| 18 | Cross-Site refusal | **proven** |
| 19 | Location requirements | **retired** |
| 20 | Regions/hours/timezones/DST | **split** — authored opening-hours properties are accepted and public; geographic scheduling/timezone/DST is retired |
| 21 | Regional landings/pages | **retired** — Berlin/Frankfurt are ordinary Pages |
| 22 | Nested page routes | **proven** |
| 23 | JSON pages | **proven** — reference Home Pages through the one document composer |
| 24 | Markdown pages | **proven** — reference About/Berlin/Frankfurt Pages |
| 25 | JSON/Markdown precedence | **proven** |
| 26 | `public`/`unlisted` | **proven** — legacy suite + EFS sitemap |
| 27 | Navigation/footers | **proven** — shared shell on converted hosts |
| 28 | Branding/layout/shells | **proven** — shared shell; owner logo/favicon |
| 29 | Dictionaries/overlays | **proven** — shared shell dictionary; owner dictionary adapter |
| 30 | Assets/namespaces | **proven** — owner route, MIME, traversal, foreign-prefix |
| 31 | Business profile/legal/contact | **proven** — inherited public contact properties + shared contact feature |
| 32 | Structured data/metadata/locale tags | **proven** — canonical, hreflang, OpenGraph fields, JSON-LD |
| 33 | Canonical/robots/sitemap | **proven** — binding-derived reference output |
| 34 | Schema/coherence/diagnostics | **proven** — conversion/portability diagnostics, malformed input tests |
| 35 | Hexagonal boundaries | **proven** — full suite |
| 36 | Write ownership | **proven** — full suite + classified converter |
| 37 | Release policy | **proven** — full suite |
| 38 | Adopter ownership | **proven** — capsule export/import, copy-once provenance |
| 39 | Browser/accessibility | **proven** — full browser matrix, EFS desktop/tablet/mobile, keyboard/a11y suites |
| 40 | Country-code tooling | **retired** |

**Count:** 33 proven, 3 preserved, 1 split (PM-20), 3 retired; 40/40 classified.
PM-20 is deliberately **split**, not wholly retired: authored opening hours remain accepted.
