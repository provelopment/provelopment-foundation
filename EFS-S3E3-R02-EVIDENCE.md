# EFS S3-E3-R02 — final evidence ledger

> **HISTORICAL EVIDENCE.** `D21` was subsequently accepted by the owner, and the implementation is
> merged at Foundation `main` `19d9195`. Statements below that `D21` remains open describe this
> checkpoint, not current status. Current behaviour is the merged source/tests.

**Implementation:** converted reference Installation at `deployment/efs`; EFS content resolution plus
the accepted shared shell. D21 remains for independent Architect/owner acceptance.

**R05 closure:** the remaining implicit/null owner bypass is removed. Every EFS surface resolves the
publication's explicit `spokeId`/`spokeHubId` inside the Installation's declared `spokes.json`
hierarchy; a host introduced only by a binding is accepted, while a non-existent, wrong-Hub,
ambiguous or host-conflicting owner is refused. Production has ONE runtime: explicit EFS. The
released Page/locale resolver is retained only as a non-production test utility for the synthetic
suites. Ordinary one-website establishment converts its authored seed into an explicit one-Spoke
EFS Installation (`spokes.json`, `efs/manifest.json`, owner-scoped capsule) before writing the target.
The full browser matrix at R05 is **12,545 / 12,545** checks passing. The final R06 tree again passes
**12,545 / 12,545**.

**R06 correction:** ordinary establishment now mints a fresh permanent EntityID for each independent
website from injected 16-byte secure entropy; it never reuses `e_00000000000000000000000001`, never derives
identity from authored data, and never re-mints an already-explicit or imported Entity. Publication
authority is the explicit `publication.host` declaration in `site.config.json`; `site.url` is only
informational and can neither create nor change a binding. Absent optional tagline/description properties
remain absent, and an unauthored Home receives an explicit valid starter declaration. The focused R06
tests are `efs-establishment-identity.test.ts`, `efs-established-identity.test.ts` and
`efs-established-publication-authority.test.ts`.

**R07 correction:** PageIDs are allocated deterministically from the complete authored route set, with
collision-free suffixes (`company-team` and `company-team-2` for the distinct routes `/company-team` and
`/company/team`). Routes, source bytes and existing explicit identities are never rewritten. Establishment
now validates the complete generated manifest, Page/route/representation/source uniqueness, source inventory
and explicit Spoke ownership BEFORE writing an adoption record or materialising the target. Partially
localized Home Pages use an explicit same-Page fallback to the default locale when present, otherwise to the
first authored Home locale; no translation is invented and `hreflang` advertises only present representations.
Executable evidence is in `efs-established-page-identity.test.ts` and
`efs-established-home-default-absent.test.ts`. The final R07 tree passes **12,545 / 12,545** browser
checks.

## 1. Eighteen accepted use cases

| UC | Status | Evidence |
| --- | --- | --- |
| UC-01 standalone website | **executed** | `efs-established-one-website.test.ts` establishes an ordinary one-website seed, verifies the generated explicit declarations and serves its Page; `EFS-S3E3-R02-CONVERSION.md`; `efs-reference` browser scenario |
| UC-02 one Entity, several Facets | **executed** | `efs-publication-isolation.test.ts` — one Entity with `acme` and `restaurants` Facets serves two distinct Pages/properties under one Spoke; owner resolved from a real `spokes.json`; `efs-use-cases.test.ts` adds the declaration contract |
| UC-03 agency, three customers | **executed** | `efs-publication-isolation.test.ts` serves three publications across two Entities under one Spoke; `efs-use-cases.test.ts` proves four independent EntityIDs/publications |
| UC-04 agency publishes itself | **proven** | `efs-use-cases.test.ts` — agency Entity published alongside customer Entities |
| UC-05 franchise one Spoke | **proven** | `efs-use-cases.test.ts` — one Entity/one binding |
| UC-06 franchise many Spokes | **executed** | `efs-publication-isolation.test.ts` serves one Entity through two distinct real `spokeId` publications; `efs-owner.test.ts` proves Hub-local identity isolation; `multihost` browser 105/105 |
| UC-07 one Entity two Spokes | **executed** | `efs-publication-isolation.test.ts` — two genuinely declared Spokes publish the same Entity/Facet with separate publication identities; `efs-ownership-runtime.test.ts` proves the same rule on Page, metadata, asset, sitemap and robots; reference Foundation/inspection hosts share the owning Spoke |
| UC-08 one Entity two Installations | **executed** | `efs-independent-installations.test.ts` — two on-disk explicit Installations with their own real Spokes serve the same Entity independently; `efs-portability.test.ts` proves export/import identity |
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

**Count:** 18 classified: 8 proven, 6 executed end-to-end, 2 executed/contract, 1 proven with retired geography, 1 contract; no preserved-only or unproven use case.

## 1a. D21 baseline-versus-target measurements (`S3-E3-R05`)

These are comparable measurements of the released baseline and the completed EFS target, not test
counts. The baseline is the released one-runtime Page/locale installation with an implicit Spoke; the
target is this branch's explicit EFS installation.

