# Troubleshooting — known, recurring, resolved

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-16.2`
> **Applicable Foundation baseline:** `v2026.09.11-foundation-p6-3c-banner-sidebar-cta`
> **Foundation commit:** `f5c94da`
> **Master authority:** Provelopment root project — `.project/deployment-info/instruction-manuals/`
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## Scope

This manual is **intentionally small**. It contains only problems that have actually
recurred and have a safe, proven resolution. It is not the project's full issue log.
For full historical detail see the project's own knowledge record.

Each entry: **symptom → cause → safe resolution → prevention**.

---

## 1. Vendor/setup operation overwrites adopter assets

**Symptom.** After running the platform-reproduction step (`pnpm setup`, re-vendor,
or equivalent), adopter-customized files under a framework-owned asset directory
revert to the generic platform originals. Branding silently changes.

**Cause.** The reproduction step copies the platform asset directory over the site
asset directory **including files the adopter replaced in place**. The role is the
platform's, but the *artifact* was the adopter's — the classic category-3 overlap in
`foundation-upgrade.md`.

**Safe resolution.**
1. Do **not** simply re-apply the artwork by hand and move on — that hides the defect
   and the next upgrade destroys it again.
2. Restore the adopter files from Git (`git checkout -- <paths>` / the previous commit).
3. Fix the reproduction tooling so it **does not overwrite adopter-overseen files** —
   copying only when the destination is absent (the same rule already used for
   adopter-owned dictionaries) is a proven, minimal fix.
4. Verify: every adopter override byte-identical after the operation, **and** new
   platform assets still present.

**Prevention.** Keep business artwork in the adopter's own asset area and wire it
from configuration. If you must override a platform-defined role in place, **record
it** so upgrades treat it as deliberate. Never run a bare reproduction step on an
adopter project before you know which files it owns.

---

## 2. Configured canonical URL does not match the live hostname

**Symptom.** The deployed site works, but canonical/OpenGraph/sitemap/robots URLs
point at a host that does not resolve (or is not the one users visit). Local
validation is green.

**Cause.** The site's configured canonical URL was set to an intended domain that
differs from the hostname actually serving production. This class of defect is
invisible locally because it is a *production* fact.

**Safe resolution.**
1. Confirm the real production hostname (does it resolve? does it return 200?).
2. Set the configured canonical URL to that hostname.
3. Rebuild, redeploy, and re-verify the head/sitemap/robots on the live site.

**Prevention.** Set the canonical URL to the agreed live domain **before** the first
deploy. Add "configured URL == live hostname" to the production QA checklist
(`deployment.md`) and to live verification. Check the live host, not the plan.

---

## 3. Script name containing `:` fails on Windows

**Symptom.** A package script such as `check:routes` cannot be executed as a
**filename** on Windows (the `:` is illegal in a path).

**Cause.** Windows path rules.

**Safe resolution.** Map the script name to a file name that is legal on Windows
(e.g. `check:routes` → `check-routes.mjs`) and have the orchestrator invoke that.
Keep the user-facing script name unchanged.

**Prevention.** Never name an executable file with a colon; when adding a script,
mirror the existing mapping convention.

---

## 4. Git index truncated inside a cloud-synced folder

**Symptom.** `fatal: .git/index: index file smaller than expected`, or an editor
reports files as missing/unstaged that are clearly present.

**Cause.** A cloud-sync client (OneDrive et al.) can lock a file mid-write during
rapid index updates and leave a truncated (e.g. 0-byte) index.

**Safe resolution.** Rebuild the index from HEAD:
```powershell
Remove-Item .git/index -Force
git reset HEAD
```

**Prevention.** Avoid large parallel Git operations inside actively syncing folders;
let sync settle before heavy operations. Keep build output and dependencies out of
the synced tree.

---

## 5. Lockfile must be regenerated after adding a site

**Symptom.** After adding a second site to a workspace, the normal install fails
against the frozen lockfile ("lockfile out of date").

**Cause.** Adding a package changes the workspace graph; the lockfile no longer
matches it.

**Safe resolution.** Refresh once:
```bash
pnpm install --no-frozen-lockfile
```
then commit the updated lockfile.

**Prevention.** Treat a new site/package as a lockfile-changing event: refresh,
commit the lockfile, then run the gate. Do not use `--no-frozen-lockfile` in CI.

---

## Adding an entry

Add a problem here only when it has **recurred** and the resolution is **proven**.
Use the four-part shape. Do not turn this manual into a chronological log — that
belongs in the project's knowledge record.
