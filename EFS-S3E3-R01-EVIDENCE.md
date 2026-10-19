# EFS S3-E3-R01 — fixture, use-case and preservation evidence

**Branch:** `feat/foundation-efs-s3e3-canonical-integration`
**Status:** implementation evidence only. This file does **not** claim D21 has passed. The reference
Installation conversion and several use cases remain unproven; see §1 and §3.

## 1. Controlled reference fixture conversion — before / after

| Fixture | Before | After in this work order |
| --- | --- | --- |
| `deployment/spokes/foundation` | Legacy Spoke: Site `ww`; locales `en`, `de`; Pages `ww/en/home.json`, `ww/de/home.json`, `ww/en/about.md`, `ww/de/about.md`; ~100 authored icon/placeholder assets | **Unchanged**; still served by the legacy path. Not converted to an explicit Entity/Facet/Site capsule. |
| `deployment/spokes/germany` | Legacy Spoke: Site `de`; locales `de`, `en`; Pages `home`, `about`, `berlin`, `frankfurt` in both locales | **Unchanged**; still served by the legacy path. Not converted. |
| `tests/fixtures/efs/canonical` | Did not exist | Explicit candidate: one Entity (`e_00000000000000000000000000`), Facet `acme`, Sites `main`/`outlet`, Pages Home/About/nested Detail, en-001/fr/fr-CA, managed/dedicated/Open bindings, owner assets |

**Why this is not a completed conversion:** converting the released reference Spokes requires
re-authoring their ~18 Pages, dictionaries, navigation, branding and asset catalogues into the EFS
capsule layout, then removing the legacy request branch. That work is **not complete**, so the
legacy reference path remains. The controlled EFS capsule proves the new runtime without pretending
the released fixture has moved.

No file under `01.web-1` was read for implementation or modified.

## 2. 18 accepted use cases — classification

| UC | Status | Evidence / gap |
| --- | --- | --- |
| UC-01 standalone website | **partial** | `establishWebsite` creates one Entity/Facet/Site/Home/localized representations; dedicated EFS host proves it over HTTP. Ordinary released website conversion is not done. |
| UC-02 one Entity, several Facets | **unproven** | Candidate capsule has one Facet. |
| UC-03 agency, three customers | **unproven** | No three-Entity agency fixture. |
| UC-04 agency publishes itself | **unproven** | No agency-self publication fixture. |
| UC-05 franchise one Spoke | **unproven** | No franchise fixture. |
| UC-06 franchise many Spokes | **partial** | Legacy multi-Spoke suite passes; EFS has no many-Spoke conversion. |
| UC-07 one Entity two Spokes | **proven** | Same Entity/Facet/Site/Page resolved through managed and dedicated hosts, preserving identities. |
| UC-08 one Entity two Installations | **unproven** | No two-Installation EFS fixture. |
| UC-09 customer leaves agency | **partial** | Capsule export/import preserves identity; no agency-exit workflow is exercised. |
| UC-10 tenant moves Installation | **partial** | Capsule export/import and copy-once template are proven; no live Installation move. |
| UC-11 multi-Hub mixed cardinality | **partial** | Legacy multi-Hub browser/unit suites pass; no EFS multi-Hub conversion. |
| UC-12 Facets vs Entities | **unproven** | Candidate has one Entity/Facet. |
| UC-13 authored navigation | **partial** | EFS navigation is generated from public Pages with `nav.label`; no fully authored navigation model. |
| UC-14 reused identifiers/assets | **proven** | Inherited `brand.logo`/`brand.name` render through the binding; owner asset bytes are served; foreign path/owner refused. |
| UC-15 legacy Site Hubs/non-geographic Sites | **partial / retired geography** | `main`/`outlet` work; `ww`/country geography is retired and not restored. |
| UC-16 copy-once templates | **proven** | `instantiateTemplate` mints a new EntityID, rewrites every file path and records provenance; test passes. |
| UC-17 failure/misroute | **proven** | Unknown prefix/host/locale → 404; fallback only to an authored same-Page representation; traversal/foreign asset refused. |
| UC-18 publishing vs administration | **unproven** | No separated administration surface. |

