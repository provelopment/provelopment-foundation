# Validation — what "done" means

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-16.2`
> **Applicable Foundation baseline:** `v2026.09.11-foundation-p6-3c-banner-sidebar-cta`
> **Foundation commit:** `f5c94da`
> **Master authority:** Provelopment root project — `.project/deployment-info/instruction-manuals/`
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
