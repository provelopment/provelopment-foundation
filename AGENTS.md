# AI Agent Instructions

## 1. Mission

This project is an open-source, re-brandable web platform for helping small
businesses establish and maintain a web presence.

The project begins as a frontend-only Next.js application but is deliberately
architected so that backend capabilities can be introduced incrementally.

The repository is also intended to serve as a reusable template. Downstream
businesses should be able to customize branding, content, configuration, and
site behavior while retaining the ability to incorporate improvements from
the upstream Provelopment project.

Agents must preserve this objective.

---

## 2. Before Making Changes

Before modifying code:

1. Read this file.
2. Read `ARCHITECTURE.md`.
3. Inspect the relevant existing implementation.
4. Identify which architectural boundary owns the change.
5. Prefer extending existing capabilities over creating duplicate ones.
6. Determine whether the change affects downstream customization or future
   upstream synchronization.
7. Run the relevant validation commands after making the change.

Do not make architectural changes based only on assumptions.

---

## 3. Architecture

This project follows Hexagonal Architecture / Ports and Adapters principles.

The major application boundaries are:

- `src/app`
- `src/components`
- `src/core`
- `src/application`
- `src/adapters`
- `src/config`
- `content` (deployment-owned: the AUTHORING ROOT's content tree — a Spoke's own root in this
  repository's capsule (`deployment/spokes/<spoke>/content/**`), or a single `content/` tree at the
  Installation root in a legacy implicit installation)
- `public`
- `tests`

See `ARCHITECTURE.md` for the authoritative architectural description.

---

## 4. Dependency Direction

The intended dependency direction is:

`core`
↓
`application`
↓
`adapters`

Presentation and framework code compose these capabilities.

Rules:

- `core` must remain framework-independent.
- `core` must not import from `application`.
- `core` must not import from `adapters`.
- `core` must not import from React or Next.js.
- `application` may depend on `core`.
- `application` must not depend directly on concrete adapters.
- `adapters` may depend on external technologies.
- `src/app` is a Next.js framework boundary and should remain thin.
- `src/components` contains presentation concerns and should not contain
  domain business rules.

When uncertain where code belongs, stop and inspect the existing architecture
rather than placing it in the nearest convenient directory.

---

## 5. Framework Isolation

Next.js is an implementation technology, not the domain architecture.

Avoid allowing:

- Next.js APIs
- React-specific behavior
- browser APIs
- Vercel-specific APIs
- Tailwind-specific concerns
- external SDKs

to leak into framework-independent core logic.

Framework-specific code belongs at the appropriate outer boundary.

---

## 6. Configuration and Re-brandability

The platform is intended to be re-branded and customized by downstream users.

Common downstream customization should prefer configuration and content over
modification of platform logic.

Potential customization areas include:

- business name
- logo
- colors
- typography
- navigation
- contact information
- social links
- SEO defaults
- content
- enabled features

Do not hard-code any specific business's information — including the
upstream project's own branding — into reusable platform components.

When implementing a feature, consider whether it should be:

1. platform behavior,
2. configuration,
3. content,
4. or a downstream customization.

Keep those concerns separate.

---

## 7. Content

Human-authored content should remain separate from application implementation.

**One human-facing content area.** Everything a normal user authors as website
content lives in the deployment's content tree: `content/` relative to the AUTHORING
ROOT that owns it — the Installation root in a legacy implicit installation, or a
SPOKE's own root in the explicit form this repository uses
(`deployment/spokes/foundation/content/` and `deployment/spokes/germany/content/`
here). Inside it live the pages (`content/pages/markdown`, `content/pages/json`) and
the artwork a site owner replaces (`content/assets`), and `content/README.md` is the
map that answers "where do I edit my website?". Every supported asset-source layout
is byte-protected (`.gitattributes`), so authored artwork is stored verbatim wherever
it is authored. Authored
content is never placed under `config/`: configuration changes how the site *behaves*,
content is what it *says*. Equally, unrelated technical configuration is not moved into
`content/` merely to make the tree uniform.

**If authored content has its own URL, it is a page.** There are no author-facing
collections: offerings, portfolio items, articles, testimonials, policy documents and
"About" pages are all pages, authored in the same two modes and served by the same ONE
route. Content that only ever appears inside another page (quotes, cards, statistics,
FAQ rows) is authored *in* that page — as Markdown, or as declared sections in the JSON
mode — never as a separate filesystem collection. A page's route path mirrors the folders
it is authored in, and the rule for it is declared once (`@/core/page-route-path`); adding
one is not a reason to add a route file.

