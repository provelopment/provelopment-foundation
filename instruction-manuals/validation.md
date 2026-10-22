# Validation — what "done" means

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-10-22.1`
> **Content model described:** the **current EFS installation model** — one immutable Foundation release established into one autonomous Installation that owns its authored capsule and serves explicitly declared Entities, Facets, Sites, Pages and localized representations through publication bindings owned by declared Spokes. Pages are language-neutral; each localized representation is a JSON or Markdown source; JSON visibility is per representation; `unlisted` means reachable but not advertised, never private. Update changes authored material; Upgrade adopts a different immutable release. Legacy country-coded Sites, regional pages, Location routing and computed timezone/DST behavior are historical only.
> **Procedure validation:** the release and establishment procedures retain their 2026-09-30 end-to-end baseline. Revision `2026-10-22.1` reconciles the distributed model to the merged EFS runtime and the A1-R2F receiver-key isolation, reference and hygiene correction, and the A1-R2F-C1 injective identified-Hub receiver-key correction, and is verified by the Foundation unit, integration, architecture, deployment and browser gates recorded in `FOUNDATION-COMPLETE-A1-R2F` (including its C1 correction record); no release tag is claimed by this revision.
> **Adopter baseline:** the installation's own adoption record — `deployment/foundation-baseline.json` inside the installation's capsule. An adopter's own governance record is the adopter's; it is never the Foundation's adoption record.
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed** and byte-identical to the master revision above — SHA-256
> verified at propagation — and is never edited in place: edit the master upstream and
> propagate.

## The rule

> **A check not run cannot be reported as passed.**

Never claim completion with a red gate, and never claim a gate you did not execute.
If Chrome (or any dependency) is unavailable, say exactly which check could not run
and why — that is an honest report; a fabricated green is not.

## Start from a clean repository

Validation is meaningful only if the tree state is understood:

```bash
git status          # must be clean, or you must know exactly what is uncommitted
git rev-parse --show-toplevel
git remote -v
git branch --show-current
```

Commit or stash unrelated work first. An unexplained dirty tree makes every result
ambiguous.

## The gates, by ownership

There is no single gate. Which commands are yours depends on **what you own**, and a check run
in the wrong context proves nothing about the thing you changed.

> **A check not run cannot be reported as passed** — and neither can a check run somewhere else.
> Report the context you ran, and the context you did not.

### Foundation project / repository (the maintainer gate)

For the public Foundation product itself, and for a repository-shaped project built from it:

```bash
pnpm assets:check          # runtime asset mirror, provenance and drift
pnpm country-codes:check   # the maintained country-code reference is consistent
pnpm exec tsc --noEmit     # configuration and content contracts
pnpm lint                  # style and architecture-boundary rules
pnpm test                  # the combined repository suite (both projects)
pnpm build                 # the real production build
pnpm test:browser          # browser/accessibility matrix against production builds
```

Add `pnpm release:classify` before a release (every tracked path must be classified), and
`pnpm release:build` / `pnpm release:verify` when release provenance is the subject.

### An independent Foundation installation (the installation gate)

Inside an installation — one immutable release established into its own root, with its own
authored capsule — the acceptance suite is the installation's own:

```bash
pnpm install --frozen-lockfile    # the installation's resolved dependency tree
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm assets:check
pnpm country-codes:check
pnpm test:deployment              # the deployment's own acceptance tests
pnpm test:browser:deployment      # where browser acceptance is required
```

`pnpm test:foundation` is **repository-owned**, not installation-owned, and must never be
reported as an installation acceptance gate: some of its suites describe the Foundation
PROJECT's own repository — its Git history, its release tags and its tracked inventory — so they
are informative rather than conclusive where the installation is a different repository. Use the
installation-owned list above.

### A deployment / spoke authoring change

A page, dictionary, configuration or artwork change is validated **in the scope it touches** —
test scope follows change ownership:

```bash
pnpm exec tsc --noEmit        # the change still type-checks
pnpm lint
pnpm assets:check             # if artwork or a runtime asset role changed
pnpm country-codes:check      # if a site or locale code changed
pnpm test:deployment          # the deployment's own acceptance tests
pnpm build
pnpm test:browser:deployment  # where browser acceptance is required
```

Do not run the whole repository-maintainer suite merely because a page changed, and do not treat
a green deployment build as evidence about the platform it runs.

### 1. Asset integrity and the country-code reference

`pnpm assets:check` proves the runtime asset mirror and its provenance records agree with the
source artwork the project ships, and names any file that is missing, unreferenced or stale — see
`branding-and-assets.md`. A runtime asset role that renders nothing, or the wrong file, is this
check's business.

`pnpm country-codes:check` proves the maintained **legacy** country-code reference is internally
consistent. EFS does not use country codes as Site identities; an EFS publication prefix such as
`ww` or `de` is authored path data, not a country claim. A failing check is a legacy-fixture or
generated-reference defect, not an EFS ownership rule.

### 2. Typecheck

Proves the configuration and content contracts are well-typed. This is where a
missing, renamed or mis-typed configuration field surfaces.

### 3. Lint

Proves style and architecture-boundary rules hold (dependency direction, forbidden
imports, convention).

### 4. Route validation

Proves every declared route exists and every content file that must parse, parses —
including Markdown frontmatter, **every JSON page document validated against the page
schema (an undeclared section type, property or presentation option fails by name and
property path)** and internal link targets.

### 5. Build

Produces the real production build. Never deploy anything that has not built.

### 6. Browser / accessibility matrix

Runs a real browser against the production build and asserts the rendered contracts:

- responsive shell at mobile / tablet / desktop widths;
- navigation behaviour (sidebar, mobile menu/overlay) and reachability;
- page banners (centred, proportional, no overflow, nothing on pages with no banner);
- header/footer branding and configured logo/favicon;
- the primary CTA — present **once**, reachable, correctly positioned, not hidden
  inside navigation;
- no horizontal overflow at any tested width;
- image semantics (meaningful alt present; decorative images marked decorative);
- no unintended selector controls where the project's contract forbids them.

**Accessibility and responsiveness are acceptance criteria**, not polish: a
responsive or accessibility regression fails the task.

### 7. Live verification

After deployment, verify production — not only the local build. See `deployment.md`.

## Classifying a failure

Before retrying anything, identify which class of failure you have:

| Class | Signature | Action |
| --- | --- | --- |
| **Implementation failure** | typecheck/lint/build error, missing route, wrong rendered output | Fix the implementation. Do not touch the test to make it pass. |
| **Test failure** | the assertion is wrong, or the harness is mis-modelled | Fix the test **only if** the expected contract is genuinely mis-stated — and say so explicitly. |
| **Configuration/content failure** | schema rejection, missing key, unreferenced asset | Fix the adopter-owned config/content. |
| **Deployment failure** | build is green locally but production is wrong | Diagnose the deployment/provider/domain layer. |
| **Infrastructure flake** | browser did not start, port/timing contention, transient network | **Investigate first.** Re-run only after you can name the cause; record flake evidence (e.g. the exact error and that other suites passed). |

> Do not normalise "re-run until green". A flake that is never explained is an
> unmeasured risk. Record it — a repeat flake is a defect.

## Evidence to report

For every completed task, report:

- each gate, and its actual result (with counts where the tool provides them);
- anything **not** run, and why;
- pre-existing failures (if any) distinguished from ones you caused;
- the before/after comparison for behavioural changes.

## Common mistakes

- Reporting "tests pass" when only some suites were executed.
- Silencing a failing assertion instead of fixing the underlying defect.
- Claiming a green build when the build was skipped because it was "only docs".
- Rerunning a flaky suite without recording it.
- Validating on a dirty tree and attributing someone else's breakage to the change.

## Clean-clone acceptance (the adopter's gate)

The repository gate proves the *working tree* is healthy. It does not prove that a
**fresh clone by someone who has nothing else** is healthy - which is the only test
that matters to an external user. Run it after every change that touches the shipped
tree, and always before releasing a template:

1. Clone the released ref into a directory **outside** the working workspace. (For an
   **installation**, establish a disposable one instead and prove that — `adoption.md`.)
2. `pnpm install --frozen-lockfile`, then run the gate that belongs to what you are proving: the
   maintainer gate for a clone of the product, the installation gate for an installation.
3. Start the documented quick start and confirm the site renders.
4. Assert the stand-alone properties: one default locale, only the intended starter
   content, no upstream identity, no live domain in configuration, and **no
   dependency on directories that only exist in the maintainer workspace**.
5. Delete the clone.

**A hidden-dependency class this catches (FS1, 2026-09-17):** a working tree can
contain **empty directories** (for example `content/`, recreated by a test fixture)
that Git cannot track. Anything that scans such a directory then passes locally and
fails in CI and in every fresh clone with `ENOENT`. Treat an absent scanned directory
as nothing to scan - never as an error.

### Test responsibility, by owner

| Suite | Owner | Question it answers |
| --- | --- | --- |
| Repository-owned Foundation tests (`pnpm test:foundation`, `pnpm test:browser:foundation`) | the product | does the **reusable architecture** work? |
| Deployment tests (`pnpm test:deployment`, `pnpm test:browser:deployment`) | the deployment | does **this deployment** satisfy its own acceptance? |
| Site assertions (routes, brand identity, activated artwork) | the site owner | does **this site** still look and behave as accepted? |

Some repository-owned Foundation suites depend on Git history and on tracked-repository state, so
inside an installation they are **informative rather than installation-owned acceptance checks**.
That is a known limitation, not a failure of the installation: prove an installation with
`pnpm test:deployment`, and `pnpm test:browser:deployment` where browser acceptance is required.

Site-specific assertions (real content routes, brand identity, activated artwork)
belong to the site, never to the product; capability assertions belong to the product
and are never duplicated per site.
