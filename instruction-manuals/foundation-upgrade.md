# Foundation Upgrade — absorbing a newer Foundation release

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-17.3`
> **Procedure validated against:** Foundation template release `v2026.09.17-foundation-generic-template` (`b9f7a18`) + the FS1 repository split (public template / private reference site)
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
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

## One platform, several adopters (shared-architecture sequencing)

Some repositories host **several adopters that intentionally share one Foundation-derived
platform** — typically one vendored `platform/` snapshot reproduced into several sites by a
single reproduce step, with a fidelity check proving each site's platform-owned source is
byte-faithful to it.

**When that is the architecture, keep it.** Do **not** split it into one platform per adopter
merely to upgrade them "independently":

- the upgrade is applied **once**, to the shared platform;
- **one pilot adopter** is reconciled, proven and validated **first**;
- the remaining adopters are then reconciled and validated **sequentially** against the same
  upgraded platform.

"One at a time" describes the **validation sequence, not the architecture**. A separate
platform copy per adopter multiplies the maintenance surface — and the fidelity check that
makes the shared model safe stops meaning anything.

The pilot is what turns an upgrade into repeatable knowledge: one adopter is reconciled with
full attention, its preservation proven by hash, and what that run teaches is folded back into
this manual **before** the remaining adopters are touched.

```text
select target → compare → branch → apply once to the SHARED platform
      → reconcile + validate the pilot adopter      (its own build must pass)
      → reconcile + validate the remaining adopters (same platform, sequentially)
      → full repository gate → deploy → verify live
