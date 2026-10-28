# Adoption — creating a new Foundation-derived project

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

## What this manual is for

Creating a **new** Foundation project from an **immutable Foundation release**, so that it starts
with the platform *and* the operating knowledge it needs.

There are two starting points. Choose deliberately:

| Starting point | Use it when | Where its procedure is |
| --- | --- | --- |
| **A new Foundation installation** | you are starting a site or business that should run one immutable release, in a directory of its own, autonomously | *Creating a Foundation installation* (below) — **this is the current workflow** |
| **Repository-shaped project** | the project is a Foundation-derived Git repository, or predates the installation model | *Repository-shaped adoption* (below) — **HISTORICAL**, retained for existing projects and migration |

This manual is generic. It is not specific to any one business or directory name.

## Creating a Foundation installation (the current workflow)

One autonomous installation, in a directory of its own, running **one immutable release**. The
platform does the work:

```bash
# 1. Construct the release you want to install (or unpack one you were given).
pnpm release:build --release <identity> --source <commit> --dest <an empty directory>

# 2. Establish the installation. The target must be ABSENT or EMPTY.
pnpm installation:establish \
  --release <identity> \
  --payload <the directory from step 1> \
  --seed    <your authored capsule> \
  --target  <the installation root> \
  --name    "<the name you use for this installation>" \
  --repository "<this installation's own repository>"
```

Then prove it, from INSIDE the new installation:

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm assets:check
pnpm country-codes:check
pnpm test:deployment          # if your capsule ships its own acceptance tests
pnpm test:browser:deployment  # where browser acceptance is required
```

The platform's generic suite (`pnpm test:foundation`) is **informative** rather than conclusive
inside an installation: some of its suites describe the Foundation PROJECT's own repository — its
Git history, its release tags and its tracked inventory — rather than any installation. Use the
installation-owned list above (`validation.md`).

### What you need

- An **immutable Foundation release**: `provelopment-foundation-vYYYYMMDD.HHMM`, or the
  grandfathered first release `v2026.09.30-foundation-release-initial`. You obtain its **bytes** —
  from the canonical public repository, or from any other acquisition source able to give you that
  same immutable release. Establishment today consumes a **directory** (`--payload`).
  > The historical checkpoint tags of the form `v<YYYY.MM.DD>-foundation-<slug>` are **HISTORY**:
  > they record past checkpoints and are never an identity to supply to current tooling.
- An **authored capsule** — the material that makes the installation *yours*: configuration,
  content, artwork, dictionaries (`site.config.json`, `config/`, `content/`). An existing
  installation's capsule is a perfectly good seed.
- Node.js 24.x, pnpm 11.6.0, Git if you want the installation version-controlled (establishment creates
  no repository and makes no commit for you), and provider access if you are deploying.

### What establishment writes — and what it refuses

The complete procedure — what you get, what it refuses, what a re-run does, and how to prove the
result — is `scripts/installation/README.md`. In one paragraph: it writes the release's platform,
copies your authored material verbatim into the installation's capsule, writes the installation's
adoption record (`foundation-baseline.json`) and its generated operational record
(`operational-state.json`), and nothing else. It never reaches outside the target root, never
overwrites and never deletes.

### An existing installation's capsule is a valid seed

That is the ordinary case, and the capsule you point `--seed` at keeps its own records. Its
`foundation-baseline.json` names the release THAT installation adopted, so it is **not carried
over**: the new installation gets its own record for the release you are establishing, the source
file is never modified, and the operator report names it as `not inherited`. Generated
`operational-state.json` is never portable authored content — machine state describing what an
installation runs — so it may not be inside a seed at all.

### Established is not the same as serving

Establishment records what it actually did: the installation is now ACTIVE, and its record names
the exact release that became its Foundation state. It does **not** record health, because it never
evaluated any — the record reads `offline` with `healthEvaluatedAt: null` ("nothing has judged it
yet"), and the command says so in its report. Only a real health evaluation, performed later
against the running installation, can record it `online`. Nothing in the platform claims an
installation is serving until somebody has actually observed it serve.

> **There is no health probe, no staging deployer, no production promoter and no rollback executor
> in this release.** If an operator asks how the platform checks, stages or promotes an
> installation, the honest answer is that it does not — yet.

### An installation is not a clone, and it has no parent

```text
Foundation installation
    ├── own lifecycle / adoption / operational state
    └── own spokes
            └── Site contexts
