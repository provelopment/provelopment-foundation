# FOUNDATION-EFS-SHARED-HOST-REMEDIATION-A1 — implementation report

**Work order:** `FOUNDATION-EFS-SHARED-HOST-REMEDIATION-A1`
**Repository:** `provelopment/provelopment-foundation`
**Branch:** `fix/efs-shared-host-publication-ownership-a1`
**Status:** **PARTIAL** — the correction is implemented and green, but one architectural
gate is deliberately unresolved (a deterministic host root entry), and acceptance, merge,
release and downstream adoption have not happened.

> This is a Foundation-local **execution record** for review. It is not the canonical
> root-governance report and it records no accepted decision.

---

## 1. Identities

| | |
| --- | --- |
| Released baseline (Foundation `main`) | `65f26e8f51f96c40a1a58e1e13f3a25efcfd372c` |
| Baseline tree | `e2ee226c13bdbb730c9a96d23e128e58c7b25d69` |
| Baseline tag | `provelopment-foundation-v20261024.0539` |
| Branch head at report authoring | `81780bce945daa76f570b8b196fb50f4743f0506` |
| Head tree | `2776f6af52f7031386d965b6cfc5cc36861da05e` |

The branch is parented directly on the released baseline: the correction is a single,
reviewable change set rather than a long-lived divergence.

**This report describes three commits.** §11 records why a second and third were necessary:
re-running the full gate on the committed tree exposed a genuine architecture-guard failure
that earlier partial runs had not, and that failure was fixed rather than explained away.
The exact head and tree this report describes are listed in the PR description and in the
final section, because a report that quotes an older head as current is a defect.

---

## 2. The defect

A hostname authored in a Spoke's `site.url` was treated as an **exclusive Spoke property**.
An Installation in which several Spokes publish disjoint path prefixes of ONE host therefore
could not be composed at all.

Reproduced first-hand on the unchanged baseline with a synthetic Installation of two identified
Spoke Hubs, five Spokes, five Entities, one hostname and five prefixes: **9 of 9 acceptance
tests failed**, all through the same refusal, raised by composition rather than by any request:

```text
Invalid Installation Spoke Hub collection (…/spokes.json):
  - Spoke Hub "main": hostname "shared.example.test" is claimed by more than one Spoke
    (main-site, pbs, templates): one host can belong to only one Spoke
  - hostname "shared.example.test" is claimed in more than one Spoke Hub …
```

**Why this was a defect and not a safety property.** `D31` already makes the explicit EFS
publication binding — `host` plus a whole-segment `prefix` — the authority for a public address.
The shipped manuals state the capability in plain language: *"Different Spokes may share one host
with disjoint prefixes."* The code contradicted both. The refusal was also placed at
**composition**, so it rejected an Installation whose authored public addresses were entirely
unambiguous; no request was ever in doubt.

---

## 3. The corrected architecture

A hostname is now **classified**, once, in the pure domain (`@/core/spoke`):

| Class | Claimants | Hostname dispatch | Publication authority |
| --- | --- | --- | --- |
| **EXCLUSIVE** | exactly one Spoke | selects that Spoke (unchanged) | a publication owned by another Spoke is still refused (`host-is-claimed-by-another-spoke`) |
| **SHARED** | more than one Spoke | selects **nothing** | only a validated binding decides the owner |
| **UNKNOWN** | none | selects nothing | a binding may introduce the host (unchanged) |

`sharedHostnames` / `sharedHostnamesIn` are the ONE classifier; nothing downstream forms a
second opinion.

The important property is preserved rather than removed: **the ambiguity refusal moved from
composition to dispatch.** `hostname → Spoke` remains total, no request is ever settled by
declaration order (first-match resolution is still forbidden), a repeated claim by the *same*
Spoke is still a declaration defect, and genuine collision detection stays in `bindingIssues`
untouched.

---

## 4. How a request is resolved

For `host + pathname`:

1. **Hostname dispatch** answers only for an EXCLUSIVE host. A SHARED host answers nothing,
   deliberately, so no owner is inferred.
