# EFS S3-E3-R02 — final evidence ledger

**Implementation:** converted reference Installation at `deployment/efs`; EFS content resolution plus
the accepted shared shell. D21 remains for independent Architect/owner acceptance.

**R04 closure:** each publication now names its owning `spokeId` (and composite `spokeHubId` where
applicable) and its explicit `presentationSiteCode`; the runtime refuses a host-selected Spoke that
does not own the publication, and the shared shell receives an explicit public path base rather than
reading `prefix[0]`. Runtime isolation, two independent on-disk Installations and complete rendered
shell invariants are exercised in the R04 tests named below.

## 1. Eighteen accepted use cases

| UC | Status | Evidence |
| --- | --- | --- |
| UC-01 standalone website | **proven** | `EFS-S3E3-R02-CONVERSION.md`; `efs-reference` scenario 19/19; `establishWebsite` tests |
| UC-02 one Entity, several Facets | **executed** | `efs-publication-isolation.test.ts` — one Entity with `acme` and `restaurants` Facets serves two distinct Pages/properties under one Spoke; `efs-use-cases.test.ts` adds the declaration contract |
| UC-03 agency, three customers | **executed** | `efs-publication-isolation.test.ts` serves three publications across two Entities under one Spoke; `efs-use-cases.test.ts` proves four independent EntityIDs/publications |
| UC-04 agency publishes itself | **proven** | `efs-use-cases.test.ts` — agency Entity published alongside customer Entities |
| UC-05 franchise one Spoke | **proven** | `efs-use-cases.test.ts` — one Entity/one binding |
| UC-06 franchise many Spokes | **executed** | `efs-publication-isolation.test.ts` serves one Entity through two distinct `spokeId` publications; `multihost` 105/105 |
| UC-07 one Entity two Spokes | **executed** | `efs-publication-isolation.test.ts` — two distinct Spokes publish the same Entity/Facet with separate publication identities; reference Foundation/inspection hosts share the owning Spoke |
| UC-08 one Entity two Installations | **executed** | `efs-independent-installations.test.ts` — two on-disk manifests + capsules serve the same Entity independently; `efs-portability.test.ts` proves export/import identity |
| UC-09 customer leaves agency | **executed / contract** | `efs-portability.test.ts` exports only the selected Entity and refuses foreign files; `efs-independent-installations.test.ts` proves the extracted Installation serves |
| UC-10 tenant moves Installation | **executed / contract** | `efs-portability.test.ts` tamper/path validation; `efs-independent-installations.test.ts` serves the moved capsule from the second Installation |
| UC-11 multi-Hub mixed cardinality | **proven** | `multi-hub` browser 219/219; `spoke-multi-hub-runtime` 15 tests |
| UC-12 Facets vs Entities | **proven** | `efs-use-cases.test.ts` two Facets in one Entity vs two Entities |
| UC-13 authored navigation | **proven** | Shared shell navigation from authored Spoke config; EFS Page `nav.label` public projection; `efs-public-rendering` negative test |
| UC-14 reused identifiers/assets | **proven** | Owner asset route, MIME, traversal and foreign-prefix refusal; `efs-assets` 5 tests |
| UC-15 legacy Site Hubs/non-geographic Sites | **proven / retired geography** | Both converted Sites are `main`; `ww`/`de` are binding prefixes only; no regional scheduling |
| UC-16 copy-once templates | **proven** | `instantiateTemplate` new EntityID, rewritten paths, provenance (`efs-portability.test.ts`) |
| UC-17 failure/misroute | **proven** | Unknown prefix/host/Page/assets refused; same-Page fallback only; reference scenario |
| UC-18 publishing vs administration | **contract** | `efs-use-cases.test.ts` publication data has no admin surface; capsule files are entity-scoped. No commercial admin product is exercised in this open-source installation |

**Count:** 18 classified: 13 executed by HTTP/browser/on-disk tests, 5 verified by focused executable contracts; no preserved-only or unproven use case.

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
| 12 | Spoke/cross-Spoke isolation | **executed** — `efs-publication-isolation.test.ts`; host/prefix ownership refusal; EFS asset route |
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
| 27 | Navigation/footers | **executed** — complete rendered shell at dedicated, single- and multi-segment prefixes, Site-open/closed |
| 28 | Branding/layout/shells | **proven** — shared shell; owner logo/favicon |
| 29 | Dictionaries/overlays | **proven** — shared shell dictionary; owner dictionary adapter |
| 30 | Assets/namespaces | **executed** — owner route, MIME, traversal, foreign-prefix and publication-owner context |
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