```

A **Foundation installation** is not a spoke, and a spoke is not a **Site**. The installation's
operational record names the installation it describes, it holds no reference to the installation
it was created from, and it asks that installation for nothing: there is no clone relationship, no
parent, no sibling and no fleet, and **no runtime dependency on GitHub** — the platform never
polls, never discovers "latest", and never maintains an upstream connection. Acquisition is an
operator action, and it is replaceable.

## Repository-shaped adoption shapes — HISTORICAL

> **HISTORICAL.** These are the two shapes a project took **before** the installation model. They
> remain accurate for a repository still built that way — and are the reason a migration must be
> deliberate — but they are not how a new project starts today (see *Creating a Foundation
> installation* above). The **source record** row below names a file belonging to the *project's
> own governance*: it is **not** the Foundation's adoption record. An installation's adoption
> record is `deployment/foundation-baseline.json`, written by establishment and never by hand.

A repository-shaped Foundation-derived project was created in one of two shapes. Choose
deliberately — both are supported, and neither is a fork.

| | **Vendored** | **Direct downstream clone** |
| --- | --- | --- |
| Shape | the Foundation lives under a `platform/` directory inside the project | the project **is** a Foundation checkout, re-branded and re-configured |
| Use it when | one repository hosts **several** sites, or the platform and business layers must be held apart with a divergence check | the project is **one site** and its owner wants the Foundation in place, with no vendoring layer |
| Foundation arrives as | a committed snapshot under `platform/`, reproduced into each site | the repository's own tree at the Foundation commit |
| Source record (the project's own governance — **not** the Foundation's adoption record) | `platform/SOURCE.md` | `FOUNDATION_SOURCE.md` |
| Updated by | `foundation-upgrade.md` — the compare → apply procedure, marked **HISTORICAL** there | `foundation-upgrade.md`, treating the repository root as the platform tree |
| Worked example | a multi-site adopter: several sites reproducing **one shared** snapshot | a single-site adopter: one re-branded checkout |

Either way the Foundation relationship must be **explicit in the repository**: a source record
naming the source repository, the **exact** Foundation commit or tag, the acquisition date and
method, the adoption shape, and the remote topology. Never write a version the project is not
actually running.

### Remote topology (both shapes)

The **downstream repository is always `origin`**. The Foundation must never be the downstream
`origin`, or downstream work will be pushed upstream. Name the upstream remote `foundation`:

```text
origin       → the project's own repository
foundation   → provelopment/provelopment-foundation
```

## Prerequisites (repository-shaped path)

- An **immutable Foundation release** — `provelopment-foundation-vYYYYMMDD.HHMM`, or the
  grandfathered `v2026.09.30-foundation-release-initial` — and its commit. The checkpoint tags of
  the form `v<YYYY.MM.DD>-foundation-<slug>` in the product's history are **HISTORY**: evidence of
  past checkpoints, never an identity to supply to current tooling.
- Git, Node.js 24.x, pnpm 11.6.0, GitHub CLI (`gh`) with `repo` scope.
- Provider access for deployment (owner-managed).
- `foundation-upgrade.md` describes the same mechanics for an **existing** project, and states
  plainly which parts of it are historical.

> **Never** run adoption steps inside an existing Foundation or Foundation-derived
> repository. Adoption creates a **new, independent** repository.

## Lifecycle

```text
immutable Foundation release
    ↓
autonomous installation (own root, own capsule, own records)
    ↓
project configuration (identity, navigation, CTA, presentation)
    ↓
business content + assets
    ↓
instruction-manuals carried by the installation
    ↓
first green validation (installation-owned)
    ↓
deployment
    ↓
live verification
    ↓