2. **The EFS publication binding** decides the owner: the longest whole-segment prefix that
   matches the pathname, on the exact normalized host.
3. **Entity ownership** is the binding's. A publication owned by another Spoke may not serve an
   EXCLUSIVE host; on a SHARED host the binding is authoritative by construction.
4. **The asset namespace** follows the same reasoning. An EXCLUSIVE host keeps the host-bound
   rule. On a SHARED host the host names no owner, so the Spoke namespace is answered by the
   PATH segment the Installation declares.

A near-miss prefix (`/pbsx`), an unknown prefix, an unknown host and an escaping asset path all
refuse; they are proven negatives, not incidental behaviour.

---

## 5. Changed-file inventory

| Path | Change |
| --- | --- |
| `src/core/spoke/coherence.ts` | the classifier (`sharedHostnames`, `sharedHostnamesIn`); a shared host stops being reported as a defect while a duplicate claim by ONE Spoke still is |
| `src/core/spoke/spoke-hub-collection.ts` | collection composition stops refusing a shared host; Hub-level duplication still refused |
| `src/core/spoke/resolve.ts` | hostname dispatch answers for exactly ONE claimant, and `null` for a shared host instead of resolving by order |
| `src/core/spoke/index.ts` | exports the classifier |
| `src/core/spoke/README.md` | documents the classification in the core's own vocabulary |
| `src/config/efs/owner.ts` | the host conflict check fires only on an EXCLUSIVE claim by another Spoke |
| `src/config/spoke-routing.ts` | `routingClaimantsForHost`, `isSharedHostInRouting`; path-answered asset namespace on a shared host |
| `src/proxy.ts` | routes the shared-host asset namespace by path |
| `src/app/[site]/[locale]/opengraph-image.tsx` | an unanswerable host yields a 404, not a 500 |
| `ARCHITECTURE.md` | the routing section states the classification |
| `tests/integration/efs-shared-host-publication.test.ts` | 14 acceptance tests (new) |
| `tests/support/shared-host-installation.mjs` | the ONE fixture authority for the five-Spoke / two-Hub shared-host Installation (new) |
| `tests/unit/spoke-hub.test.ts` | shared-host composition expectations |
| `tests/unit/spoke-hub-identity.test.ts` | identity expectations for multiple claimants |
| `tests/unit/spoke-composition.test.ts` | composition expectations |
| `tests/unit/spoke-multi-hub-runtime.test.ts` | runtime expectations |
| `tests/architecture/write-ownership-guard.test.ts` | classifies the new test scratch writer (§11) |
| `.github/agent-reports/FOUNDATION-EFS-SHARED-HOST-REMEDIATION-A1.md` | this report |

**No authored deployment content was modified.** The reference Spokes (`deployment/spokes/foundation`,
`deployment/spokes/germany`) are untouched; the reference capsule's authored state is verified
unchanged by the suite's own manifest (`152 authored file(s) verified`) on every run.

**Release classification of this report.** `.github/**` is rule #1 of
`scripts/release/release-content-policy.mjs` and is `excluded`, and precedence is
*first match wins*. Verified against the real classifier rather than assumed:

```text
classifyReleasePath(".github/agent-reports/FOUNDATION-EFS-SHARED-HOST-REMEDIATION-A1.md")
  → { inclusion: "excluded", ruleId: "exclude-repository-automation" }
```

So this report cannot enter a Foundation release payload. `tests/architecture/release-content-boundary.test.ts`
asserts properties (no unclassified path; `.github/workflows/ci.yml` excluded **where it exists**),
not an exact inventory, so the new path is consistent with it.

Two consequences the reviewer should know:

- `.github/` is a `SHARED_DIRECTORY` for `scripts/ci/change-scope.mjs`, so this PR routes to the
  **`full`** gate. That is the correct classification for a shared runtime change anyway.
- the report is deliberately **public-safe**: no private governance documents, no customer data,
  no credentials, no local filesystem paths.

---

## 6. Isolation proof