**The JSON mode is a declarative vocabulary, and the vocabulary is the extension point.**
A section type, a property or a presentation option exists only if `@/core/page-document`
declares it; a document that names anything else is refused. Extending the mode means
extending that ONE module (schema, types and documented vocabulary) and mapping the new
type in the ONE composer (`@/components/site/page-document-content.tsx`) — never adding a
route, a second renderer or a second Markdown policy.

**The page title is a page's only level-1 heading, in both modes.** A heading authored
inside a body is rendered RELATIVE to that title (`# Services` → `<h2 id="services">`, up to
`<h6>`), so authored Markdown stays ordinary — `#` is still how a section is written, no
page is refused and no heading is removed — while no path can emit an authored `h1`. The
mapping is declared once in `@/core/markdown-policy` and enforced twice: the renderer shifts
the level and `h1` is absent from the allowlist.

Do not embed large amounts of business copy directly into reusable components.

Prefer the established content system once it exists.

Content changes should generally not require changes to application logic.

When a change alters what a user can author or where they author it, update the
author-facing README in the same change, at the standard in §26.

---

## 8. UI Components

Reusable UI components belong under `src/components`.

Prefer:

- semantic HTML
- accessible interactions
- keyboard support
- responsive behavior
- composability
- design tokens
- explicit component APIs

Avoid:

- duplicated UI implementations
- unnecessary page-specific components
- business logic inside presentational components
- arbitrary hard-coded styling when a design token exists

Do not introduce a component abstraction merely because two lines of markup
look similar. Abstract when there is a meaningful reusable concept.

---

## 9. Configuration Before Duplication

Before creating a new hard-coded value, ask whether it represents:

- configuration,
- content,
- a design token,
- a domain concept,
- or a true implementation constant.

Do not scatter branding values throughout the application.

---

## 10. AI-Generated Changes

Agents must make the smallest coherent change that solves the requested
problem.

Do not rewrite unrelated code.

Do not perform broad refactors unless explicitly requested or required to
preserve architectural integrity.

Do not introduce dependencies without a clear reason.

Before adding a dependency, consider whether the capability can be implemented
using existing platform functionality.

---

## 11. Dependency Discipline

Prefer the smallest dependency set that provides the required capability.

When introducing a dependency:

1. Identify why it is required.
2. Confirm it is compatible with the current Next.js version.
3. Confirm it does not violate architectural boundaries.
4. Consider whether the capability can remain replaceable.
5. Update documentation when the dependency materially changes development
   behavior.

Do not install packages merely because they are popular.

---

## 12. Server and Client Components

Prefer Server Components by default where supported by Next.js.

Use Client Components only when client-side behavior requires them, such as:

- browser APIs
- local interactive state
- event-driven UI
- client-only libraries

Do not add `"use client"` without a reason.

Keep client boundaries as small as practical.

---

## 13. Data and Backend Evolution

The current application is frontend-only.

Do not introduce a database, authentication system, API server, or other
backend infrastructure unless specifically requested.

However, when designing application behavior, preserve the ability to introduce
backend infrastructure later.

Prefer application ports and adapters over direct coupling to infrastructure.

---

## 14. Testing

Tests should verify behavior and architectural contracts where practical.

At minimum, maintain confidence in:

- TypeScript
- linting
- production build
- critical user behavior

Do not write tests solely to increase a coverage number.

Prefer tests that protect meaningful behavior and architectural boundaries.

### Tests protect behaviour and supported contracts

A test must not fail merely because incidental authored content or implementation wording changed:

```text
page prose changes
a heading is renamed
two websites use the same page title
a comment is reworded
documentation prose is rewritten without changing its contractual meaning
an allowed graphic is replaced
an implementation expression is refactored without changing behaviour
```

Exact strings are appropriate only when the string itself IS the contract:

```text
route segments · schema keys · configured IDs · HTTP values · protocol/header names
test-owned fixture values · explicit accessibility values whose exact wording is itself required
```

**A deployment's authored pages are not an acceptance input.** A deployment test proves what is durable:
the source is valid, the route resolves, the response succeeds, exactly one h1 exists where required, the
rendered document is structurally valid, no runtime error occurs, the correct Spoke / Site / locale
context is selected, the canonical origin and hreflang are correct, the asset namespace is the owning
one, the rendered internal links resolve, the configured controls appear, and unknown or foreign
coordinates do not resolve. It must NOT compare a rendered page against authored paragraph text, and it
must NOT prove ownership with a title — two Spokes may legally use the same one. Isolation is proved
structurally: resolved runtime context, hostname, canonical origin, Site code, resource root, asset
namespace, resolver result.

