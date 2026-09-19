# Validation — what "done" means

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-19.1`
> **Procedure validated against:** Foundation template release `v2026.09.17-foundation-generic-template` (`b9f7a18`) + the current public/private topology (the public reusable product `provelopment-foundation`, and the live Foundation site implemented as a site profile in the private downstream `provelopment-web`)
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

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

## The gate (run in order)

```bash
pnpm validate        # fidelity → typecheck → lint → routes → build
pnpm test:browser    # browser/accessibility matrix against production builds
```

### 1. Fidelity / divergence check

Proves the platform-derived source is byte-faithful to the vendored Foundation
snapshot, except for explicitly approved and recorded deviations.

- Failure means either the platform copy drifted, or a deviation was not recorded.
- **An unapproved divergence is a failure, not a warning.**

### 2. Typecheck

Proves the configuration and content contracts are well-typed. This is where a
missing, renamed or mis-typed configuration field surfaces.

### 3. Lint

Proves style and architecture-boundary rules hold (dependency direction, forbidden
imports, convention).

### 4. Route validation

Proves every declared route exists and every content file that must parse, parses —
including frontmatter and internal link targets.

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

1. Clone the released ref into a directory **outside** the working workspace.
2. `pnpm install`, then run the repository's whole gate in that clone.
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

### Template vs adopter test responsibility

| Suite | Owner | Question it answers |
| --- | --- | --- |
| Template tests | the product | does the **reusable architecture** work? |
| Site tests | the site owner | does **this site** still look and behave as accepted? |
| Adopter tests | each adopter | does **this deployment** satisfy its own acceptance? |

Site-specific assertions (real content routes, brand identity, activated artwork)
belong to the site, never to the product; capability assertions belong to the product
and are never duplicated per site.