handoff record
```

A repository-shaped project follows the same sequence with a **committed snapshot** where the
installation has its release.

## Procedure (repository-shaped path) — HISTORICAL

> **HISTORICAL.** This is how a repository-shaped project was created before the installation
> model: retained for existing projects and for migration. A new project starts with *Creating a
> Foundation installation* above. The commands named in each step are the real Foundation commands
> for the context that step describes.

### 1. Create the project directory and repository

Create the directory outside every existing repository, then initialise it as its
own Git repository with its own remote. One project = one repository = one
deployable unit (plus, if the project serves several Spokes — separate websites — one directory per Spoke).

### 2. Adopt the Foundation release

Vendor the Foundation release as a **committed snapshot** under a platform directory (a
compare-then-apply helper is the safe mechanism — see `foundation-upgrade.md`, which marks that
procedure HISTORICAL). Do **not** invent a package/dependency mechanism: acquisition is an
immutable release, not an npm dependency. An installation, by contrast, is *established* from the
release's bytes — it never copies a snapshot into a `platform/` directory.

### 3. Record the Foundation baseline

Create the project's **own** source-of-record file (conventionally `platform/SOURCE.md`). It is the
project's governance record — the Foundation never reads it, and it is **not** an installation's
adoption record (that is `deployment/foundation-baseline.json`, written by establishment). Record:

- source repository;
- release tag and **exact commit**;
- acquisition date and mechanism;
- what the snapshot contains;
- the **manual revision** of the distributed instruction manuals;
- an upgrade-history table (one row now; more as the project evolves).

Record the truth. Never write a version the project is not actually running.

### 4. Distribute the instruction manuals

Copy `instruction-manuals/` **verbatim** from the Foundation (which holds the
distributed package) into the new project. Verify with the parity check in
`instruction-manuals/README.md`. The new project must be able to operate itself
from its own copy.

### 5. Establish the project's own rules and brief

- Repository-level agent rules (what may/may not be modified, Git rules, testing,
  escalation, handoff) — consistent with `agent-operating-rules.md`.
- A project/business **brief** defining objectives, audience, CTA hierarchy and
  acceptance criteria. Keep it **site-local** if the repository hosts several sites.
- A per-site directive stating the boundary and any required contract (e.g.
  single-locale, no selectors) if the project has one.

### 6. Create the adopter configuration

Establish the site's configuration from the Foundation's validated contract:
identity, contact, navigation, enabled features, CTA, theme — and the EFS publication declarations
in `deployment/efs/manifest.json` plus the Spoke hierarchy in `deployment/spokes.json`. The public
host/prefix belongs to the publication binding; `site.url` is optional and informational. Follow
`site-customization.md`. Everything here is **adopter-owned**.

### 7. Establish business-owned directories

Create the directories that hold business material — content, dictionaries, and
business imagery/artwork. These are never overwritten by platform reproduction
(see the ownership model in `foundation-upgrade.md`). Wire business artwork
deliberately (see `branding-and-assets.md`).

### 8. Place platform-owned files and run the first green gate

**HISTORICAL, and project-owned.** The vendored model placed the platform identity into each site
with a **script belonging to the project**: there is no Foundation command for this and no release
provides one. The `pnpm setup` name this step once carried is **not** a Foundation script — it is
pnpm's own built-in, it changes global pnpm/`PATH` state, and it must never be run for this
purpose. A project that still carries such a script owns its behaviour, including the rule that it
must never overwrite adopter-owned files.

Then run the repository-shaped project's own gate:

```bash
pnpm install --frozen-lockfile
pnpm assets:check
pnpm country-codes:check
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
pnpm test:browser
```

The project is not adopted until these are green. See `validation.md`.

### 9. Create the deployment

Follow `deployment.md`. Deployment configuration (provider project, DNS, domain)
is normally an **owner action** — prepare the exact proposed change and hand it
over rather than improvising infrastructure.

### 10. Live-verify

Verify the deployed site, not only the local build: expected routes return 200,
assets are served, **the canonical host matches the configured `site.url`**, HTTPS
is active, favicon and metadata are correct, the CTA is present and correctly
placed, and responsive behaviour is intact.

### 11. Record the handoff

Write a handoff record: what was created, the Foundation release, the manual
revision, the gate results, the deployment state, known open issues, and the
recommended next step. The project must remain **self-describing** — a future
agent should recover context from the project's own files and Git history without
the original conversation.

## Downstream clone bootstrap (single-site) — HISTORICAL

> **HISTORICAL.** The runbook actually exercised **before** the installation model, when a new
> single-site project was created by cloning the Foundation from GitHub. It is retained as
> migration context. A new project does not start this way: it is **established** (*Creating a
> Foundation installation* above), which needs no clone, no remote renaming and no Git history at
> all. Where a step names the project's own record file, that file is the project's governance —
> never the Foundation's adoption record.

The runbook actually exercised to create a new single-site project by cloning the Foundation
from GitHub. Run it from the workspace root, with the project's numbered directory name already
reserved.

1. **Reserve the name** — take the next free `NN.<logical-name>` in the workspace and add it to
   the root repository's `.gitignore` **before** cloning, so the independent repository can
   never be absorbed by the root repository's tracking.
2. **Select the Foundation ref** — an accepted release tag, or the **exact** accepted commit SHA
   when no tag covers that state. Never a moving branch name.
3. **Clone from GitHub** — the acquisition source is the canonical GitHub repository, never a
   sibling working copy:
   ```bash
   git clone https://github.com/provelopment/provelopment-foundation.git NN.<logical-name>
   ```
4. **Pin and verify** — `git rev-parse HEAD` must equal the selected SHA; check out that exact
   commit if the clone's `main` has moved on.
5. **Rename the remote** — `git remote rename origin foundation`.
6. **Create the downstream repository** — empty (no README, no `.gitignore`, no licence),
   default branch `main`, private for a commercial project unless the owner has approved
   otherwise.
7. **Add `origin`** — the new downstream URL.
8. **Push the pristine baseline** — push the untouched Foundation state to `origin/main` and set
   upstream tracking. That commit is the project's **rollback reference**; do not squash it and
   do not `git init` a fresh history beside it.
9. **Branch** — `bootstrap/<project>-foundation` for all identity work, so the acquisition point
   and the customization stay separately reviewable.
10. **Record provenance** — the project's own `FOUNDATION_SOURCE.md` (source repository, canonical
    URL, exact SHA/tag, acquisition date and method, downstream repository, remote topology,
    adoption shape, adoption status). That file is the project's governance record; it is not the
    Foundation's adoption record, which for an installation is `deployment/foundation-baseline.json`.
11. **Apply the approved identity** — from the brand pack in the root governance project; follow
    `branding-and-assets.md`. Never design a new identity; never edit the master pack to fit a
    site.
12. **Configure the site** — `site.config.json`: identity, canonical `site.url`, locale(s),
    enabled features, navigation, CTA, theme (`site-customization.md`). Remove inherited example
    configuration that would misdescribe the site (`https://www.example.com` must never survive
    as a production URL).
