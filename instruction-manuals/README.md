# Provelopment Foundation Instruction Manuals

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-15.1`
> **Applicable Foundation baseline:** `v2026.09.11-foundation-p6-3c-banner-sidebar-cta`
> **Foundation commit:** `f5c94da`
> **Master authority:** Provelopment root project — `.project-instructions/deployment-info/instruction-manuals/`
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

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
| **Master** | Provelopment root project / `.project-instructions/deployment-info/instruction-manuals/` | Authoritative. All edits happen here. |
| **Distributed** | `ProvelopmentFoundation/instruction-manuals/`, `FoundationDemos/instruction-manuals/`, and every Foundation-derived adopter project | Byte-identical copies of the master. |

**Edit rule:** a distributed copy is never edited independently. If a manual is
wrong or incomplete, fix the master, review it, then propagate. Two divergent
copies of the same procedure are a process defect.

The version header at the top of every manual makes the provenance
self-describing: a reader working only inside an adopter repository can see where
the manual came from, which Foundation baseline it applies to, and that their
copy is distributed.

## Propagation procedure

Run this when the master changes, and once per accepted Foundation release.

1. **Update the master** — edit `Provelopment/.project-instructions/deployment-info/instruction-manuals/` (and only there).
2. **Review** — read the changed manual end to end; confirm it is actionable and
   consistent with the manuals it cross-references. Bump the header revision if warranted.
3. **Copy the complete file set** — propagate every master file, so additions and
   edits always travel. Copy **explicitly**; do **not** mirror destructively
   (`robocopy /MIR`, `rsync --delete`). A copy is reviewable, and a file that has
   genuinely disappeared from the master is removed from the receivers as its own
   deliberate, visible step:
   ```powershell
   # run from the root repository (the one that contains .project-instructions/)
   Copy-Item '.project-instructions\deployment-info\instruction-manuals\*.md'  'ProvelopmentFoundation\instruction-manuals\' -Force
   Copy-Item '.project-instructions\deployment-info\instruction-manuals\*.md'  'FoundationDemos\instruction-manuals\'      -Force
   ```
   ```bash
   # run from the root repository
   cp .project-instructions/deployment-info/instruction-manuals/*.md ProvelopmentFoundation/instruction-manuals/
   cp .project-instructions/deployment-info/instruction-manuals/*.md FoundationDemos/instruction-manuals/
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
$master = '.project-instructions\deployment-info\instruction-manuals'
foreach ($copy in @(
  'ProvelopmentFoundation\instruction-manuals',
  'FoundationDemos\instruction-manuals')) {
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
diff -r .project-instructions/deployment-info/instruction-manuals ProvelopmentFoundation/instruction-manuals && echo "FOUNDATION PARITY OK"
diff -r .project-instructions/deployment-info/instruction-manuals FoundationDemos/instruction-manuals      && echo "DEMOS PARITY OK"
```

`diff -r` is silent and exits 0 only when every file is byte-identical — that is
the acceptance evidence. No synchronization tooling is required or wanted; the
copy is explicit and the check is explicit.

## Version table

| Manual revision | Foundation baseline | Commit | Date |
| --- | --- | --- | --- |
| `2026-09-15.1` | `v2026.09.11-foundation-p6-3c-banner-sidebar-cta` | `f5c94da` | 2026-09-15 |
| `2026-09-11.1` | `v2026.09.11-foundation-p6-3c-banner-sidebar-cta` | `f5c94da` | 2026-09-11 |

> `2026-09-15.1` re-issues the same procedures with the master authority path moved to
> `.project-instructions/deployment-info/instruction-manuals/` (governance consolidation).
> No procedure changed; the propagation and parity checks above are unchanged.

Add a row whenever the manuals are propagated against a new Foundation baseline.

## Manual index

| Manual | Use it when |
| --- | --- |
| [`foundation-upgrade.md`](foundation-upgrade.md) | A newer Foundation release must be absorbed without damaging adopter-owned material. |
| [`adoption.md`](adoption.md) | Creating a new Foundation-derived project (Demo 3/4 or a real customer). |
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
