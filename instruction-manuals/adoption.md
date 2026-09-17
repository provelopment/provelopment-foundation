# Adoption — creating a new Foundation-derived project

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-17.1`
> **Procedure validated against:** `main` @ `ccc29a5` (runtime commit `1114759`)
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
> **Master authority:** Provelopment root project — `.project/deployment-info/instruction-manuals/`
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## What this manual is for

Creating a **new** Foundation-derived project — a programme demo (Demo 3, Demo 4)
or a real customer site — from an **approved Foundation release**, so that the new
project starts with the platform *and* the operating knowledge it needs.

This manual is generic. It is not specific to any one business or directory name.

## Adoption shapes

A Foundation-derived project is created in one of two shapes. Choose deliberately — both are
supported, and neither is a fork.

| | **Vendored** | **Direct downstream clone** |
| --- | --- | --- |
| Shape | the Foundation lives under a `platform/` directory inside the project | the project **is** a Foundation checkout, re-branded and re-configured |
| Use it when | one repository hosts **several** sites, or the platform and business layers must be held apart with a divergence check | the project is **one site** and its owner wants the Foundation in place, with no vendoring layer |
| Foundation arrives as | a committed snapshot under `platform/`, reproduced into each site | the repository's own tree at the Foundation commit |
| Source record | `platform/SOURCE.md` | `FOUNDATION_SOURCE.md` |
| Upgraded by | `foundation-upgrade.md` — compare → apply | `foundation-upgrade.md`, treating the repository root as the platform tree |
| Worked example | `02.demo-businesses` (several sites on **one shared** snapshot) | `03.dot-com` (single commercial site) |

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

## Prerequisites

- An **approved Foundation release tag** (annotated, e.g.
  `v<YYYY.MM.DD>-foundation-<slug>`) and its commit.
- Git, Node.js 22+, pnpm 11, GitHub CLI (`gh`) with `repo` scope.
- Vercel access for deployment (owner-managed).
- `foundation-upgrade.md` describes the same mechanics for an **existing** project.

> **Never** run adoption steps inside an existing Foundation or Foundation-derived
> repository. Adoption creates a **new, independent** repository.

## Lifecycle

```text
Foundation (approved release)
    ↓
new project repository (independent Git repo)
    ↓
instruction-manuals distributed
    ↓
project configuration (identity, navigation, CTA, presentation)
    ↓
business content + assets
    ↓
first green validation
    ↓
deployment
    ↓
live verification
    ↓
handoff record
```

## Procedure

### 1. Create the project directory and repository

Create the directory outside every existing repository, then initialise it as its
own Git repository with its own remote. One project = one repository = one
deployable unit (plus, if the project hosts several sites, one directory per site).

### 2. Adopt the Foundation release

Vendor the approved Foundation release as a **committed snapshot** under a
platform directory (a compare-then-apply helper is the safe mechanism — see
`foundation-upgrade.md` §10). Do **not** invent a package/dependency mechanism;
adoption is a committed snapshot by design.

### 3. Record the Foundation baseline

Create the project's source-of-record file (conventionally `platform/SOURCE.md`)
recording:

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
identity, `site.url`, contact, navigation, enabled features, CTA, theme.
Follow `site-customization.md`. Everything here is **adopter-owned**.

### 7. Establish business-owned directories

Create the directories that hold business material — content, dictionaries, and
business imagery/artwork. These are never overwritten by platform reproduction
(see the ownership model in `foundation-upgrade.md`). Wire business artwork
deliberately (see `branding-and-assets.md`).

### 8. Reproduce platform-owned files and run the first green gate

Reproduce the platform identity into each site, then run the full gate:

```bash
pnpm install
pnpm setup        # reproduce platform-owned files into each site
pnpm validate     # fidelity/divergence → typecheck → lint → routes → build
pnpm test:browser # browser/accessibility matrix
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

## Downstream clone bootstrap (single-site)

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
10. **Record provenance** — `FOUNDATION_SOURCE.md` (source repository, canonical URL, exact
    SHA/tag, acquisition date and method, downstream repository, remote topology, adoption
    shape, adoption status).
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
14. **Re-verify the inherited tests** — the Foundation's **reference-site** suites test the
    Foundation's *own* reference site: exclude them from the project gate, expose them as
    separate commands, and add the project's own acceptance tests.
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

- [ ] independent repository with its own remote;
- [ ] approved Foundation release vendored, with the exact commit recorded;
- [ ] `instruction-manuals/` present and byte-identical to the distributed package;
- [ ] project rules + brief + directive present;
- [ ] adopter configuration validates;
- [ ] business-owned directories established;
- [ ] `validate` and browser matrix green;
- [ ] deployment live and verified (or explicitly handed to the owner);
- [ ] handoff record written.

## Never

- Never adopt an unapproved or unverified Foundation revision.
- Never place business content, branding or configuration where platform
  reproduction will overwrite it.
- Never configure DNS/Vercel/GitHub settings on the owner's behalf without an
  explicit instruction.
- Never claim a green gate that was not actually run (see `validation.md`).
- Never push the upstream Foundation's release tags into the downstream repository — a
  downstream project owns only its own version history.
- Never acquire the Foundation from a local sibling copy when the canonical GitHub repository is
  reachable; the GitHub clone is the auditable acquisition.