The fixture deliberately makes every member **share the same coordinates** — same page route
(`about`), same Site code (`main`), same locale (`en-001`), same asset path
(`assets/brand/logo.svg`) — so an isolation defect cannot hide behind a differing path. Only the
authored material and the Entity differ.

Proved:

- five prefixes of one host each serve **their own** content, metadata, owner asset and canonical URL;
- **one** sitemap and **one** robots origin for the host, not one per publication;
- a publication owned by another Spoke cannot serve an EXCLUSIVE host;
- cross-Hub (two Hubs) and cross-Spoke (five Spokes) isolation both hold;
- many-to-many Spoke↔Entity publication composes;
- composite Spoke identity resolves to the owning Hub *and* member Spoke;
- contact provenance and trusted request context follow the resolved Spoke, not the host;
- dictionaries resolve per publication, and a missing translation falls back to the default locale.

---

## 7. What is preserved

- The single catch-all route, the `/<site>/<locale>/<route>` grammar and `src/proxy.ts` negotiation are unchanged.
- `bindingIssues` is untouched: real collisions are still refused.
- An EXCLUSIVE host behaves exactly as before, including the cross-Spoke refusal.
- A single-Spoke Installation and the legacy implicit installation are unchanged.
- `GET /` on a host whose bindings are all prefix-scoped is **still refused** — no homepage is invented (§9).

---

## 8. Shared-host acceptance results

`tests/integration/efs-shared-host-publication.test.ts` — **14 tests, all passing**, covering:

1. composition succeeds for five Spokes / two Hubs / five prefixes of one host;
2. each prefix serves its own content;
3. each prefix serves its own metadata;
4. each prefix serves its own canonical URL;
5. each prefix serves its own owner asset;
6. one sitemap for the host;
7. one robots origin for the host;
8. cross-Hub isolation (the two `tenants` members do not leak into `main`);
9. cross-Spoke isolation inside one Hub;
10. a near-miss prefix (`/pbsx`) is refused;
11. an unknown prefix on the shared host is refused;
12. an unknown host is refused;
13. a foreign / escaping asset path is refused;
14. no root entry is invented — `GET /` refuses.

---

## 9. Open architectural decisions (NOT decided here)

### 9.1 A deterministic root entry on an all-prefix host

`GET /` names no binding on a host whose publications are all prefix-scoped, so it is refused.
`bindingIssues` forbids mixing a `prefix: []` binding with prefix-scoped bindings, so the current
schema cannot express an explicit root entry.

Any mechanism is a **new authored contract** and therefore needs an owner decision before code.
The candidate shape documented (not implemented): an optional `rootEntry` selector on ONE
canonical binding of the host, **root-only** (answers `GET /` and nothing else), validated
fail-closed (at most one per host; must name an eligible Site, a supported locale and a declared
Page; must sit on a canonical binding), consumed where `GET /` currently refuses, reusing the
existing entry redirect.

Rejected, each for a stated reason: a `prefix: []` catch-all beside prefixes (it *is* a
catch-all); order-based selection and shortest-prefix selection (both make authored order an
implicit routing rule); a wildcard.

**This is the gate that makes the work order PARTIAL.**

### 9.2 Which publication brands a refusal on a shared host

A shared host's refusal renders the framework default 404 with one logged diagnostic. Status,
isolation and the absence of an owner are all correct; *whose* dictionary, brand and "return home"
link a refusal should use is a presentation policy the architecture does not state.

---

## 10. Reference-site, browser and production evidence

**Browser matrix — green.** `pnpm test:browser`, the full harness across both ownership scopes:

```text
header-identity    10407/10407 checks passed
hub-switcher         254/254
multi-hub            219/219
multihost            105/105
parity-chrome         64/64
required-location     29/29
unlisted-visibility   23/23
TOTAL=12550 PASSED=12550 FAILED=0
```

**Reference Spokes preserved.** `pnpm test` includes the capsule's own deployment project
(16 files), all passing, and the run reports the authored production state unchanged
(`152 file(s) verified`) — the Foundation and Germany Spokes were read, never written.