**Tests do not parse production content.** The application owns the parser and the validators; test-owned
fixtures prove THEM. A support module may describe a rendered document's SHAPE — heading levels, the
declarative composer's section markers, whether a link resolves — and nothing else
(`deployment/tests/support/rendered-structure.ts`). There is no second authoring interpreter in a test
suite.

Synthetic fixtures remain exact where the TEST authored the text:

```text
test-owned fixture text    → may be asserted exactly
real deployment page prose → must never be an expectation
```

---

## 15. Validation

After meaningful changes, run the applicable checks.

The expected baseline commands include:

```text
pnpm exec tsc --noEmit
pnpm lint
pnpm build
````

When tests exist, run the relevant test suite as well.

Do not claim a change is complete if the relevant validation has not been
performed.

### Verification is proportional to blast radius

> Verification effort is proportional to the plausible operational blast radius of the change. The
> objective is the smallest sufficient proof, not the largest available test suite.

This is not permission to cut corners: **under-testing is wrong, and over-testing is wrong too.** Tests
consume developer time, agent time, tokens, CI compute, browser runtime and human review time. Spend
those resources where they materially increase confidence.

Two rules follow, and both are mandatory.

**A verification result proves ONE source tree.** If that tree changes afterwards, classify only the
DELTA since the last verified tree. A README wording correction after a green runtime gate needs the
documentation checks for that delta — not a re-run of a thousand runtime and browser assertions.
Conversely, a later change that CAN affect previously proved behaviour must re-run the affected proof,
and unknown impact escalates conservatively.

**Iteration and the final gate are different things.** During implementation, run the nearest relevant
test or the smallest affected subsystem gate after each meaningful edit. Run the complete local gate
ONCE, when the coherent candidate is ready. At PR head, exact-head CI is the final merge proof; do not
reproduce the same expensive gate locally unless the tree changed in a way that can invalidate it, or a
failed gate is being re-verified after a fix.

### Change classes

| Change class | Examples | Normally prove |
| --- | --- | --- |
| Documentation only | README wording, instructional prose, documentation comments, spelling, non-executable diagrams | `git diff --check`, plus documentation integrity/parity checks where they exist. Do NOT automatically install dependencies, build, run Vitest or start browsers. |
| Authored website content | Markdown pages, JSON page documents, locale dictionaries, ordinary authored artwork | Source format/schema validity, the deployment-owned structural tests, asset integrity where applicable, and a production build. Do NOT run the whole browser matrix merely because prose or artwork changed. |
| Deployment configuration, routing or runtime-facing authored structure | `site.config.json`, `spokes.json`, hostname behaviour, locale/site/location declarations, asset-role configuration, deployment acceptance code | The full DEPLOYMENT gate, including deployment browser acceptance where relevant. |
| Foundation/runtime code | Application code, the generic test tree | The FOUNDATION gate: generic Foundation tests, generic browser scenarios, the production shared-host proof (`tests/browser/shared-host-production.mjs` — a real build and server, required, never replaced by a development matrix), and the bounded real-deployment canary. |
| Shared, mixed, dependency, security, release or CI infrastructure | Manifests, lockfiles, build/CI configuration, platform scripts, the shared harness, this file | FULL. |
| Unknown or unclassifiable | Anything you cannot place above | FULL. |

Failure is always conservative: **uncertain means prove more, never silently prove less.** The
machine-readable form of these classes is the CI classifier — `scripts/ci/change-scope.mjs`, whose
`OWNERS`, `SCOPES` and `ROUTE_COMMANDS` state each route's contract, and whose unknown-path fallback is
the complete gate. Deployment-specific consequences are in `deployment/AGENTS.md`; browser-specific
escalation is in `tests/browser/README.md`.

---

## 16. Git Discipline

Keep commits focused and understandable.

Prefer commit messages following conventional commit terminology, for example:

* `feat:`
* `fix:`
* `docs:`
* `refactor:`
* `test:`
* `ci:`
* `chore:`

Do not mix unrelated changes into a single commit.

Do not commit:

* secrets
* API keys
* credentials
* local environment files containing secrets
* generated dependency directories
* build output

---

## 17. Upstream / Downstream Compatibility

The upstream project is intended to evolve over time while supporting
downstream customized websites.

When making a change, consider whether the change will be:

* platform-level,
* configuration-level,
* content-level,
* or downstream-specific.

Avoid modifying platform files merely to implement a customization that could
be represented through configuration or content.

When practical, preserve clean separation between upstream-owned platform
capabilities and downstream-owned customization.

---

## 18. Do Not Fight the Framework

Use Next.js conventions where they provide a clear benefit.

Do not create custom abstractions merely to make the framework look like a
different framework.

Architecture should isolate meaningful business/application concerns, not
eliminate every framework convention.

---

## 19. Do Not Over-Engineer

The architecture is designed for extensibility, but extensibility does not
justify speculative abstractions.

Do not create:

* empty interfaces without a real purpose
* unnecessary factories
* unnecessary dependency injection containers
* premature repositories
* speculative services
* generic abstractions without a concrete use case

Prefer simple code until complexity is demonstrated.

---

## 20. Change Strategy

When implementing a feature:

1. Understand the requested behavior.
2. Locate the appropriate architectural boundary.
3. Inspect existing related code.
4. Reuse existing capabilities where appropriate.
5. Implement the smallest coherent change.
6. Preserve architectural boundaries.
7. Validate the change.
8. Review the resulting diff.
9. Document important architectural decisions.

---

## 21. Stop Conditions

An agent should stop and request clarification rather than guessing when:

* requirements conflict,
* an architectural boundary must be violated,
* a secret or credential is requested,
* destructive repository operations are required,
* a dependency choice has significant architectural consequences,
* the requested behavior contradicts existing documented requirements,
* or the correct implementation cannot be determined from the available
  context.

Do not silently invent requirements.

---

## 22. Source of Truth

When instructions conflict, use this priority:

1. Explicit current user request
2. Repository-specific instructions
3. `ARCHITECTURE.md`
4. Existing implementation and established conventions
5. Framework conventions
6. General engineering preference

When a higher-priority requirement conflicts with a lower-priority convention,
follow the higher-priority requirement and document the consequential change
when appropriate.

---

## 23. Preserve Context for Future Agents

When implementing significant architectural decisions, leave useful context
in:

* code structure,
* names,
* documentation,
* tests,
* and focused commit messages.

Do not rely on an AI agent remembering decisions from a previous conversation.

The repository must contain enough information for a new agent to understand
the project independently.

---

## 24. Internationalization

Every public URL is `/<site>/<locale>/<route>`: the site code is the first segment and the locale the second, served by the ONE catch-all route. Requests
without a locale prefix are redirected by `src/proxy.ts` based on the
`NEXT_LOCALE` cookie, the `Accept-Language` header, and finally the
configured default locale.

Rules:

- Never hard-code user-facing copy in components. Interface strings belong
  in the deployment's `config/i18n/<locale>.json` (the capsule's
  `deployment/spokes/foundation/config/i18n/` in this repository) and must validate against the Zod
  dictionary schema.
- New routes must be added under `src/app/[[...segments]]` (the ONE catch-all route); a
  static metadata segment may NOT sit under a catch-all (Next.js requires the catch-all to be
  last), which is why the generated social image lives at `src/app/[site]/[locale]/`.
- Markdown content belongs under the deployment's
  `content/pages/markdown/<site>/<locale>/<slug>.md` (the
  declarative mode under `content/pages/json/<site>/<locale>/<slug>.json`). When a
  translation is missing, the default locale's content is served instead.
- Locale negotiation and related pure logic belong in `src/core` and must be
  unit-tested.
- Each locale must be statically renderable and represented in the sitemap
  with hreflang alternates.

Adding a locale must be possible through configuration, dictionaries, and
content alone.

---

## 25. JSON Configuration

The deployment's `site.config.json` (the capsule's `deployment/spokes/foundation/site.config.json` in this
repository) is the single source of truth for site settings:
branding, languages, contact details, social links, navigation, and
feature flags under `features`.

Rules:

- Read configuration only through the validated loader exports from
  `src/config`. Never import the deployment's `site.config.json` directly elsewhere.
- Every new configuration field requires a matching entry in
  `src/config/schema.ts` and unit coverage in the loader tests.
- New optional functionality should be expressed as a feature flag under
  `features`, consumed by its own adapter, and documented.
- Do not duplicate configuration values in components or constants; when a
  value seems missing, extend the schema and the JSON file instead.

---

## 26. Documentation Standard

Foundation is intended to be **practically accessible, not merely source-available**.
Documentation must be accurate and complete enough that an interested non-expert can
successfully perform the documented task — using the documentation alone, without
relying on knowledge the documentation never states.

In practice:

- **assume willingness to learn, not prior technical knowledge.** Never omit a
  required step merely because an experienced developer would consider it obvious:
  "edit the file and push it" is incomplete if the reader does not already know that
  saving is not publishing, so the commit and push steps are shown explicitly;
- **be concise, but operationally complete.** A reader should be able to finish the
  documented task from the page they are reading, with the commands and file paths
  spelled out;
- **document what exists.** Never describe an imaginary component, feature or path,
  and never promise a capability that is not implemented;
- **lead with the reader's goal**, then the mechanism: "where do I edit my website?"
  is answered by a map, not by an architecture description;
- **keep the human-facing entry points honest**: the deployment's `content/README.md`
  (`deployment/spokes/foundation/content/README.md` in this repository) is the map for
  authored content, and each authoring root explains its own mode in plain language.

When a change adds or alters a user-facing capability, update the documentation in the
same change and keep it at this standard.

## 27. Establishing a Foundation installation (B4B)
A **complete Foundation installation** is not the same thing as a Foundation release, and conflating them is
the mistake this section exists to prevent:

```text
complete installation = immutable release content (the platform) + an authored capsule + generated state
```

A release is deliberately **platform-only**: `scripts/release/release-content-policy.mjs` excludes
`deployment/**` because a release must never carry one site's authored material. Establishment therefore
takes the authored material as an input (`--seed`), and it never invents a site.

The ONE supported way to create an installation is:

```text
pnpm installation:establish --release <identity> --payload <dir> --seed <dir> --target <dir> \
                             --name <name> --repository <url>
```

Documented in `scripts/installation/README.md` (the operator surface) and
`instruction-manuals/adoption.md` (the manual that owns the workflow). The contract that decides what an
installation is made of is `src/core/foundation-installation/establishment.ts`; the mechanism is
`src/application/establish-foundation-installation.ts` with the adapters in `src/adapters/installation/**`.

Rules for agents:

- **`src/**` contains exactly two writers**, both in `src/adapters/installation/**`: the target root's
  guarded writer and the installation's operational-record store. Adding a third is an architectural
  decision, not a convenience; `tests/architecture/write-ownership-guard.test.ts` refuses it until somebody
  classifies it, with the ONE domain it owns.
- **Establishment writes only beneath the target root it was given** — never the source installation,
  another installation, the release directory, the seed, `01.web-01`, a home directory or global
  configuration. Temporary working state is either inside the target or a task-owned OS temp path that is
  removed afterwards.
- **Generated state is never authored state.** `operational-state.json` describes what an installation is
  RUNNING: it is ignored by version control, excluded from every release, and outside the authored-state
  manifest. Do not commit it, do not "fix" it by hand, and do not let a writer put it anywhere but inside
  the installation it describes.
- **A seed may be another installation's capsule, and then only its PORTABLE authored material travels.** The
  source's own `foundation-baseline.json` records an adoption that happened in THAT installation, so
  establishment excludes it from the portable seed — from the authored identity and from the target — and
  writes the new installation's record from the release being established; generated `operational-state.json`
  is refused outright. Never let a source installation's lifecycle records become a target's.
- **A release is never weakened to make establishment easier.** If establishment seems to need something a
  release does not carry, the authored material belongs in the seed.
- **No fleet, no control plane, no second installation.** An installation knows only itself and its own
  spokes; establishment must not acquire a relationship (a registry, a parent, a clone, a poll) it would
  have to keep. `src/**` may never import `scripts/**`, so the pure contracts live in core and the tooling
  consumes them.
- **A real Foundation defect is STOP and REPORT**, not a self-patch: a later immutable release is adopted.
- **ACTIVATION IS NOT HEALTH.** A durable event must describe an operation that actually happened, so
  establishment records a completed, verified, ACTIVATED installation — and no health claim, because it
  never evaluated any (`offline`, `healthEvaluatedAt: null`). `recordInstallationHealth` is the ONE
  transition that speaks about serving, and nothing may record `online` without a real evaluation. Do not
  advance a lifecycle transition merely because a later state would be convenient to reach, and never add a
  fake health probe, staging deployer or promoter to make a bootstrap look complete.
