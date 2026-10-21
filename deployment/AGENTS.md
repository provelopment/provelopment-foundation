# Deployment agent contract

This file is authoritative for anyone — human or agent — working on **this deployment**.

This directory is this deployment's ownership capsule. Read `deployment/README.md` for what each part
of it is for; this file states the boundary you must not cross.

## HOME

```text
deployment/
```

## WRITE

```text
deployment/**   only
```

Nothing outside this directory is yours to change. If a task appears to require a write outside it,
that is a stop condition, not an obstacle to work around.

## READ

- everything under this capsule (`deployment/**`);
- the common Foundation/system files you need in order to understand and use the platform: the
  application code under `src/**`, the platform contracts and manuals (`ARCHITECTURE.md`,
  `CUSTOMIZING.md`, `DEPLOYMENT.md`), the generic test tree, and the root build configuration.

Reading Foundation code is expected — it is how you learn the system you consume. It does not make it
yours to edit.

## NO ACCESS

```text
another deployment
```

Do not read it, do not use it as a fixture, a reference implementation, an example or a source of
content. This capsule is one deployment; a second deployment is outside your scope by definition.

## NO WRITE

```text
src/**                    the Foundation application
tests/**                  the generic Foundation test tree
scripts/**                platform scripts
package.json / lockfiles  dependencies and manifests
next.config.ts / vitest.config.mts / tsconfig.json / eslint.config.mjs / .github/**
                          root build, CI and quality configuration
platform manuals          ARCHITECTURE.md, CUSTOMIZING.md, DEPLOYMENT.md, README.md, *_ASSETS.md
shared modules            anything imported by more than this deployment
private Web               anything private to the owner or to another deployment
another deployment
```

## Working rules

1. **Scratch work goes in `deployment/.test/` — and it is EPHEMERAL.**
   `deployment/.test/**` is the only normal deployment-local work area, so create it locally the first
   time you need it, with your normal file tools — never by committing a placeholder (no `.gitkeep`,
   no sample, no report, no screenshot: nothing inside it is ever committed). Use it for temporary
   fixtures, screenshots, browser artifacts, generated reports, throwaway copies, probes, temporary
   transformations and your own scratch notes.
   **Before you report a task complete, delete every file and directory you created beneath
   `deployment/.test/**`.** The state you leave behind is:

   ```text
   deployment/.test/    empty
   ```

   or `.test/` itself absent — also fine, because the directory is ignored and can be recreated.
   Git ignoring a file is never permission to abandon it: do not leave task artifacts behind because
   they would not be committed, and do not solve the problem by putting scratch material somewhere
   else in the repository.
2. **Clean up only your own scratch.** That cleanup covers exactly this deployment's
   `deployment/.test/**` and nothing more. Do not perform broad repository cleanup, do not use a
   command capable of deleting arbitrary ignored files elsewhere, and never remove another
   deployment's files, a Foundation cache, project-global scratch, user files or any ignored path you
   did not create. If it is not beneath this capsule's `.test/`, it is not yours to delete — leave it
   and, if it looks wrong, report it.
3. **Durable deployment tests live in `deployment/tests/**`.** A test belongs here when it answers a
   question about *this* deployment: its own sites, languages, publications, routes, copy, assets,
   structured data and acceptance.
   **A test may READ this capsule; it may never use it as writable fixture space.** The authored state
   (`spokes.json`, `efs/manifest.json`, the EFS capsule's Page sources, dictionaries and assets, and
   each Spoke's `site.config.json`, `config/**` and `content/assets/**`) is the owner's content, and
   a test that mutated it would be editing the website — cleanup is best-effort and residue is damage
   (ISO-C1). A test that needs writable deployment state — planting a page, adding a dictionary, editing
   configuration — takes a DISPOSABLE COPY of the selected deployment
   (`tests/support/disposable-deployment.ts`) and plants its fixtures there; the run proves this capsule
   unchanged before and after (`tests/setup/production-state-integrity.ts`). Nothing in `deployment/tests/**`
   may depend on successful cleanup to protect production content.
4. **Never copy a generic Foundation test into `deployment/tests/**`,** and never restate a platform
   contract here. Platform behaviour is proved once, by the Foundation. A deployment test that merely
   repeats a generic assertion adds maintenance, not confidence.
5. **Author content in the content system; never change production content to satisfy a stale test, and
   never use the owner's content as an expectation.**
   When an assertion and the owner's file disagree, the file wins: update the assertion. Copy is
   never adjusted so that a check passes.
   **Tests protect behaviour and supported contracts, not authored content or implementation wording
   (M21).** A deployment test proves the durable contract: the source validates, the route resolves, the
   response succeeds, exactly one h1 exists where required, the rendered document is structurally valid,
   the Spoke/Site/locale context is right, canonical origin and hreflang are right, the asset namespace
   is the owning one, internal links resolve, configured controls appear, and foreign coordinates do not
   resolve. It must NOT compare a rendered page against authored paragraph text, and it must NOT prove
   ownership with a title — two Spokes may legally share one; isolation is proved by runtime context,
   origin, route ownership and asset namespace. Nothing in `deployment/tests/**` parses production
   Markdown or prose either: the application owns that parser (see `AGENTS.md` §14). Exact strings stay
   correct for TEST-OWNED SYNTHETIC FIXTURES, whose text the test itself authored.
6. **A change to this deployment must not require editing Foundation.** Configuration, dictionaries,
   content and this capsule's tests are the levers.
7. **If you find a genuine Foundation defect, STOP and report it.** Name the file, the behaviour and
   the evidence. Do not repair the platform from inside this deployment — and never "fix" a platform
   defect by escaping this write boundary (a copy of platform code, a patched import, a local fork of
   a shared module).
8. **Record nothing outside your boundary.** Provenance, decisions and notes about this deployment
   belong in this capsule.
9. **Verification is proportional to blast radius** (`AGENTS.md` §15 — the ONE authority). For work in
   this capsule, in one line each:
   - an authored PAGE, DICTIONARY or ordinary artwork edit proves the authored-data contract: the
     deployment's own structural tests, the generated checks and a production build. Not the browser
     acceptance matrix — prose and artwork do not change shell or runtime behaviour.
   - a CONFIGURATION, manifest, hostname, publication, locale or asset-role change proves the full
     deployment gate, including deployment browser acceptance.
   - a change that mixes authored data with configuration, or that leaves any path unclassifiable,
     escalates to the stronger scope. `content` never applies to a mixed change.
   CI applies exactly this: `scripts/ci/change-scope.mjs` routes an authored-data-only change to the
   bounded `content` route, which is deliberately narrower than `deployment`.

## Provenance

`deployment/foundation-baseline.json` records the immutable Foundation RELEASE this deployment
deliberately adopts — the release tag, the source commit and tree it was cut from, the release content
policy and the normalized platform-content digest — never a moving branch. Treat it as the version of
the platform this site is known to work against; a Foundation update is a deliberate, reviewed
adoption, not an automatic pull, and `deployment/tests/unit/foundation-baseline.test.ts` keeps an
invalid record from entering this deployment.