**Count:** 4 proven (07, 14, 16, 17), 7 partial, 7 unproven, with UC-15 carrying the retired-geography split. **Not 18/18 proven.**


## 3. 40 preservation rows — classification

`proven` means current suites or the EFS browser scenario exercise the capability. `legacy` means the
released legacy runtime is preserved but not converted to EFS. `retired` means geography was retired
by D28/D31.

| PM | Capability | Status |
| ---: | --- | --- |
| 01 | Establishment | partial — EFS core + dedicated host; released fixture not converted |
| 02 | Installation autonomy | proven — full suite |
| 03 | Lifecycle / operational state | proven — full suite |
| 04 | Upgrade boundary | proven — full suite |
| 05 | Implicit one-Spoke legacy | legacy proven; byte-equivalence not claimed |
| 06 | Flat `spokes[]` | proven |
| 07 | `spokeHubs[].spokes[]` | proven |
| 08 | Hub-local/composite identity | proven |
| 09 | Host claims/aliases | proven |
| 10 | Unknown-host rejection | proven |
| 11 | Inspection hosts | proven |
| 12 | Spoke/cross-Spoke isolation | proven |
| 13 | Implicit Site Hub | legacy proven |
| 14 | Explicit Site Hubs | proven |
| 15 | Site resolution/default | legacy proven; country behaviour retired |
| 16 | Site selector/switcher | legacy proven; EFS open binding proven |
| 17 | Locales/tags/fallback | proven — BCP 47, same-Page fallback, no phantom alternate |
| 18 | Cross-Site refusal | proven |
| 19 | Location requirements | retired |
| 20 | Regions/hours/timezones/DST | retired |
| 21 | Regional landings/pages | retired |
| 22 | Nested page routes | proven — EFS `/products/detail` and legacy suite |
| 23 | JSON pages | proven |
| 24 | Markdown pages | proven |
| 25 | JSON/Markdown precedence | proven |
| 26 | `public`/`unlisted` | proven — sitemap excludes unlisted/nested Detail |
| 27 | Navigation/footers | partial — EFS header/nav/language links; no footer parity |
| 28 | Branding/layout/shells | partial — EFS header/logo; no full shell parity |
| 29 | Dictionaries/overlays | legacy proven; EFS dictionaries not integrated |
| 30 | Assets/namespaces | proven — owner-scoped bytes/MIME/traversal; legacy namespaces pass |
| 31 | Business profile/legal/contact | partial — address/phone/opening hours public; no structured address |
| 32 | Structured data/metadata/locale tags | partial — canonical/hreflang/JSON-LD/OG metadata; no social image |
| 33 | Canonical/robots/sitemap | partial — binding-scoped proven; legacy-output equivalence not claimed |
| 34 | Schema/coherence/diagnostics | partial — EFS diagnostics/portability; not wired to all authoring surfaces |
| 35 | Hexagonal boundaries | proven — full suite |
| 36 | Write ownership | proven — full suite |
| 37 | Release policy | proven — full suite |
| 38 | Adopter ownership | partial — capsule export/import core; no adopted-installation workflow |
| 39 | Browser/accessibility | partial — EFS browser 18/18 passes; no screen-reader audit |
| 40 | Country-code tooling | retired |

**Count:** 22 proven, 9 partial, 9 legacy/retired, 0 missing. **Not 40/40 proven.**

## 4. Simplicity measurements (indicative, not D21 acceptance)

| Measure | Released legacy path | EFS candidate |
| --- | --- | --- |
| Ordinary establishment | `site.config.json` + content file | `establishWebsite` (mints EntityID, Facet/Site/Home/reps/binding) |
| Files for one website | config + one Page file | manifest + one source per representation |
| Routing inputs | Spoke site code + locale + route | host → binding → Entity/Facet/Site/Page/representation |
| Portability | copy Spoke tree | export/import one Entity capsule; copy-once template mints new identity |
| Runtime selection | proxy host claim + Spoke context | manifest-projected host claim + explicit binding resolver |
| Assets | `/spokes/<segment>/assets` | `/<prefix>/owner-assets/<path>` inside the Entity/Facet capsule |

These are counts and shapes, not a performance benchmark. D21 remains for independent acceptance.