13. **Reduce content honestly** — keep the site factually correct and neutral instead of
    inventing commercial copy; a **disabled feature must not remain in navigation**, and every
    navigation target must return 200.
14. **Re-verify the inherited tests** — the suites that ship with the template test the
    template's *own* demonstration content: treat the ones the project replaces as
    adopter-owned, expose them as separate commands, and add the project's own acceptance
    tests.
15. **Run the full gate** (`validation.md`) — assets check, types, lint, unit tests, build,
    audit, browser smoke.
16. **Verify the production build locally** — serve the build and check identity roles, routes,
    assets and canonical metadata **before** any deployment.
17. **PR and merge** — the bootstrap lands through a reviewable PR, not directly on `main`.
18. **Deploy** (`deployment.md`) — connect the provider project and deploy. Provider-project
    creation and domain/DNS changes are normally **owner actions**; hand over the exact steps.
19. **Verify production** — routes 200, identity correct, no `example.com`, no broken assets,
    responsive shell intact.
20. **Record** — a bootstrap record in the project (date, source SHA, baseline commit, branding
    source, validation results, deployment commit, deviations) plus the project's own tag.
21. **Document the workspace** — root project map, `VERSION_CONTROL.md` entry, changelog, memory
    and the project's programme plan.

## Completion criteria

**A new Foundation installation (current workflow):**

- [ ] the target was absent or empty, and establishment reported success;
- [ ] the capsule is your authored material, copied verbatim;
- [ ] `deployment/foundation-baseline.json` names the release **you** established — no record was
      inherited from the seed;
