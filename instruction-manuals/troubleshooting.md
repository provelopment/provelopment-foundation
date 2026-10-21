# Troubleshooting — known, recurring, resolved

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-10-21.4`
> **Content model described:** the **current EFS installation model** — one immutable Foundation release established into one autonomous Installation that owns its authored capsule and serves explicitly declared Entities, Facets, Sites, Pages and localized representations through publication bindings owned by declared Spokes. Pages are language-neutral; each localized representation is a JSON or Markdown source; JSON visibility is per representation; `unlisted` means reachable but not advertised, never private. Update changes authored material; Upgrade adopts a different immutable release. Legacy country-coded Sites, regional pages, Location routing and computed timezone/DST behavior are historical only.
> **Procedure validation:** the release and establishment procedures retain their 2026-09-30 end-to-end baseline. Revision `2026-10-21.4` reconciles the distributed model to the merged EFS runtime and the A1-R2F receiver-key isolation, reference and hygiene correction, and is verified by the Foundation unit, integration, architecture, deployment and browser gates recorded in `FOUNDATION-COMPLETE-A1-R2F`; no release tag is claimed by this revision.
> **Adopter baseline:** the installation's own adoption record — `deployment/foundation-baseline.json` inside the installation's capsule. An adopter's own governance record is the adopter's; it is never the Foundation's adoption record.
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed** and byte-identical to the master revision above — SHA-256
> verified at propagation — and is never edited in place: edit the master upstream and
> propagate.

## Scope

This manual is **intentionally small**. It contains only problems that have actually
recurred and have a safe, proven resolution. It is not the project's full issue log.
For full historical detail see the project's own knowledge record.

Each entry: **symptom → cause → safe resolution → prevention**.

---

## 1. Business artwork is replaced when platform files land

**Symptom.** After platform files are placed into a project (a newer release, a copied platform
tree, or a project's own reproduction script), adopter-customized artwork under a
platform-defined asset name reverts to the generic originals. Branding silently changes.

**Cause.** Something copied **over** the project's own files. There is no Foundation command that
"reproduces platform files into a site", and `pnpm setup` is specifically **not** a Foundation
script — it is pnpm's own built-in, it changes global pnpm/`PATH` state, and it must never be run
for this purpose. A project that still carries a reproduction script carries the project's own
tooling, and this is that tooling's defect: it copied platform assets over files the project had
replaced.

**Safe resolution.**
1. Do **not** simply re-apply the artwork by hand and move on — that hides the defect
   and the next placement destroys it again.
2. Restore the project's files from Git (`git checkout -- <paths>` / the previous commit).
3. Place platform material the supported way instead: an **installation** receives its platform
   files from establishment (`pnpm installation:establish` — `adoption.md`), and a newer release is
   obtained as an immutable payload directory. Never copy a release over an installed tree.
4. Verify with `pnpm assets:check` that the runtime asset mirror and its provenance records agree,
   and confirm every project-owned override is byte-identical to before (prove it with hashes).

**Prevention.** Keep business artwork in the project's own content area (`content/assets/`) and
wire it from configuration (`branding-and-assets.md`). If a platform-defined runtime role must be
replaced in place, record it as deliberate so a later adoption treats it that way.

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

## 6. A platform asset the release re-drew stays stale after adopting a newer release

**Symptom.** A newer release is adopted and everything builds — yet a platform-defined graphic
(favicon, header/footer logo, sidebar icon) still renders the **previous** release's artwork.

**Cause.** A platform role the new release **re-drew** was left in place by a copy that preserved
files the project appeared to have overridden. Asset ownership is decided by comparing the
project's file with the release it recorded, and that reference changes the moment the new release
is placed: a redrawn platform role then looks exactly like a deliberate override, and the stale
copy is kept. The evidence needed to classify it correctly was destroyed by the placement itself.

**Safe resolution.**
1. Take the platform's files from an intact payload — the release you hold is the authority for
   what its own files contain, and `pnpm release:verify` proves a payload is the content set its
   manifest describes.
2. Refresh the platform-defined roles from that release. Genuine business artwork lives in the
   project's own content area and is never one of those roles, so this cannot damage it.
3. Verify with `pnpm assets:check`, re-run the deployment-scoped gate (`validation.md`), and record
   the per-file outcome (kept / refreshed / relocated / retired).

**Prevention.** Record what the project owned **before** a newer release is placed, and treat any
"preserved N override(s)" report from a copy step as a claim to verify, not a fact. Nothing breaks
in tests, so this defect is invisible without that record.

---

## 7. Deployment is silently "blocked" and production keeps serving the old release

**Symptom.** A merge to the deploy branch is pushed, the CI gate is green, and validation
passed locally — but the live site never changes. The deployment platform reports the
deployment as **blocked** (not failed), and nothing in the build logs explains it.

**Cause.** On a Git-integrated platform, the **commit author** is part of the deployment
decision. A commit authored by an identity that is not a member of the platform account is
**blocked** rather than built. The pattern is unmistakable once you look for it: every commit
authored by the project's established identity deploys, and every commit authored by an
automation identity does not. The platform reports neither a build error nor a missing
trigger, so the failure surfaces only as "production did not change".

**Safe resolution.**
1. Compare the blocked commit's author with the author of the last deployment that *did*
   succeed (`git log --format='%h %an <%ae>'`; the platform's commit statuses show which
   commits deployed).
2. Re-issue the change as a commit authored by the project's established identity, and push it
   forward. **Do not** rewrite or force-push the blocked commits — fix forward.
3. Verify the new commit's deployment reaches a success state, then verify the live site.

**Prevention.** Author deployment-triggering commits under the project's established identity,
and treat "the live site did not change" as a deployment problem to investigate immediately —
never as caching. Record the identity in the project's docs so the next agent does not have to
rediscover it.

---

## 8. The site is not live and no deployment exists to debug — a missing provider project

**Symptom.** The repository is green, merged and pushed, but the intended production hostname
does not serve the site: the apex may resolve to the deployment provider and return
`DEPLOYMENT_NOT_FOUND`, or the `www` host may not resolve at all (`No such host is known`).
There is no build failure, because **there is no deployment to fail**.

**Cause.** The provider **project itself was never created**, or exists but is not connected to
this repository. A Git-integrated provider does not provision a project because a repository
exists: project creation, repository connection, production branch and domain binding are set up
once in the provider account — **owner/provider-account work**, which a coding agent does not
perform and does not probe (`agent-operating-rules.md` → *Access boundary*).

**Safe resolution.**
1. Confirm the diagnosis before touching anything, using only authorised evidence: the
   repository's commit **statuses/checks** through GitHub (a connected provider reports its own
   deployment status there; none present means it is not connected) and the hostname's DNS
   resolution, to see what it actually points at. Do **not** check provider authentication or
   query the provider account — provider CLI/account state is not an agent-accessible source.
2. **Do not** invent infrastructure, change DNS, or create provider resources on the owner's
   behalf. Prepare the exact owner action instead: project name, repository, framework, root
   directory, production branch, environment variables (usually none), the canonical domain and
   whether the apex redirects to it, and the exact DNS record the provider's domain screen
   asks for.
3. Record the verified current DNS state (existing sibling hosts, and the MX/TXT records that
   must not be modified) so the handover cannot damage mail.
4. Report the deployment as **pending owner action** — never as deployed.
5. When the owner has completed it, **verify against the canonical host**, not the raw deployment
   URL: provider deployment protection serves a **login page with HTTP 200** from the
   `*.vercel.app` address, so a status-code check there proves nothing. Confirm routes, the
   canonical link, `og:site_name`, the favicon, the header/footer identity, the apex → canonical
   redirect, and that mail (MX/TXT) still resolves — then update the project record (a bootstrap
   record's deployment section must state the **verified live state**, not the intended one).

**Prevention.** Treat "is a provider project connected to this repository?" as a **precondition
of the bootstrap**, alongside the first green gate. Verify it with evidence a coding agent is
authorised to read (the repository's deployment **statuses/checks through GitHub**, and the
hostname's DNS resolution) rather than assuming a push will deploy, and confirm the
provider project's existence **again after the bootstrap** — a project can be created while a
task is in flight.

---

## Adding an entry

Add a problem here only when it has **recurred** and the resolution is **proven**.
Use the four-part shape. Do not turn this manual into a chronological log — that
belongs in the project's knowledge record.

## 9. CI fails on a directory that exists in your working tree but not in a fresh clone

`ENOENT: no such file or directory, scandir .../content`

**Cause.** Git does not track empty directories. A test fixture, a build step or a
manual experiment can leave an empty directory behind locally, so anything that scans
it passes on your machine and fails in CI and in every fresh clone.

**Fix.** Make the scan tolerate absence - an absent directory contains no files to
scan:

```ts
if (!existsSync(directory)) return [];
```

**Prevention.** Run the clean-clone acceptance gate (`validation.md`) before releasing
anything, and treat "works locally, fails in CI" as a hidden dependency until proven
otherwise.

**Related trap (the same class).** A provider project still connected to the **old**
repository after a source move: production then keeps building from the upstream (now
de-bloated) tree. Verify the provider reports the deployment against the new
repository, and that the old one receives no production deployments.