**Production build and production serving.** `next build` succeeds, and the built output really
serves through `next start`:

| Request | Result |
| --- | --- |
| `Host: foundation-template.provelopment.com` → `/ww/en` | **200** |
| `/robots.txt` | **200** |
| `Host: localhost` → `/ww/en` | 404 (no Spoke claims `localhost`) |

**One observed failure, diagnosed — see §14.**

---

## 11. Local verification (exact commands)

Run on the final tree, in the repository, using the repository's own scripts:

| Command | Result |
| --- | --- |
| `pnpm assets:check` | **PASS** — 109 files, 0 drifted, 0 absent, every runtime file byte-identical |
| `pnpm exec tsc --noEmit` | **PASS** (exit 0) |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm test` (all projects) | **PASS** — 209 files, **2753 passed, 1 skipped**, exit 0 |
| `pnpm test:deployment` | **PASS** — 16 files |
| `pnpm build` | **PASS** (exit 0) |
| `pnpm test:browser` | **PASS** — 12550/12550 |
| `pnpm release:classify` | **PASS** — every tracked path classified |

`pnpm test` is the CI-equivalent (`vitest run` across every project), so the foundation and
deployment results above are the same run the `full` route performs.

### 11.1 The guard failure this gate caught (and why the tree changed)

The work order asks for a full-gate change, and this is exactly why. Re-running the suite on the
**committed** tree produced **one failing test**, where earlier partial runs had been green:

```text
FAIL tests/architecture/write-ownership-guard.test.ts
  > the executable writer inventory is explicit
  > lists exactly the writers that exist — a new one must be classified before it can merge
  expected 81 to deeply equal 80