- [ ] `operational-state.json` is generated locally, and **no** health claim was recorded
      (`offline`, `healthEvaluatedAt: null`);
- [ ] the installation builds and passes its own gate (`validation.md` → installation gate);
- [ ] the installation's `instruction-manuals/` is byte-identical to the master (`README.md`);
- [ ] handoff record written.

**A repository-shaped project (historical path):**

- [ ] independent repository with its own remote;
- [ ] immutable Foundation release vendored, with the exact commit recorded;
- [ ] `instruction-manuals/` present and byte-identical to the distributed package;
- [ ] project rules + brief + directive present;
- [ ] project configuration validates;
- [ ] business-owned directories established;
- [ ] the repository gate green (`validation.md` → maintainer gate);
- [ ] deployment live and verified (or explicitly handed to the owner);
- [ ] handoff record written.

## Never

- Never adopt a revision you have not verified: an immutable release, never a moving branch.
- Never place business content, branding or configuration where platform files will overwrite it.
- Never configure DNS/provider/GitHub settings on the owner's behalf without an explicit
  instruction.
- Never claim a green gate that was not actually run (see `validation.md`).
- Never push the upstream Foundation's release tags into a project repository — a project owns only
  its own version history.
- Never write a version or a release identity a project is not actually running, and never treat a
  historical checkpoint tag as a current release identity (`README.md`).
- Never describe an installation as "upgraded in place": the platform ships **no** upgrade,
  staging, health, promotion or rollback command (`foundation-upgrade.md`).
- Never treat a project's own governance record as the Foundation's adoption record. An
  installation's adoption record is `deployment/foundation-baseline.json`.

## When the upstream product and the live site are the same codebase

The most common shape early in a project's life is that the **public platform
repository is also the live site's source**. That is convenient and it is a trap: the
generic product then looks like it belongs to one site, and every adopter has to
delete the maintainer's content and branding before they can start. Separate the
product from the site as soon as the product has a real adopter (FS1, 2026-09-17;
superseded by the consolidated downstream application, 2026-09):

| Artifact | Repository | Visibility | Deployment |
| --- | --- | --- | --- |
| **The template (the product)** | `provelopment-foundation` | public | **none** — Git hosting is the distribution surface |
| **The live site (a downstream implementation)** | a private downstream application (for example `provelopment-web`) | private | the live domain (e.g. `foundation.provelopment.com`) |

Dependency direction is **template -> downstream application** (historical, repository-shaped
material; see *Repository-shaped adoption shapes* above). A downstream application is an ordinary
downstream clone whose `origin` is its own private repository and whose `foundation` remote is the
template. One downstream application may serve **several Spokes** — several complete website/domain
contexts, each with its own Site contexts — as separate site profiles;
that is a property of the downstream application, not of Foundation. The public template remains
fully and independently usable without any downstream application: adopting it never requires one.

In the **installation** model the same independence is stated more strongly, and it is the current
contract: an installation is autonomous — no parent, no sibling, no clone relationship, no fleet,
and no runtime relationship to the product repository or to any other installation.

### Procedure actually followed (FS1)

1. **Protect production first.** Record the live site's baseline: routes, identity,
   navigation, asset names **and byte sizes**, and the deployed commit.
2. **Create the site repository** (private, no starter files) and push the *existing*
   history into it - never `git init`, never a squashed bootstrap commit.
3. **Repoint the working clone**: rename `origin` -> `foundation`, add the new private
   repository as `origin`, then `git push -u origin main`. Push **one** migration
   baseline tag; never push the upstream release tags.
4. **Have the owner re-point the provider project** to the new repository (see
   `deployment.md`), keeping the existing project, domains and settings.
5. **Verify production is sourced from the new repository** - the provider reports the
   deployment against the new repo, and the live site matches the recorded baseline
   (compare payload sizes, not just status codes).
6. **Only then de-bloat the public repository**, on a branch, and land it by PR once
   the provider no longer builds from it. De-bloating removes *site identity and
   content*, never reusable capability.
7. **Release the template** with an immutable tag, and record in the site's own governance record
   that it is a downstream adopter of that release.
