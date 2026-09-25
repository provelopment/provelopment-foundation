# Agent Operating Rules — working inside a Foundation adopter

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-25.1`
> **Procedure validated against:** Foundation template release `v2026.09.17-foundation-generic-template` (`b9f7a18`) + the current public/private topology (the public reusable product `provelopment-foundation`, and the live Foundation site implemented as a site profile in the private downstream `provelopment-web`)
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## Authority chain

When instructions conflict, apply the highest applicable document:

> **Human/owner instruction → governing-agent task instruction → project directive →
> repository agent rules → these operating rules → existing convention/plans.**

A more specific document outranks a more general one for its own scope. If two
documents genuinely conflict, apply the higher one and **record the apparent
conflict** in the project's knowledge record — do not silently choose.

## Boundaries

- Work only inside the project you were given.
- Business-level rules (what may/may not be modified, which directories are
  adopter-owned) come from the project's own rules/directive — follow them exactly.
- **Never modify another repository** as part of work in this one.

> **Boundary honesty:** a working-directory boundary expressed in Markdown is a
> **procedural** restriction, not a technical sandbox. Never claim to the owner,
> customer or another agent that these instructions technically prevent access.
> The governing agent should also restrict the tool environment as far as it can —
> that is the practical limit. If you need information from outside the project,
> obtain it from the project's own documentation or stop and ask.

## Access boundary — authorised evidence

Work from what the project and its **public** behaviour can prove. Unless the owner
explicitly grants more in a later instruction, the authorised sources are:

- the local project/workspace and **local Git**;
- **GitHub**, through the authorised Git/GitHub tooling (repository, branches, PRs,
  commits, checks, Actions runs);
- **unauthenticated public HTTP** access to the project's own public websites, when
  live behaviour must be verified.

You are **not** authorised to access, or attempt to access: provider APIs, provider
tools or connectors, the provider dashboard, provider deployment records, provider
logs, provider environment variables, provider project settings, DNS-provider or
domain-registrar accounts, cloud consoles, or any other external infrastructure or
account system. Do not probe whether such access happens to be available, do not treat
an `Unauthorized` reply from a provider tool as verification, and do not ask for
credentials or access.

**Report evidence by class — and never upgrade a class.**

| Class | Evidence | Report it as |
| --- | --- | --- |
| 1 | reviewed commit, merge commit, branch/`main` state, clean tree | Git/local evidence |
| 2 | PR state, commit/status checks, Actions results, externally supplied status checks **visible through GitHub** | GitHub evidence |
| 3 | publicly reachable URLs, HTTP status/redirect behaviour, rendered content, public metadata/canonical/sitemap, public browser/runtime behaviour | **production behaviour verified publicly** |

- A check named after a platform (`Vercel`, `Vercel Preview`, or similar) may be reported
  **only as a GitHub-visible check result**. Never follow it into the platform, and never
  query the platform separately.
- Say **"production behaviour verified publicly"** when the public site serves the merged
  behaviour. Never claim **"provider deployment record verified"** unless the owner has
  explicitly granted provider access in a later instruction.
- **Provider-account work is owner/operator work.** Creating or configuring a provider
  project, DNS changes, deployment promotion/rollback at the traffic level, and any
  reading of provider records are performed by the account owner (or a human operator
  holding provider credentials) — not by a coding agent. Prepare the exact action and
  hand it over (`deployment.md`, `troubleshooting.md` entry 8).
- Absence of provider access is **intentional, not a blocker**: finish the task with
  classes 1–3, and state plainly what could not be proven and why.
- **Never expand this boundary yourself.** If a task appears to require provider access,
  stop and ask the owner.

## Preserve business-owned material

- Never overwrite, "tidy" or regenerate adopter-owned content, configuration,
  branding or business artwork.
- Never replace an adopter's configuration with the platform's example.
- When reconciling an upgrade, preserve business intent and record every deliberate
  override (see `foundation-upgrade.md`).

## No speculative architecture

- Prefer configuration, content and assets before source modification
  (`site-customization.md`).
- Do not introduce new architecture, dependencies, abstractions or infrastructure
  because they *might* be useful. Add the smallest thing that satisfies the
  requirement.
- Do not fork platform code to solve an adopter problem; escalate instead.

## Configuration-first behaviour

- Change behaviour through validated configuration.
- A schema/validation failure is a loud, intended signal — fix the config, never
  the schema.

## Validation requirements

- Run the project's gate before claiming completion (`validation.md`).
- **A check not run cannot be reported as passed.**
- Investigate failures by class (implementation / test / config / deployment /
  infrastructure) before rerunning anything.

## Documentation requirements

- Update the project's documentation in the **same task** as the change.
- Record problems and discoveries immediately, with a classification, so the
  knowledge outlives the conversation.
- Keep cross-references correct; do not duplicate whole documents — point at the
  authoritative one.
- **One source of truth per procedure.** Your `instruction-manuals/` copy is
  distributed: never edit it locally.

## Escalate genuine Foundation deficiencies

If the work reveals a platform problem:

1. **Do not silently modify the platform**, and do not patch it inside an adopter task.
2. Record: the problem, a reproduction, affected sites, whether it is platform-wide,
   severity, whether configuration can solve it, and whether a platform change is
   genuinely required.
3. Separate **adopter-specific issue** from **platform issue**.
4. Recommend, then stop. A platform change is a separate, owner-approved task.

Escalate rather than improvise when: platform source must change beyond an approved
upgrade; another repository or infrastructure must change; a requirement affects
public copy, legality or claims; or anything is destructive or irreversible.

## Temporary artifact cleanup

- Remove temporary scripts, probes and scratch files before committing.
- Never commit build output, caches, secrets, `.env*` files, or machine state.
- Leave the tree as you would want to find it.

## Final evidence reporting

When you stop, report:

- what changed (paths + commits);
- each gate and its actual result;
- anything not run, and why;
- the **evidence class** behind each item (Git/local · GitHub · public behaviour) and, where
  relevant, that no provider-account evidence was used or is claimed;
- the current Foundation baseline and manual revision;
- preserved vs reconciled material;
- open issues and known deficiencies (classified);
- **the exact recommended next step**.

A future agent should be able to continue from your report plus the repository —
without your conversation.