+ "tests/support/shared-host-installation.mjs"
```

The guard was **right**. The new fixture module is an executable filesystem writer and was not
classified, and `AGENTS.md` §27 requires precisely this: a new writer must be classified, with the
ONE domain it owns, before it can merge.

It was fixed by classification, not by weakening the guard. The module writes **only** inside the
root it creates (`mkdtempSync(tmpdir()/foundation-shared-host-`) or is given, and removes it in
`cleanup()`; no deployment, fixture or `public/**` tree is ever written. Its entry in
`TEST_SCRATCH_WRITERS` states that domain, in the same form as the already-sanctioned
`four-spoke-installation.mjs`.

**Correction to an earlier claim.** A previous status message reported the foundation suite as
fully green and reported `test:browser` as environmentally blocked (no access to
`fonts.gstatic.com`). Both were wrong for this tree: the browser suite runs and passes here
(`12550/12550`), and the suite was **not** fully green until this guard fix. The earlier claim is
withdrawn; the numbers in this section are the ones measured on the final tree.

---

## 12. CI

CI is the authoritative gate for the exact head and runs the `full` route for this change
(shared runtime code plus `.github/**`).

### 12.1 Result for head `87d3cfaba9325cbecdfb8015d6f6280afc464346`

Run: https://github.com/provelopment/provelopment-foundation/actions/runs/40483093547

| Job / check | Status |
| --- | --- |
| `classify` | success — selected route **`full`** |
| `full` | **success** |
| `documentation` / `content` / `deployment` / `foundation` | skipped (by ownership) |
| **`validate`** (the one required status context on `main`) | **success** |

The classifier independently confirmed the `full` route: `src/**` is Foundation-owned, but
`.github/**` is a shared surface, and a mixed change broadens validation rather than narrowing it.
The `validate` job ran the `.temp` tracking guard and evaluated the routed result — it passed.

CI and the local gate agree. Where the two could diverge (browser execution, platform differences),
this report records the CI outcome as authoritative.

This section describes head `87d3cfa` only. Any later commit on this branch — including a
documentation-only one — has its own result, and quoting the result above for a different tree
would be exactly the error this section exists to prevent.

---

## 13. Risks and assumptions

| Risk / assumption | Position |
| --- | --- |
| Shared-host dispatch could drift toward "first published wins" | forbidden by design: a shared host answers nothing, and the unknown-prefix negative guards it |
| A future schema change could make a shared host a *declaration* defect again | the classifier lives once in `@/core/spoke`; `coherence.ts` owns the refusal and its unit tests pin both directions |
| Path-answered asset namespaces on a shared host | the segment is one the Installation declares; an escaping or foreign path is a proven negative |
| A shared host has no branded refusal surface | known and recorded (§9.2) — presentation policy, not isolation |
| `GET /` has no deterministic entry on an all-prefix host | known and recorded (§9.1); deliberately not invented |
| The browser suite may be environment-sensitive | it ran fully green here; CI re-proves it for the exact head |

---

## 14. Observed defect outside this work order's scope

`node tests/browser/production-continuity.mjs` reports **2 of 3 rows passing**:

```text
PASS  production.buildSucceeded                       — next build exit=0
PASS  production.contract.declaresControlOpenNameHook — attribute=data-ui-sidebar-toggle-name-open
FAIL  production.servingProductionOutput              — http://localhost:4535/ww/en
PRODUCTION-CONTINUITY-TOTAL=3 PASSED=2 FAILED=1
```

Diagnosis, not a workaround: the script probes `http://localhost:<random port>/ww/en` with no host
override, and `waitForServer` requires a 2xx/3xx, so a 404 becomes a 300 s timeout. `localhost` is
claimed by **no** Spoke in the reference deployment, and the reference EFS manifest publishes no
`localhost` binding — so hostname dispatch and publication both correctly decline it.

This is **not a serving defect**, proved by serving the same build myself:

- `Host: foundation-template.provelopment.com` → `/ww/en` = **200**
- `/robots.txt` = **200**
- `Host: localhost` → `/ww/en` = 404

The unknown-host path in `resolve.ts` is **unchanged** by this diff (both before and after return
`null`), so this failure is not attributable to the correction on the evidence available. The
script is explicitly *not part of any CI route*.

**Unresolved:** whether this script passed on the released baseline. Establishing that would need a
second, separately built baseline tree, which this work order did not authorize, so it is reported
rather than guessed. It deserves the owner's attention as a harness/deployment-configuration
question — what host should a production-mode proof use? — independent of A1.

---

## 15. Next required actions and approvals

1. **Chief Architect review** of this branch, its diff, this report and the exact head's CI.
2. **Owner decisions** on the two open contracts (§9.1 root entry, §9.2 refusal surface).
3. **Owner authorization** for integration: draft PR → accepted → squash merge.
4. **Separately authorized release** — an immutable `provelopment-foundation-vYYYYMMDD.HHMM` tag
   from the accepted merge commit, never reused, deleted or repointed.
5. **Separately authorized downstream adoption** — MY1 must not begin multi-Hub implementation on
   this branch; adoption is its own work order with an exact release pin and preservation tests.
6. Root governance updates (§16) require a **separately authorized** action.

No merge, release, adoption, provider or DNS action has been taken.

---

## 16. Proposed governance updates (proposals only — NOT installed)

Recorded for the authorized governance owner. **None is applied**, and the private root documents
are deliberately not reproduced in this public repository:

| Surface | Proposal |
| --- | --- |
| active WIP | record A1 as PARTIAL at the root-entry gate, with the exact branch/commit/tree |
| work register | a root-entry-policy item (decision-shaped) and a shared-host refusal-surface item (low, later) |
| decisions | a **candidate** decision for the EXCLUSIVE / SHARED / UNKNOWN classification; an **open** decision request for the root-entry contract |
| terminology | EXCLUSIVE hostname · SHARED host · UNKNOWN host, explicitly distinct from Spoke Hub / Site Hub |
| issue record | shared-host publication ownership stays **OPEN**: retire only after an accepted release **and** independent downstream adoption |
| MY1 blueprint | prerequisite status must read "locally corrected, NOT released, NOT adopted" |

---

**End of report. Status: PARTIAL. Nothing here is an accepted decision.**