```

A useful property of the pilot step: an adopter that is not yet reconciled **fails loudly and
specifically** — a strict schema rejects a retired key at build time and names it. The pilot's
success and the other adopters' open work are therefore distinguishable in a single run, and a
shared-platform upgrade is never blocked simply because one adopter's business layer still
needs reconciling.

## Procedure

`discover → compare → branch → classify → vendor → reconcile → validate → review → accept → record → deploy → verify`

### 1. Establish the adopter baseline

Record, from the adopter's own records (e.g. `platform/SOURCE.md`):

- the Foundation release tag and commit the project currently runs;
- the recorded manual revision;
- the repository, branch, and commit;
- the working-tree state.

### 2. Identify the target and pin it to an immutable ref

List available releases and pick the **accepted** one. Each command is in the shell
it actually belongs to — the pipe syntax is **not** interchangeable:

```powershell
# PowerShell (Windows)
git ls-remote --tags <foundation-remote> | Select-String 'foundation'
```

```bash
# bash / zsh (macOS, Linux)
git ls-remote --tags <foundation-remote> | grep foundation
```

Confirm it is the release you intend to adopt — not merely the newest tag.

**The target must be immutable.** Prefer, in order:

1. an accepted **release tag**;
2. the **exact 40-character commit SHA** of the accepted state, when no tag covers it.

Never record a moving branch name (`main`) as the target: the snapshot would then
not be reproducible. Record the commit for a tag as well — a tag can be re-pointed,
a commit cannot.

A vendoring helper that only supports `git clone --branch <ref>` cannot fetch a
commit. Fetch the exact commit like this (verified; GitHub serves **full** SHAs but
**not** abbreviations):

```bash
git init <work-dir> && cd <work-dir>
git remote add origin <foundation-remote>
git fetch --depth 1 origin <full-40-char-sha>
git checkout --detach FETCH_HEAD
```

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
upgrade helper is typical). Run **compare** first, and review the real file-level result —
added / modified / **deleted** per tree, plus the impact on each adopter — before any write.

- **Never run compare and apply concurrently.** Both use one working directory, so running
  them in parallel corrupts the comparison.
- **Upstream deletions are part of the delta.** A release that retires a feature *removes*
  files (a preset module, its component, a retired asset role). The snapshot must end up with
  exactly the target's file set: one that keeps a deleted file is not a copy of the release,
  and the fidelity check will fail on it.
- **Some paths are deliberately not auto-copied** by a vendoring helper — typically the
  *canonical baseline* copies of the platform's own `content/` and `site.config.json`. The
  compare output must still report them, and step 10a refreshes them by hand.
- The vendored snapshot must be an exact copy of the accepted release — not a merge, not a
  subset.

### 10a. Prove the snapshot is byte-faithful before going further

Re-run **compare** immediately after applying. For every vendored tree the result must be
**zero** added / modified / deleted. Anything else means the snapshot is not the release you
recorded — and the baseline record, and every later claim that depends on it, would be untrue.
Only a clean comparison means the target is genuinely acquired.

### 11. Regenerate / reproduce platform-owned site files — pilot first

Run the project's reproduce step (typically `pnpm setup`) so each site receives the
new platform identity. On a shared platform, reconcile and validate the **pilot adopter**
first; do not treat the other adopters as a second source of truth in the meantime.

Then verify the protection from step 9 actually held:

- every adopter-owned or overridden file is **byte-identical to before** (prove it
  with hashes, not by eye);
- **new** platform assets are present;
- a platform asset the release **deleted** is gone from the sites too, or is explicitly and
  deliberately kept (a reproduce step should report such files, never silently delete a
  business asset);
- the fidelity/divergence check passes.

#### The asset-classification trap (read this before the reproduce step)

Ownership of an asset role is decided by comparing the site's file with the **platform
snapshot that was current when the adopter last reconciled** — the *pre-upgrade* snapshot.

**The re-vendor destroys that reference.** Once the platform has been replaced, a reproduce
step that compares site files with the *new* platform sees a platform role the release
**re-drew** as "the site differs from the platform" and therefore reports it as a
**preserved adopter override**. The site then silently keeps the **stale platform art**.

So:

1. Before applying, run the compare step and **record which site asset files are faithful
   copies and which are genuine adopter overrides.** That list is the authority.
2. After the reproduce step, if it reports a file from the *faithful* list as a "preserved
   override", that is this trap: refresh those files from the new platform snapshot so the
   release's art actually lands. Genuine adopter artwork is never in the faithful list, so
   this recovery step cannot touch it.
3. Record the outcome per file: kept / refreshed / relocated / retired.

Skipping this leaves a project that believes it is at the new release while rendering the old
release's default graphics — invisible to tests, because nothing is broken, only stale.

#### Then the remaining adopters, one at a time

Once the pilot's own build is green and its preservation is proven, reconcile the remaining
adopters **sequentially** against the same platform. Reconcile only what the shared upgrade
genuinely broke in their business layer — never revert the shared platform for one adopter, and
never give one adopter its own platform copy. Prove each adopter's business layer survived
before moving to the next.

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
| A **faithful copy** (not an override) of a role the release re-drew? | Refresh it from the new snapshot — it is platform art the adopter never claimed. See the asset-classification trap in step 11. |
| A role the release **deleted**, still present in a site? | Decide deliberately: retire it when it is stale platform art with no remaining reference; relocate and re-wire it when it is genuine business artwork. Never leave it undecided — an unreferenced stale asset is how "the upgrade looks done" diverges from "the upgrade is done". |

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

Record the new release in the adopter's source-of-record file: the **exact commit**, the tag
if one covers it, the date, the reason, an upgrade-history row, the applicable **manual
revision**, and — on a shared platform — that every adopter consumes this one upgraded
snapshot.

Also record the **rollback point** (the pre-upgrade commit and its tag) and keep it until
acceptance is complete. Then create the immutable **acceptance tag** for the completed upgrade
state, so the accepted state is as reproducible as the baseline it replaced.

Do not leave the previous release's metadata in place: a stale commit hash in the
source-of-record is a false baseline claim, and the next upgrade will diff against a state the
project is not actually running.

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

**Keep the rollback point until acceptance is complete**, and never delete it as "cleanup":
the pre-upgrade commit, its tag, the upgrade branch's base commit, and the deployment
rollback mechanism. On a shared platform the rollback point covers **every** adopter at once —
which is precisely why the adopters are validated one at a time before the rollback point is
retired.

## Never

- Never invent a package/dependency mechanism for the Foundation; adoption is a
  committed vendored snapshot.
- Never split an intentionally shared Foundation platform into one platform copy per adopter in
  order to upgrade them separately — upgrade the shared platform once and validate the adopters
  one at a time.
- Never treat a reproduce step's "preserved override" as proof on its own, after a re-vendor:
  classify against the *pre-upgrade* snapshot (step 11).
- Never record a moving branch as the acquired baseline — pin the exact commit.
- Never "upgrade" by deleting or replacing adopter content, configuration or branding.
- Never overwrite an adopter override just because its pathname is platform-defined —
  and never freeze every old file so legitimate platform defaults can never land.
- Never record a Foundation version you have not actually acquired.
- Never deploy a version you have not validated.
- Never fix a Foundation defect silently inside an adopter upgrade — record it,
  classify it (adopter-specific vs platform-wide), and escalate
  (`agent-operating-rules.md`).
