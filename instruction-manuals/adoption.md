# Adoption — creating a new Foundation-derived project

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-16.2`
> **Applicable Foundation baseline:** `v2026.09.11-foundation-p6-3c-banner-sidebar-cta`
> **Foundation commit:** `f5c94da`
> **Master authority:** Provelopment root project — `.project/deployment-info/instruction-manuals/`
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## What this manual is for

Creating a **new** Foundation-derived project — a programme demo (Demo 3, Demo 4)
or a real customer site — from an **approved Foundation release**, so that the new
project starts with the platform *and* the operating knowledge it needs.

This manual is generic. It is not specific to any one business or directory name.

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