| Measure | Released baseline | EFS target | Net result |
| --- | --- | --- | --- |
| Ordinary website establishment | `installation:establish` with release, payload, seed, target, name, repository, established-by; seed = config + dictionaries + pages + assets | Same command and same authored inputs. Establishment now ALSO persists `spokes.json`, one declared Spoke root and `efs/manifest.json` + owner-scoped capsule | **0 additional authoring inputs / 0 additional operator steps**. Explicit EFS declarations are produced at establishment time. |
| Authoritative source/configuration declarations | 1 root `site.config.json` + optional `spokes.json`; no publication/Entity declaration | 2 Spoke declarations + 2 Entities + 2 Facets + 2 Sites + 6 Pages + 12 representations + 2 publications + 3 bindings (reference Installation) | More **explicit** facts, all generated or authored once; no fact is inferred from a name, host or prefix. |
| Publication/content resolution | host → one runtime context → legacy site/locale/page resolver | host + binding → publication owner (declared Spoke/Hub, verified in `spokes.json`) → Entity → Facet → Site → Page → representation → owner capsule | One additional **declared** identity check. Each step is a constant lookup; no scan of Sites/Spokes, no name similarity and no fallback. |
| Agency / multi-Entity setup | one Spoke per website; cross-Entity sharing is a separate deployment | one Spoke may publish several Entities and Facets; two declared Spokes may publish one Entity. `efs-publication-isolation.test.ts` | Fewer Spokes needed for an agency; many-to-many is explicit. |
| Entity extraction / portability | copy a whole site's authored tree | export one Entity's manifest declaration + capsule files; serve it from a second on-disk Installation. `efs-portability.test.ts`, `efs-independent-installations.test.ts` | Extraction is Entity-scoped instead of site-wide. |
| Alternative production runtime algorithms | 1 legacy Page/locale algorithm; EFS was an additional path when declared | **1** production algorithm (EFS). The released resolver exists only behind `legacyTestRuntimeEnabled`, which is false when `NODE_ENV=production`; `legacy-test-runtime.test.ts` | One algorithm removed from production decision space. |
| Protected capability coverage | 40-row preservation ledger below | Same 40 rows; 33 proven/executed, 3 preserved, 1 split (PM-20), 3 retired | No protected capability was discarded to obtain a green suite. |
| Intentional retirement | geography-derived location, region routing, timezone/DST scheduling, country-code tooling | Same retirements; authored opening hours remain (PM-20 split) | Retirement is unchanged and explicit. |
| Canonical reference | 2 Spokes / 6 Pages / 12 representations | 2 Entities / 2 Facets / 2 Sites / 6 Pages / 12 representations / 2 publications / 3 bindings | Same public URLs; explicit ownership replaces prefix/name inference. |

**Why this is a credible net simplicity improvement.** The target adds declarations, not decisions:
the declarations are persisted once, generated for an ordinary website, and replace a larger class
of runtime guesses (which Site, which Spoke, which locale, which region). The request path becomes a
single deterministic chain with one owner check, and the number of production runtime algorithms
falls from two to one. The cost is visible authored/configuration data; the benefit is that no public
request can be answered by a name resemblance or a missing-config fallback. That is the D21 trade the
Architect must judge.


## 2. Forty preservation rows

| PM | Capability | Status |
| ---: | --- | --- |
| 01 | Establishment | **executed** — `efs-established-one-website.test.ts` + establishment bootstrap; ordinary seed becomes explicit EFS |
| 02 | Installation autonomy | **proven** — full suite |
| 03 | Lifecycle / operational state | **proven** — full suite |
| 04 | Upgrade boundary | **proven** — full suite |
| 05 | Implicit one-Spoke legacy | **retired as a production path** — ordinary establishment generates an explicit Spoke; the released resolver remains only as a non-production test utility (`legacy-test-runtime.test.ts`) |
| 06 | Flat `spokes[]` | **proven** |
| 07 | `spokeHubs[].spokes[]` | **proven** |
| 08 | Hub-local/composite identity | **proven** |
| 09 | Host claims/aliases | **proven** |
| 10 | Unknown-host rejection | **executed** — `efs-ownership-runtime.test.ts` refuses an unclaimed/conflicting host consistently on Page, asset, sitemap and robots |
| 11 | Inspection hosts | **proven** — Foundation inspection binding |
| 12 | Spoke/cross-Spoke isolation | **executed** — real `spokes.json` ownership; `efs-publication-isolation.test.ts`, `efs-owner.test.ts`, `efs-ownership-runtime.test.ts` |
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
| 30 | Assets/namespaces | **executed** — same owner rule on Page/asset/metadata/sitemap/robots: `efs-ownership-runtime.test.ts`; MIME, traversal and foreign-prefix refusal |
| 31 | Business profile/legal/contact | **proven** — inherited public contact properties + shared contact feature |
| 32 | Structured data/metadata/locale tags | **proven** — canonical, hreflang, OpenGraph fields, JSON-LD |
| 33 | Canonical/robots/sitemap | **executed** — binding-derived output and owner agreement in `efs-ownership-runtime.test.ts` |
| 34 | Schema/coherence/diagnostics | **proven** — conversion/portability diagnostics, malformed input tests |
| 35 | Hexagonal boundaries | **proven** — full suite |
| 36 | Write ownership | **proven** — full suite + classified converter |
| 37 | Release policy | **proven** — full suite |
| 38 | Adopter ownership | **proven** — capsule export/import, copy-once provenance |
| 39 | Browser/accessibility | **proven** — full browser matrix, EFS desktop/tablet/mobile, keyboard/a11y suites |
| 40 | Country-code tooling | **retired** |

**Count:** 40/40 classified — 27 proven, 6 executed end-to-end, 2 preserved, 1 split (PM-20), 4 retired.
PM-20 is deliberately **split**, not wholly retired: authored opening hours remain accepted.
