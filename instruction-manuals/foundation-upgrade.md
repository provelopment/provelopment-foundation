# Foundation Upgrade — absorbing a newer Foundation release

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-16.2`
> **Applicable Foundation baseline:** `v2026.09.11-foundation-p6-3c-banner-sidebar-cta`
> **Foundation commit:** `f5c94da`
> **Master authority:** Provelopment root project — `.project/deployment-info/instruction-manuals/`
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## What this manual is for

An adopter project runs on a **committed, vendored Foundation snapshot** recorded
at a specific release tag. When a newer accepted release exists, this procedure
absorbs it **without destroying the adopter's business content, configuration,
branding, or assets**.

> **A newer release is never installed merely because it exists.** The adopter
> stays reproducible at its recorded baseline until an upgrade has been
> deliberately applied, validated, reviewed, and accepted.

**Non-negotiable principle:**

> **Foundation platform code may change; adopter-specific business content,
> branding, configuration, and assets must never be accidentally overwritten.**

## Ownership model — the concept that makes this safe

Every file in an adopter repository falls into exactly one category. Classify
before you touch anything.

### 1. Platform-owned

Foundation implementation, reproduced into the adopter from the vendored
snapshot. The adopter does not own these; they are replaced wholesale on upgrade.

- runtime implementation (`src/**` of the platform snapshot)
- shared shell, components, layouts
- schemas, validators, framework defaults
- platform-owned static assets whose role the Foundation defines
- the platform locale dictionaries that the adopter has not customized

**Upgrade action:** replace from the target release. The adopter's copy must end
up byte-faithful — a fidelity/divergence check enforces this.

### 2. Adopter-owned

Business and site identity. The Foundation must never write here.

- business content (pages, offerings, portfolio, testimonials, legal copy)
- site configuration (`site.config.json`)
- business imagery and artwork
- customer branding decisions
- business-specific copy in the adopter's own locale dictionaries
- per-site documentation

**Upgrade action:** never overwrite. Reconcile only where the target release
changed the contract in a breaking way — and then reconcile deliberately, by
hand, preserving the business intent.

### 3. Platform role with adopter override

The dangerous category: a pathname inside a Foundation-defined asset directory
whose **file has been replaced by the adopter**. The role is the Foundation's; the
artifact is the adopter's.

Typical examples: header logo, footer logo, favicon, page banners, sidebar
toggle assets, navigation-item icons, OpenGraph/social art.

**The two failure modes, both forbidden:**

> **Never blindly overwrite an adopter-owned override** merely because its
> pathname sits inside a Foundation-defined asset directory.

> **Never blindly preserve every old file** and thereby prevent legitimate
> Foundation defaults and new assets from being added or updated.

**Resolution:** replace/preserve **per file, by evidence**, using the asset
reconciliation step below. Record which files are deliberate adopter overrides so
the next upgrade does not have to guess.

## Procedure

`discover → compare → branch → classify → vendor → reconcile → validate → review → accept → record → deploy → verify`

### 1. Establish the adopter baseline

Record, from the adopter's own records (e.g. `platform/SOURCE.md`):

- the Foundation release tag and commit the project currently runs;
- the recorded manual revision;
- the repository, branch, and commit;
- the working-tree state.

### 2. Identify the target Foundation release

List available releases and pick the **accepted** one:

```bash
git ls-remote --tags <foundation-remote> | Select-String 'foundation'
```

Confirm it is the release you intend to adopt (not merely the newest tag).

### 3. Clean-repository requirement

The working tree must be **clean** before you start, so the upgrade diff is
exactly the upgrade. Commit or stash unrelated work. Never begin an upgrade over
unexplained local changes.

### 4. Inventory adopter-specific changes

Diff the adopter's state against its recorded baseline and list everything the
adopter has changed (config, content, dictionaries, assets, docs, tooling).
This inventory is the preservation contract — you will verify against it at the end.

### 5. Classify ownership

Sort that inventory into categories 1–3 above. Anything that genuinely cannot be
classified is escalated before proceeding (do not guess).

### 6. Inspect the Foundation release delta

Understand what changed between the adopter's baseline and the target:

- the full changed-file list (`git diff --stat <old>..<new>`);
- which changes touch the **configuration contract** (schema), **rendered
  behaviour**, **assets**, and **dictionaries**.

### 7. Identify schema / configuration changes

Read the schema diff. For every change decide: **additive/optional** (adopter
config stays valid), or **breaking** (adopter config must be reconciled).

### 8. Identify runtime-asset changes

Compare the platform asset inventory at both refs (`git ls-tree <ref> <assets-dir>`).
Note which asset filenames were **added**, **removed**, or **kept**, and whether any
role was **renamed**. Removed names matter: an adopter file at a removed platform path
may now be an orphan, and a new platform default may need to land.

### 9. Protect adopter-owned material

Before any vendor/copy step, write down the paths that must survive (steps 4–5) and,
where the tooling supports it, make the reproduction step **non-destructive for those
paths**. If the project's vendor/reproduce tooling would overwrite an adopter-owned or
overridden file, fix the tooling **first** — that is a tooling defect, not a reason to
hand-copy. See `troubleshooting.md` → *vendor/setup operation overwrites adopter assets*.

### 10. Acquire / vendor the target release

Fetch the target release **read-only**, compare it against the vendored snapshot, and
only then apply it. Use the project's documented mechanism (a compare-then-apply
upgrade helper is typical). The vendored snapshot must be an exact copy of the
accepted release — not a merge, not a subset.

### 11. Regenerate / reproduce platform-owned site files

Run the project's reproduce step (typically `pnpm setup`) so each site receives the
new platform identity. Then verify the protection from step 9 actually held:

- every adopter-owned or overridden file is **byte-identical to before** (prove it
  with hashes, not by eye);
- **new** platform assets are present;
- the fidelity/divergence check passes.

### 12. Reconcile adopter configuration

Compare the adopter config against the target schema.

- **Additive** changes: usually **no config edit** — verify, do not invent.
- **Breaking** changes: edit by hand, preserving business intent. Never replace the
  adopter's configuration with the platform's example.

### 13. Reconcile adopter assets

Work through category 3 file by file:

| Question | Action |
| --- | --- |
| Adopter override of a role still used? | Keep the override; **record it**. |
| Override of a role the adopter no longer uses? | Retire it, or relocate it to the adopter's business asset area and wire it deliberately. |
| A **new** platform default the adopter needs? | Let it land. |
| Override of a platform asset the release legitimately changed? | Compare both; keep the adopter override unless the platform change is required for correctness, then re-apply the adopter intent. |

Record the outcome (kept / relocated / retired / updated) as part of the upgrade evidence.

### 14. Run the divergence / fidelity check

The adopter's platform-derived source must be byte-faithful to the vendored snapshot,
except for explicitly approved and recorded deviations.

### 15. Typecheck

The configuration and content contracts are typed; this is where a missing or
mis-typed field surfaces. Fix the config/content, never the schema.

### 16. Lint

Style and architecture-boundary enforcement (dependency direction, forbidden imports,
convention).

### 17. Route validation

Every declared route exists; every content file that must parse, parses (frontmatter,
internal links).

### 18. Build

Produce the **real** production build. Never deploy anything that has not built.

### 19. Browser acceptance

Run the project's browser matrix against the production build. At minimum confirm the
release's behavioural contracts that apply to this adopter:

- responsive shell at mobile / tablet / desktop widths;
- sidebar + mobile navigation behaviour and reachability;
- page banners (centred, proportional, no overflow, nothing on pages with no banner);
- header/footer branding and the configured logo/favicon;
- the primary CTA — present **once**, reachable, correctly positioned, not hidden
  inside navigation;
- no horizontal overflow; image alt semantics correct.

### 20. Before / after comparison

Compare against the evidence captured in step 4. **Every difference must be explained**
by the release delta or by an explicit reconciliation decision. An unexplained visual
or behavioural change is a defect — investigate before accepting.

### 21. Deployment

Only after an accepted, validated upgrade. Follow the project's deployment path
(`deployment.md`).

### 22. Live verification

Verify the **deployed** site, not just the local build: expected routes 200, assets
served, **canonical host == configured `site.url`**, HTTPS, favicon, metadata, CTA,
responsive behaviour.

### 23. Baseline / reference update

Record the new release (tag + **exact commit**), the date, the reason, an
upgrade-history row, and the applicable **manual revision** in the adopter's
source-of-record file.

### 24. Documentation update

Update the adopter's own docs in the same task: version references, capability
statements the release changed, troubleshooting entries, and pointers to the
instruction manuals. Obsolete statements must not be left active.

### 25. Final evidence report

Report with evidence: baseline → target; what changed in the platform; what was
**preserved** (with the protection proof); what was reconciled and why; every gate
result; before/after comparison; deployment + live-verification results; the new
recorded baseline; and any deferred item or discovered Foundation deficiency.

## Rollback

1. **Do not merge or deploy** an unvalidated upgrade — validation is the gate.
2. Merged but not deployed: revert the upgrade commit on a `fix/` branch.
3. Deployed and broken: promote the previous known-good deployment (traffic-level
   rollback) first, then revert source. The project stays reproducible at its recorded
   prior baseline throughout — that is why the baseline record matters.

## Never

- Never invent a package/dependency mechanism for the Foundation; adoption is a
  committed vendored snapshot.
- Never "upgrade" by deleting or replacing adopter content, configuration or branding.
- Never overwrite an adopter override just because its pathname is platform-defined —
  and never freeze every old file so legitimate platform defaults can never land.
- Never record a Foundation version you have not actually acquired.
- Never deploy a version you have not validated.
- Never fix a Foundation defect silently inside an adopter upgrade — record it,
  classify it (adopter-specific vs platform-wide), and escalate
  (`agent-operating-rules.md`).
