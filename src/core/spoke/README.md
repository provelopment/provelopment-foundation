# The Spoke Hub / Spoke / Hub / Site vocabulary (FOUNDATION-MULTISITE-S1 / S2)

The pure outer-domain vocabulary this template needs in order to host more than one publicly
addressable domain from one Foundation installation.

```text
Spoke Hub   coordinates the installation's Spokes        (1..* Spokes)
Spoke       ONE independently addressable domain          (1..* Hubs)
Hub         an internal grouping of Sites in one Spoke    (1..* Sites)
Site        the EXISTING Foundation `sites[]` context     (unchanged; owned by `@/core/site`)
```

## What is here

| Module | Contract |
| --- | --- |
| `hostname.mjs` + `hostname.ts` | the normalized hostname value and its pure rules — the ONE implementation, consumed by the typed surface here and by the build seam, which runs where TypeScript cannot |
| `model.ts` | the container types: `SpokeHub`, `Spoke`, `Hub` and their identities |
| `coherence.ts` | the pure rules that make `hostname → Spoke` total and unambiguous |
| `resolve.ts` | the pure decision: a raw request host → exactly one Spoke, or none |
| `site-ownership.ts` | the pure decision: an already-selected Spoke + a Site code → its owning Hub, or none |
| `hub-membership.ts` | the pure partition: one resolved Spoke-wide Site population + authored membership → `Hub[]` (no membership → one implicit Hub) |

Import from `@/core/spoke`; the inner modules are not a consumer surface.

**Hostname ownership is explicit and EXACT.** A Spoke claims its canonical hostname plus any exact
aliases (`www.example.com` and `example.com` may both belong to one Spoke), and a claim for
`example.com` never claims `foundation.example.com` or any other name beneath it — there is no
wildcard, no suffix rule and no implicit subdomain ownership.

**A Site code belongs to one Hub in its Spoke.** A public URL is `/<site>/<locale>/<route>` with no
Hub segment, so after the hostname has chosen the Spoke the Site code alone must identify the Site;
the same code in two *different* Spokes is valid, because the hostname already separates them.

**Exactly one default Site per Spoke.** `ResolvedSite.isDefault` is the Site domain's own flag, but
the designation is Spoke-wide: because `/` carries no Site segment, a Spoke must have exactly one
default Site across all of its Hubs — while each Spoke has its own.

**Resolve once, then partition.** A Spoke's Sites are resolved ONCE from its authoritative `sites[]`
and `defaultSite`, and that one population is then partitioned into Hubs by the authored membership.
No membership at all means one implicit Hub holding every Site; ANY membership means every Site must
be assigned (all or none). Resolving a separate Site population per Hub would create two defaults,
which coherence already refuses.

**The implicit Hub id is reserved and never authorable.** `IMPLICIT_HUB_ID` is the domain's marker
for "no membership was authored"; an explicit assignment may never use it, so an authored Hub can
never be confused with the marker the compatibility path uses.

## Spoke identity (FOUNDATION-MULTISITE-S3C1)

`IMPLICIT_SPOKE_ID` is the reserved id of the LEGACY compatibility Spoke: when an Installation declares
no Spoke collection, its single Spoke IS the Installation root and carries this id. Like
`IMPLICIT_HUB_ID` it is deterministic, internal, non-public, non-filesystem and NOT authorable — an
explicit `spokes.json` entry may never declare it (padding cannot launder it), while an ordinary id is
carried verbatim and compared exactly (no case folding, no trimming, no slugging).

`spokeCollectionIssues(...)` is the ONE authority for the identity semantics of an authored collection:
at least one Spoke, non-blank ids, the reserved id, and exact uniqueness. Where a Spoke is AUTHORED —
`spokes.json`, the `spokes/` directory, paths, roots — is configuration's business and never this
module's: no path type and no filesystem concern enters `@/core/spoke`.

## Identified Spoke Hubs (FOUNDATION-ID-M3-P1)

The outer layer now has an IDENTITY, and the hierarchy it names is
`Installation → Spoke Hub → Spoke → Site Hub → Site → Locale`:

