# Provelopment Foundation Instruction Manuals

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-17.2`
> **Procedure validated against:** Foundation template release `v2026.09.17-foundation-generic-template` (`b9f7a18`) + the FS1 repository split (public template / private reference site)
> **Master authority:** Provelopment root project — `.project/deployment-info/instruction-manuals/`
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## How to read the version header

Four different Foundation references are easy to confuse, and confusing them is how
a project ends up claiming a baseline it never acquired. They are defined here and
nowhere else; every manual's header uses exactly these terms.

| Term | Meaning | Where it lives |
| --- | --- | --- |
| **Manual revision** | The version of this manual **set**. Bumped when the procedures change. Not a Foundation release. | The header of every manual + the version table below. |
| **Procedure validated against** | The exact Foundation ref on which this manual **set** was last exercised **end to end, with recorded evidence** — for *any* procedure in the set. A procedure statement is only trustworthy to the ref at which *that* procedure was last exercised; the version table records which run produced the current revision. | The header of every manual. |
| **Adopter baseline** | The Foundation ref a **specific adopter project** actually runs. Independent per adopter. | That project's `platform/SOURCE.md`. |
| **Target ref** | The immutable ref **selected for one upgrade** (a release tag, or a full commit SHA when no tag covers the accepted state — never a moving branch name). | The upgrade record + `platform/SOURCE.md` after acceptance. |

A manual revision and an adopter baseline move **independently**: the manuals can
improve without any adopter moving, and an adopter can upgrade without the manuals
changing. `2026-09-11.1`, for example, was the manual revision a `f5c94da` adopter
recorded while the master was already documenting `1114759`.

## Purpose

A Foundation adoption delivers **two** things, and both are required:

1. **The source code** — the reusable platform snapshot.
2. **The operating knowledge** — how to configure, customize, upgrade, validate,
   deploy, and maintain that source code correctly.

This package is item 2. Without it an adopter receives a code snapshot and no
safe way to operate it: they cannot know which material is platform-owned, which
is theirs, what "done" means, or how to absorb a newer Foundation release
without destroying their own business content and branding.

These manuals are written for **downstream coding agents and developers**. They
are operational procedure, not marketing.

## Authority

| | Location | Role |
| --- | --- | --- |
| **Master** | Provelopment root project / `.project/deployment-info/instruction-manuals/` | Authoritative. All edits happen here. |
| **Distributed** | `01.foundation/instruction-manuals/`, `02.demo-businesses/instruction-manuals/`, `03.dot-com/instruction-manuals/`, and every Foundation-derived adopter project | Byte-identical copies of the master. |

**Edit rule:** a distributed copy is never edited independently. If a manual is
wrong or incomplete, fix the master, review it, then propagate. Two divergent
copies of the same procedure are a process defect.

The version header at the top of every manual makes the provenance
self-describing: a reader working only inside an adopter repository can see where
the manual came from, which Foundation baseline it applies to, and that their
copy is distributed.

## Propagation procedure

Run this when the master changes, and once per accepted Foundation release.

1. **Update the master** — edit `Provelopment/.project/deployment-info/instruction-manuals/` (and only there).
2. **Review** — read the changed manual end to end; confirm it is actionable and
   consistent with the manuals it cross-references. Bump the header revision if warranted.
3. **Copy the complete file set** — propagate every master file, so additions and
   edits always travel. Copy **explicitly**; do **not** mirror destructively
   (`robocopy /MIR`, `rsync --delete`). A copy is reviewable, and a file that has
   genuinely disappeared from the master is removed from the receivers as its own
   deliberate, visible step:
   ```powershell
   # run from the root repository (the one that contains .project/)
   Copy-Item '.project\deployment-info\instruction-manuals\*.md'  '01.foundation\instruction-manuals\' -Force
   ```
   ```bash
   # run from the root repository
   cp .project/deployment-info/instruction-manuals/*.md 01.foundation/instruction-manuals/
   ```
4. **Verify the exact file list** — the copies must contain exactly the master's
   files: no extras, no omissions.
5. **Verify byte/hash parity** — see below. Not optional.
6. **Update the receiving project's records** — Foundation: nothing beyond the
   commit. Adopter: a row in `platform/SOURCE.md` recording the manual revision
   alongside the Foundation baseline.
7. **Commit the receiving repository** — separately from the master commit, with
   a conventional message naming the manual revision.

## Parity verification

**PowerShell (Windows workspace):**

```powershell
# run from the root repository
$master = '.project\deployment-info\instruction-manuals'
foreach ($copy in @(
  '01.foundation\instruction-manuals',
  '02.demo-businesses\instruction-manuals',
  '03.dot-com\instruction-manuals')) {
  Write-Host "== $copy"
  $a = Get-ChildItem $master -File | Sort-Object Name
  $b = Get-ChildItem $copy   -File | Sort-Object Name
  if ($a.Count -ne $b.Count) { Write-Host "  FILE-COUNT MISMATCH: $($a.Count) vs $($b.Count)" }
  foreach ($f in $a) {
    $h1 = (Get-FileHash $f.FullName -Algorithm SHA256).Hash
    $h2 = if (Test-Path (Join-Path $copy $f.Name)) { (Get-FileHash (Join-Path $copy $f.Name) -Algorithm SHA256).Hash } else { 'MISSING' }
    '{0,-28} {1}' -f $f.Name, $(if ($h1 -eq $h2) { 'MATCH' } else { 'DIFF' })
  }
}
```

**bash / macOS / Linux:**

```bash
# run from the root repository
for r in 01.foundation 02.demo-businesses 03.dot-com; do
  diff -r .project/deployment-info/instruction-manuals "$r/instruction-manuals" \
    && echo "$r PARITY OK"
done
```

`diff -r` is silent and exits 0 only when every file is byte-identical — that is
the acceptance evidence. No synchronization tooling is required or wanted; the
copy is explicit and the check is explicit.

> **Every repository that carries a distributed copy must be checked.** The receiver set grows as
> projects are adopted (`02.demo-businesses` since the demo programme, `03.dot-com` since the
> dot-com bootstrap, `00.foundation-template` + `01.foundation` since the FS1 split). A parity
> claim is only ever made for receivers that were actually checked.

## Version table

| Manual revision | Procedure validated against | Commit | Date |
| --- | --- | --- | --- |
| `2026-09-17.2` | Foundation template release `v2026.09.17-foundation-generic-template` + the FS1 repository split | `b9f7a18` (template) · `fb721b3` (reference-site baseline) | 2026-09-17 |
| `2026-09-17.1` | `main` (single canonical presentation) | `ccc29a5` | 2026-09-17 |
| `2026-09-16.3` | `main` (single canonical presentation) | `dae07b4` | 2026-09-16 |
| `2026-09-16.2` | `main` (single canonical presentation) | `1114759` | 2026-09-16 |
| `2026-09-16.1` | `main` (single canonical presentation) | `1114759` | 2026-09-16 |
| `2026-09-15.1` | `v2026.09.11-foundation-p6-3c-banner-sidebar-cta` | `f5c94da` | 2026-09-15 |
| `2026-09-11.1` | `v2026.09.11-foundation-p6-3c-banner-sidebar-cta` | `f5c94da` | 2026-09-11 |

> `2026-09-17.2` is validated by the **Foundation split (FS1)**: the public repository became the
> **generic template product** and the live Foundation site moved to the private
> `provelopment/provelopment-foundation-site` repository. It adds the **public-template /
> private-reference-site** distinction and its repository map, the rule that the **public template
> has no production deployment**, the provider-project **re-connect + production-provenance**
> procedure, the **clean-clone acceptance gate** (which caught a CI-only hidden-directory
> dependency), and the **template vs adopter test responsibility** split. See `adoption.md` →
> *When the upstream product and the live site are the same codebase*, `deployment.md` →
> *Re-pointing a provider project to a new repository*, `validation.md` → *Clean-clone acceptance*,
> and `troubleshooting.md` entry 9.
> **adoption** procedure was executed end to end, at Foundation `ccc29a5` (runtime `1114759`).
> It adds the distinction between the two **adoption shapes** (vendored vs **direct downstream
> clone**), the downstream-clone **runbook** that was actually followed, the mandatory
> `origin`/`foundation` remote topology, the rule that a downstream project keeps its own version
> history (upstream release tags are **not** pushed downstream), and the provider-credential
> precondition in `deployment.md` + `troubleshooting.md` entry 8. `foundation-upgrade.md` was not
> re-exercised by this run; its last full exercise remains `2026-09-16.3` @ `dae07b4`.
>
> `2026-09-16.3` is the first revision **validated by a real upgrade run**, not by
> review. The DemoBusinesses shared-platform upgrade (`f5c94da` → `dae07b4`) was
> executed with this procedure and its findings are folded back in:
> `foundation-upgrade.md` now sequences **one pilot adopter before the remaining
> adopters**, requires an **immutable target** (a full commit SHA when no tag covers
> the accepted state) with the exact fetch command, states that the reproduce step
> must **mirror** so upstream **deletions** land, and documents the two traps the run
> exposed — the **asset-classification trap** after a re-vendor, and the
> **canonical-baseline files** a vendoring helper does not copy. The header
> terminology is defined above for the first time, which is why nine manuals
> previously carried a stale, undefined baseline. See
> `02.demo-businesses/docs/upgrades/foundation-dae07b4-shared-upgrade.md`.
>
> The same upgrade pass also produced the **deployment-blocking** finding recorded in
> `deployment.md` (Preconditions) and `troubleshooting.md` entry 7: a Git-integrated platform
> can **block** a deployment whose commit author is not a member of the platform account, so a
> green gate can coexist with an unchanged production site.

> `2026-09-16.2` re-issues the same procedures with the workspace paths updated by
> the numbered-workspace migration: the governance home is now `.project/` (was
> `.project-instructions/`) and the Foundation working directory is now
> `01.foundation/` (was `ProvelopmentFoundation/`). No procedure changed.
> `2026-09-16.1` re-issues the same procedures with the propagation/parity cycle
> updated for the single-presentation architecture: the retired selectable-
> presentation (preset) feature and the retired sibling demo repository are no
> longer part of the cycle, and the parity check covers Foundation only.
> `2026-09-15.1` re-issues the same procedures with the master authority path moved to
> `.project/deployment-info/instruction-manuals/` (governance consolidation).
> No procedure changed; the propagation and parity checks above are unchanged.

Add a row whenever the manuals are propagated against a new Foundation baseline.

## Manual index

| Manual | Use it when |
| --- | --- |
| [`foundation-upgrade.md`](foundation-upgrade.md) | A newer Foundation release must be absorbed without damaging adopter-owned material. |
| [`adoption.md`](adoption.md) | Creating a new Foundation-derived project (a single-site **downstream clone** like `03.dot-com`, or a multi-site **vendored** adopter, or a real customer). |
| [`site-customization.md`](site-customization.md) | Changing identity, navigation, CTA, presentation, theme, contact or metadata **without touching source**. |
| [`branding-and-assets.md`](branding-and-assets.md) | Replacing logos, favicon, banners, sidebar icons or imagery; runtime roles vs business files. |
| [`content-management.md`](content-management.md) | Writing/editing pages, offerings, portfolio, testimonials, FAQs, legal pages or dictionaries. |
| [`validation.md`](validation.md) | Before claiming any task complete; understanding what each gate proves. |
| [`deployment.md`](deployment.md) | Taking a validated repository live and verifying production. |
| [`agent-operating-rules.md`](agent-operating-rules.md) | Operating inside an adopter project: authority, boundaries, escalation, handoff. |
| [`troubleshooting.md`](troubleshooting.md) | A known recurring failure with a known safe resolution. |

Full configuration schema reference lives in the Foundation's `CUSTOMIZING.md`;
architecture in `ARCHITECTURE.md`. These manuals point at them rather than
duplicating them.

## Retirement policy

Obsolete procedures are **updated**, **consolidated**, or **removed** — never left
active beside their replacement.

- One procedure, one home. If a manual duplicates a project document, keep the
  manual (it is distributed) and reduce the project document to a pointer.
- Superseded guidance is rewritten in place; the version table records the change.
- Dead guidance is deleted. Historically interesting material belongs in project
  history/archives, not in a manual an agent will follow.
- **Contradictory active instructions are not allowed.**

## What this package is not

- Not a substitute for `CUSTOMIZING.md` (schema reference) or `ARCHITECTURE.md`.
- Not a changelog or release history.
- Not a place for project-specific business facts (customer briefs, site copy) —
  those are adopter-owned content.