| Name | What it is |
| --- | --- |
| `SpokeHubId` / `SpokeHubIdentity` | a Spoke Hub's stable id — never a path, a hostname, a URL segment, a resource directory or Business/Tenant ownership |
| `IdentifiedSpokeHub` | an identified `SpokeHub`: the same `{ spokes }` collection, named. NOT a redefinition — it is assignable to `SpokeHub` and every existing pure function accepts it unchanged |
| `InstallationSpokeHubCollection` | an Installation's identified Hubs, in AUTHORED order (never sorted, never a directory listing) |
| `IdentifiedSpokeRef` | the COMPOSITE reference `(SpokeHubId, SpokeId)` — the only way to name one Spoke unambiguously, because a local id may repeat in another Hub |
| `IMPLICIT_SPOKE_HUB_ID` | the reserved id of the ONE Spoke Hub the runtime composes today. It is NOT authorable, and it is declared independently of `IMPLICIT_SPOKE_ID` and `IMPLICIT_HUB_ID` — three markers, three declarations, three rule sets, one spelling |
| `identifiedSpokeHubCollectionIssues` | the collection's coherence: nonempty Hubs, unique Hub ids, nonempty Spoke membership, unique Spoke ids *within* a Hub, a local id reused in a different Hub ACCEPTED, and one Spoke in one Hub per exact hostname |
| `spokeByRef(collection, ref)` | the composite lookup: an undeclared Hub or id answers `null` — never a fallback, never a default |

**A Spoke id is Hub-local; a hostname is Installation-wide.** That asymmetry is the whole reason the
composite reference exists: two Hubs may each own a Spoke called `global`, while a request carries ONE
host and must select exactly ONE Spoke in exactly ONE Hub.

**Reuse, not restatement.** The collection's coherence is COMPOSED from the existing authorities — the
hub-id rules (`spoke-hub-id.mjs`) and the per-`SpokeHub` rules (`coherence.ts`) — and adds only the two
rules that exist across Hubs. Nothing here re-derives a Site, a Site Hub or a default.

**Phase 1 does not activate the runtime.** An AUTHORED collection of identified Hubs is recognised and
fully validated by the configuration seam (`src/config/spoke-declarations.mjs`, the nested `spokeHubs`
form) and then REFUSED: it is never flattened into the flat Spoke collection, no Hub or Spoke is chosen
for it, and nothing consumes it to build. The composite RUNTIME SEGMENT is recorded, not implemented
(`spoke-hub-collection.ts`): one atomic, injective, legacy-safe, case-portable and STABLE segment, with
`runtimeSegmentForSpokeId` keeping its contract exactly.

## What is deliberately NOT here

The domain vocabulary stays pure — and that is what lets the REQUEST BOUNDARY use it: the proxy
consumes the pure hostname decision (`@/config/spoke-routing` → this module) over a routing description
the build inlined, so a request is dispatched THROUGH this decision without a framework type, a request
object or a file ever entering `@/core`.

- no filesystem roots, no `node:*`, no Next.js, no provider concept (`tests/architecture/boundaries.test.ts`);
- no filesystem or routing knowledge in the adapter: it maps authored leaves to `SiteHubAssignment[]`
  and nothing else, and the configuration file itself gained only the optional `sites[].hub` leaf;
- no configuration parse at the boundary: `src/proxy.ts` reads the build's inlined routing description,
  and the decisions here are pure functions of it;
- no asset, page, locale, navigation, business or theme concerns. A `Hub` carries an identity and the
  EXISTING Foundation Sites it owns (`ResolvedSite`, `@/core/site`) — and nothing else.

## Terminology note

Foundation's older prose about an *installation* and its *spokes*
(`@/core/foundation-installation`) describes one website per spoke. Under the vocabulary made
canonical here, that container-of-Sites is the **Hub**, and a **Spoke** is one domain that owns Hubs.
That older prose is intentionally left untouched by this slice; a separate terminology
reconciliation owns it.
