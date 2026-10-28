# UI-10 Browser Validation (D5)

The committed behavioral/accessibility gate. It drives a real
headless Chrome/Chromium/Edge through **CDP** (Chrome DevTools Protocol) using
**Node's built-in WebSocket + fetch** — deliberately **no** Playwright/Cypress/
WebdriverIO/jsdom. It reuses the repository's established headless-Chrome/CDP
convention (previously run ad-hoc in Phases K/M2 and discarded; this is the
committed, reproducible version).

## Requirements

- A Chrome/Chromium/Edge binary on `PATH`-discoverable paths or `CHROME_PATH`.
  Local Windows checks Program Files; CI (ubuntu-latest) uses the preinstalled
  `google-chrome-stable`.
- Node >= 21 (global `WebSocket`).

## Run

```sh
pnpm test:browser              # everything: the Foundation's generic scenarios + the deployment's own
pnpm test:browser:foundation   # the Foundation's generic scenarios ONLY
pnpm test:browser:deployment   # the SELECTED deployment's own scenarios ONLY
node tests/browser/production-continuity.mjs   # the production-mode proof only (builds; not part of any route)
```

Every command runs this ONE harness with one ownership scope; the scope semantics live in
`tests/browser/scope.mjs` (`--scope foundation|deployment|all`, default `all`). An unknown or
malformed scope is refused — never silently widened — and `--scope deployment` is honest about an
empty surface: a repository with no deployment, or a deployment that ships no scenario, fails with an
explicit message instead of reporting success for having run nothing.

### Two owners, one framework

This harness is **Foundation-owned**: the runner, the CDP client (`cdp.mjs`), the dev-server
mechanics and every **generic** scenario, which runs against a disposable copy of the committed
synthetic deployment (`tests/fixtures/synthetic-deployment`) so no generic contract depends on — or
writes — the repository's own deployment. The generic scenarios are defined INSIDE this harness, so
they are never discoverable as deployment scenarios and a deployment-scoped run can never execute
one.

A **deployment's** own browser acceptance belongs to that deployment and lives in that deployment's
own tree — `tests/browser/` inside the root the deployment authority selected, i.e. the capsule's
`deployment/tests/browser/` in this repository. Ownership is FILESYSTEM-DRIVEN: this harness
discovers every `*.scenario.mjs` there and runs it, so a deployment ships expectations rather than a
second browser framework, and adding a deployment edits no list.

### Expected, not pinned: structure, context and configuration

A scenario owns EXPECTATIONS about a deployment, and the deployment's authored content is its DATA — so a
scenario proves what is durable and never quotes copy. For a real page: the route resolves, the response
succeeds, exactly one h1 exists where required, the document is structurally valid, the correct
Spoke/Site/locale context is selected, the canonical origin and hreflang are correct, the asset namespace
is the owning one, the internal links the page renders resolve, and the configured controls appear. For
isolation: the resolved runtime context, origin, Site path and asset namespace — never a title, because
two Spokes may legally share one.

A scenario must not parse production Markdown or prose, and must not read an authored page to derive an
expectation: the application owns that parser. Test-owned fixtures keep exact assertions, because the TEST
authored that text.

Two operational notes for probe authors:

- a probe travels inside a template literal, so an ESCAPED SLASH does not survive template evaluation —
  write string work (`indexOf`, `slice`) instead of a slash-escaped regex inside a probe;
- prefer asserting a data attribute, an `id`, a resolved context or a response status over a class list or
  a sentence.

The same rule is recorded in `AGENTS.md` (§14) and `deployment/AGENTS.md`.

### How much to run, and when (escalation)

Verification effort is proportional to blast radius (`AGENTS.md` §15 — the ONE authority). For this
harness that means:

- an authored page, dictionary or artwork edit does NOT need a browser scenario at all;
- a deployment/browser-owned change (routing, hostname behaviour, locale/site/location declarations,
  asset roles, a scenario or harness edit) runs the AFFECTED browser scope — the nearest scenario's
  `--scope`, then the owning project's browser suite once the change is coherent;
- a harness (`tests/browser/**`) or shared-surface change escalates to both scopes, because both owners'
  scenarios are driven by the same runner;
- anything unclassifiable runs both scopes. Uncertain escalates, never narrows.

During implementation, run the affected scope after each meaningful harness edit. The complete browser
matrix is a FINAL-gate proof: run it once on the coherent candidate, and let exact-head CI prove the PR
head. Do not re-run the matrix for a documentation-only delta afterwards.

### What the harness may write

That isolation is MECHANICAL, not conventional. Every MUTATING filesystem call this harness makes —
the configuration edits, the page and dictionary fixtures, the machine-readable report, the readability
screenshots — is routed through `tests/browser/scratch.mjs`, which refuses any target inside the selected
deployment (or the capsule directory), and any target outside the two domains this harness owns: the OS
temporary directory and this directory's ignored `.report/`. A regression that reached for the
deployment's shipped `site.config.json` would therefore fail loudly, naming the target, and write nothing.
READS are untouched — the shipped configuration a deployment scenario describes, the committed fixture
and the repository's own files are read directly, exactly as before.
`tests/architecture/write-ownership-guard.test.ts` proves both the guard's answers and that no mutating
call bypasses it.

#### Choosing where scratch state lands (R08 §8)

The temporary domain is not fixed to one machine's directory. A local run can keep every disposable
installation, browser profile and report inside a directory it has approved, using either supported
mechanism — both are generic, and neither is a path hard-coded into Foundation:

```text
FOUNDATION_TEST_SCRATCH_ROOT=<approved directory>   the explicit knob; `tests/browser/scratch.mjs` resolves
                                                    the guard and the report against it
TMPDIR / TEMP / TMP                                 the platform's own mechanism, which `os.tmpdir()`
                                                    honours — and therefore every scenario that creates its
                                                    installation with `mkdtempSync(path.join(os.tmpdir(), …))`
```

Verified rather than assumed: with `TEMP`, `TMP` and `TMPDIR` all set to an approved directory,
`os.tmpdir()` reported that directory and `mkdtempSync` created `…/probe-XXXX` inside it. Unset — the CI
case — behaviour is exactly what it always was.

### Generated asset state: one contract, two contexts

The artwork the scenarios FETCH is generated output, not authored state: `pnpm assets:sync` derives
`public/assets/**`, `public/spokes/<segment>/assets/**` — and the build-time catalog the runtime reads
(`src/config/generated/runtime-asset-catalog.json`) — from the ONE asset plan, and `pnpm assets:check`
fails if the mirror, the catalog and the plan disagree. Two consequences shape every browser run:

- **A namespace that carries a published inventory answers ownership from that catalog, never from disk.**
  The key's presence IS existence. A file materialised into such a namespace but absent from the catalog is
  invisible to the runtime, so the mirror and the catalog must describe the SAME Installation and the SAME
  files. An asset must be DECLARED and generated before the inventory is finalised; nothing may be added
  afterwards.
- **The two generations have different ownership contracts, so each scenario family must run against a
  compatible generated inventory.** The generic scenarios serve a disposable copy of the committed synthetic
  installation, which is LEGACY-shaped: its replaceable role artwork (the sidebar control icons among it)
  legitimately belongs to the SHARED platform namespace (`/assets/**`). The multi-Spoke proof serves an
  EXPLICIT two-Spoke installation, where exactly those roles belong to each SPOKE and the platform namespace
  must not claim them. One generated mirror cannot satisfy both, so the environment must be prepared for the
  context being run:

  ```sh
  # the generic Foundation + deployment scenarios (the legacy synthetic installation)
  FOUNDATION_DEPLOYMENT_LAYOUT=override \
  FOUNDATION_DEPLOYMENT_ROOT="$(pwd)/tests/fixtures/synthetic-deployment" pnpm assets:sync

  # the explicit multi-Spoke proof (its own two-Spoke installation)
  FOUNDATION_DEPLOYMENT_LAYOUT=override \
  FOUNDATION_DEPLOYMENT_ROOT="<the two-Spoke Installation root>" pnpm assets:sync
  ```

  A repository with its own installed deployment needs neither override: its generated state already belongs
  to the Installation its build selects, which is what `pnpm build` and `pnpm assets:sync` produce.

`multihost.scenario.mjs` installs its Spoke namespaces FROM THAT PLAN (`spokeNamespacePlan`) and then judges the
PUBLISHED catalog — the generated file the running application imports — against that plan
(`assertSpokeNamespaceAgreesWithCatalog`). It refuses the run when a published inventory is missing a file the
plan installs for the Installation being served, or when the shared platform namespace claims a replaceable role
that Installation gives to a Spoke, naming the Installation and the preparation above instead of leaving the
failure to a page that cannot compose. A namespace the published catalog does not carry at all is the accepted
compatibility case: the resolver falls back to the filesystem, which is exactly the situation of a repository
whose published catalog belongs to its own installed deployment. Artwork is never hand-copied into a generated
namespace: a file no plan declares is a file no inventory can serve.

### The production-mode proof (`production-continuity.mjs`)

The scenarios above drive a **development** server, which is the right trade-off for a 500+ check suite:
fast, and honest about the contracts it asserts. It is not, however, what a visitor runs — and three defects
were only visible there: FOUNDATION-UI1-A1, where navigating while the sidebar was OPEN re-created the rail,
the canonical CLOSED state was committed and corrected inside one commit, so no wrong frame was painted —
but the browser still started the rail's `width 200ms` CSS transition, and the rail visibly collapsed and
expanded again on the way; FOUNDATION-UI1-A2, where a FULL RELOAD with the preference stored OPEN
painted the canonical CLOSED rail and expanded it after hydration; and FOUNDATION-UI1-A3, where that same
reload painted the canonical CLOSED **disclosure control** — the Show icon and "Show navigation" — and swapped
both at hydration: the rail's geometry was right and every row stayed green, because the fingerprint had never
looked at the control's own content.

`tests/browser/production-continuity.mjs` is the smallest proof that closes that gap, rather than a second
suite: it runs `next build` and `next start` against the repository's own (reference) deployment and asserts
the same continuity invariant through the same real controls — no opposite-state commit on the rail
(replacement nodes included) and no width transition during a navigation, with the explicit toggle still
animating as it must — plus the whole-document `firstPaint.*` rows (the stored preference must be the first
painted state and every painted state of a reloaded document, with no boot-induced transition and with the
boot presentation equal to the runtime presentation), and the disclosure control's own content on every
sampled frame: which state's variant it PRESENTS from the first frame it is on screen, and that exactly one
variant is ever presented. It is **owned by this directory**, deliberately **NOT
wired into any CI route** (a production build is minutes, not seconds), and writes nothing itself:

```sh
node tests/browser/production-continuity.mjs
```

Its `continuity.*` siblings in `matrix.mjs` run the equivalent rows against the development server on every
browser gate, so the invariant is covered continuously; this script is the production-mode confirmation the
owner-visible defect requires.


```js
export const id = "reference-content";           // the report's `presentation` label
export async function run(chrome, harness) { … }  // returns the same check rows as a scenario here
```

The `harness` argument carries the generic pieces a scenario needs — its port, its viewports, its
assertion collector, its dev server (`startDevServer`/`stopServer`/`waitForServer`/`waitReady`), its
layout helper, and `configFile`: the deployment's configuration path, resolved exactly as the build
resolves it (a capsule at `<repo>/deployment` when one exists, otherwise the
repository root). A deployment scenario therefore names no repository path of its own, and a
repository without a capsule discovers nothing.

### Readiness: two layers, and the one a client transition needs

`waitReady(cdp)` waits for the DOCUMENT layer — the document finished loading and the shell's chrome is in
the DOM. That is what a full navigation (`cdp.navigate`) reaches.

A **visitor action** — a Site, Language or Location choice — navigates WITHOUT loading a document, so both
of those facts are already true when the transition starts and can never observe it. A scenario that
dispatches one therefore passes the state its next assertion actually reads:

```js
await cdp.evaluate(multisiteChoose("language", "en"));
await waitReady(cdp, { path: "/ca/en/about", body: "…ENGLISH BODY…" });
```

Probing the page without that expectation asserts against whatever page happened to be current, which is
the historical transient these two layers exist to end: two language-switch checks failed naming the
PREVIOUS route while the third — which only required the other site's marker to be ABSENT — passed against
that same stale page.

The conditions, the 20 s budget, the 200 ms poll and the 400 ms settle live in `readiness.mjs` (one
vocabulary, proved without a browser by `tests/architecture/browser-readiness-contract.test.ts`). A failed
wait reports what was awaited and what the document reported — its URL, `readyState`, and whether the shell
was present — instead of claiming a cause, because a document that never had the shell (a localized 404, a
dev-server error page) is exactly as "complete" as a healthy one.

A Layout choice is not a transition: it changes presentation, not the route.

For the Foundation's **one canonical presentation** the harness:
1. writes the canonical UI configuration (plus a matrix CTA) into `site.config.json`;
2. boots `next dev`;
3. drives a real CDP session across **desktop (1280) / tablet (900) / mobile
   (390)** and the md (768) / lg (1024) boundary widths;
4. performs **real interaction**: clicks/taps, Tab / Shift+Tab / Escape,
   backdrop dismissal, reduced-motion and dark-scheme emulation;
5. writes a machine-readable JSON report to `%TEMP%/ui10-browser-report.json` and
   `tests/browser/.report/ui10-browser-report.json` (gitignored);
6. exits non-zero on any failure (CI-friendly).

`site.config.json` is restored to its exact original bytes afterwards; the working
tree stays clean.

## What it exercises

- closed-SSR inertness (no dialog, no backdrop, nothing focusable);
- trigger/panel `aria-controls` + `aria-labelledby` resolution (B1);
- `aria-current="page"` on the active nav link in every placement (B2);
- focus entry + Tab / Shift+Tab containment + focus-return-to-trigger (D1);
- background `inert` while open, restored on close (D2);
- backdrop present + dismisses; Escape dismisses (D3);
- scroll lock restored across open/close cycles (D4);
- reduced-motion media query + no animation on the modal (PMR);
- CTA reachability in each declared placement (header/aside/bottom/drawer/overlay);
- P0-2 CTA composition convergence: ONE shared CTA capability path; exactly ONE
  interactive CTA reachable per viewport (the ≥md header CTA instance is hidden
  below `md` when the mobile disclosure/bottom-bar owns the CTA slot — resolves
  the deferred C2 observation); the aside CTA follows sidebar collapse (not
  reachable when the panel is collapsed; restored on expand); while a
  drawer/overlay is open exactly one CTA is reachable (no duplicate pair);
- P0-1 SIDEBAR capability: structural collapse/expand on collapsible desktop
  bands (toggle present, panel hidden from layout + tab order when collapsed,
  expand restores navigation + CTA), tablet `collapsed-sidebar` bands
  collapsed-by-default + always expandable (never a dead-end), immersive
  `floating` rail static/non-collapsible, and the immersive OVERLAY mobile
  contract (vertical navigation, content-appropriate bounded width, explicit
  "Close navigation" control that closes with focus-return + inert/scroll restore);
- responsive landmark exclusivity and deterministic unique ids;
- Adaptive's bottom bar: EVERY configured destination renders in it and the rows wrap (the former
  bottom-bar **More** disclosure was RETIRED — no trigger, no drawer, nothing hidden);
- **persistent navigation** (`persistent-navigation` scenario): the rail's content
  column stays in view while the page scrolls (bounded by the viewport, its
  control and destinations reachable, expanding the collapsed tablet rail while
  scrolled), the shell's top region takes over below `md`, exactly ONE of the two
  regions is persistent at each breakpoint boundary, a long navigation scrolls
  inside the rail column with its last destination still reachable, a fragment
  target clears the sticky header (and the clearance is removed where the rail is
  persistent), the bottom bar keeps every destination in view and hittable while
  scrolled (the former More disclosure was retired), the primary CTA stays in normal flow, and the
  configured destinations are unchanged. The tall fixture is authored as **safe
  Markdown**, and its fragment target is an **authored heading** (`## Anchor Section`
  → `#anchor-section`, FOUNDATION-PAGES-A1D), so the shell's clearance contract is
  measured on a target the author created; a raw-HTML anchor attempt in the same
  fixture must stay inert, and the scenario asserts both.
- **sidebar state + navigation continuity** (`sidebar-state` scenario): the rail's
  open/closed state is the visitor's preference — no preference opens CLOSED, a
  rejected stored value falls back to CLOSED, a refresh keeps the choice, a real
  navigation icon keeps it (CLOSED stays CLOSED, OPEN stays OPEN), the tablet band
  and the desktop band share ONE state, a Site switch does not partition it, the
  Layout switcher is independent of it, and at `<md` the SAME rail carries that state — the
  stored preference opens the RAIL there too, so no drawer or bottom bar becomes a second,
  ephemeral authority over the visitor's choice (NAV1D). NAV1D-V2/V3 — SELECTING a destination inside
  the rail dismisses an open rail through that same state owner: the scenario proves the close
  for a route change, for the page the visitor is already on, and for keyboard activation, and that
  the destination is presented with the collapsed STICKY rail (never an open rail, never a
  re-open). Since FOUNDATION-UI1-A1 the scenario
  judges the whole navigation INTERVAL rather than its end state: a transition
  observer records every `data-collapsed` write on a rail and every `width`
  transition on one, so the interval must commit **no opposite state** (a
  replacement rail node is permitted, a CLOSED commit on it is not) and start **no
  width transition** — the owner-visible flicker that a destination-state
  assertion cannot see. `toggle.stillAnimatesTheRail` calibrates that observer on
  the one control allowed to move the rail, so the fix can never be "no animation".
- **sidebar first paint of a whole document** (`firstPaint.*` rows, same scenario,
  FOUNDATION-UI1-A2): the frame recorder samples the rail's PAINTED geometry (its
  rendered width) and its presentation fingerprint, not only its attribute, because
  the refresh defect was pure geometry: the canonical CLOSED rail was painted and
  then expanded after hydration. Since FOUNDATION-UI1-A3 that fingerprint also
  carries the disclosure CONTROL's presented content (its artwork and its label), so
  a document whose rail is already the right width but whose control still says the
  canonical state's copy is a mismatch rather than a pass. On a REAL reload the rows
  require the first painted
  state to be the stored one, **every** painted frame of that document to be the
  stored state, the presentation captured at boot to be identical to the runtime
  presentation (geometry, rail padding, control inset/justification, label
  visibility, list inset, the state-paired icons and the control's presented
  variant), the pre-paint bridge marker to
  have been present at boot and **relinquished** afterwards, and the boot interval
  to have started no width transition. Reverting the bridge flips them (measured: the
  first painted state becomes CLOSED and a `36px → 220px` transition starts), which
  is what makes them the durable proof rather than a description.
  `toggle.closedActuallyLooksClosed` closes the loop: a document that BOOTED on the
  bridge must still *look* closed after an explicit toggle, so a stale bridge cannot
  survive as a competing authority.
- **Reading a state-paired control** (every scenario): the disclosure CONTROL and the
  sidebar PAGE icons each declare both states' variants and the stylesheet presents one,
  so a probe that takes the first match measures the HIDDEN variant — a 0x0 box or the
  other state's copy. The browser gates therefore read the variant whose computed
  `display` is not `none` (`PRESENTED_VARIANT` in `matrix.mjs`, `CONTROL_READER` in
  `production-continuity.mjs`), never the control's whole `textContent`, which holds
  both states' labels.
- **Semantics first paint** (`firstPaint.*.controlSemantics*` rows, same scenario;
  FOUNDATION-UI1-A3-A1): presentation can be selected by a stylesheet, but
  `aria-expanded` and the control's accessible name cannot — so on every painted frame,
  from the first one the control is on screen, the gate reads what the control CLAIMS
  (`aria-expanded`, its accessible name, `aria-controls`, and the state-paired
  declarations those are judged against) and requires it to describe the state the
  control presents, with the boot reading byte-identical to the hydrated runtime's own
  and exactly ONE operable disclosure control in the presented rail. The reader and the
  rule are shared (`tests/browser/sidebar-semantics.mjs`), so both gates judge the same
  facts identically.
- **shell layout presentation** (`layout-switcher` scenario): with `ui.layoutSwitcher`
  enabled, the header offers one labelled **Layout** control (Sidebar / Menu bar), at
  EVERY width, anchored at the top row's right edge. The sidebar layout exposes the SAME persistent
  rail at every width — desktop, tablet and the mobile band alike (NAV1D) — and composes no drawer,
  no disclosure band and no header affordance to substitute for it; choosing Menu bar exposes the
  **sticky bottom bar at EVERY width** and no top navigation at all — and a Tab sweep proves the
  withdrawn structures are never focusable. The document, its main content, the route, the locale and
  the usable content column are unchanged, persistent navigation and fragment clearance follow the
  active layout, and the choice survives client-side navigation and a full reload (an unusable
  stored value falls back to the configured default). The MOBILE/handover contract (NAV1D) is
  MEASURED rather than asserted by class: the mobile band presents the rail itself, with the rail's
  own padding on both sides, the control's box on that same inset, the navigation rows sharing it,
  the focus ring's full extent left free inside the scrolling column, and the column still pinned
  after scrolling deeply — all at 1280/1024/900/768/767/390/360/320; the control's typography, icon
  and the rail's padding are identical to the desktop band's, because the breakpoint changes WHICH
  band presents the rail, not WHAT the rail is; and the header's two semantic rows keep their
  ownership at the same widths — through real resize transitions and real mode switches made while
  already at a phone width (no stale dialog, no scroll lock, no substituted surface). NAV1D-V3 — the
  CLOSED rail is measured on the PAGE EDGE at every width (no ~20px shell gutter) with the 24px control
  centred between that edge and the divider and the accepted 6px/5px padding intact; the OPEN rail is
  measured per band, with the 768/767 boundary asserted on both sides: at and above `md` it expands IN
  FLOW (the page's x-position and width change by exactly the rail's growth, the rail never covers the
  content, and the Hide control keeps its balanced 20/20 inset), while below `md` it is an opaque
  OVERLAY (the page keeps its closed geometry, the document gains no width, the rail wins the hit test
  inside its own area, and its surface has no alpha channel, no opacity and no image layer); and the
  rail's colour is proved to follow the site's ONE background authority by overriding `--background`
  at runtime. The CLOSED layout is proved free of a horizontal scrollbar at all eight widths
  (measured against the viewport's
  content box), and a deliberate below-boundary width (260px) proves the 280px floor: the layout keeps
  its geometry, the viewport scrolls, and the rail stays functional (FOUNDATION-UI-R1D moved the floor
  from 320 to 280 so that every SUPPORTED width fits its own content box). The Menu Bar
  surface is measured too: its sticky surface spans the viewport and its navigation region uses the
  available width minus the page-edge inset (never the page's own `max-w-page` bound).
- **header semantic rows** (`header-rows` scenario, NAV1B/NAV1B-V1): with test-owned fixtures the
  navigation-MODE selector keeps its top-right place at every width. A TEXT identity (a very long
  site name) begins on the selector's own first line at the padded left edge, wraps inside its own
  left column and never overlaps the selector. A GRAPHIC identity (a test-owned configuration
  pointing the logo role at a shipped wide placeholder) keeps its natural aspect, is never shrunk
  into the text column, reaches BENEATH the selector's occupied area at narrow widths, and the
  selector WINS the hit test at its own centre — with no page overflow in either case. Long
  contextual labels wrap INSIDE the row below, which never lets a control jump into the top row.
- **header identity across the nine viewport categories** (`header-identity` scenario,
  NAV1B-V2/FOUNDATION-UI-R1C/R1D/R1E): every identity kind × all 27 named widths × 9 categories, with
  the requested width itself asserted. The row wraps by CONTENT (no breakpoint decides it), the cluster
  is entirely below the brand exactly when their permitted widths cannot coexist, and nothing overlaps.
  The mark's DISPLAY contract is measured as real rendered geometry: never wider than the header's own
  maximum (`--ui-site-header-logo-max-inline-size`, 280px) or than the width available to it, never
  taller than the shared display size, never enlarged when the file is smaller than both, scaled to fit
  rather than cropped or stretched, and its intrinsic ratio preserved — for a compact square mark, a
  naturally small 24×24 mark, a conventional horizontal lockup, a header band wider than the maximum
  and an exceptionally wide 64:1 lockup. FOUNDATION-UI-R1F extends the scenario with the OPTIONAL compact
  alternative: with `site.assets.logoCompact` configured the browser's own answer (`img.currentSrc`) is read
  at every one of the 27 widths — the compact artwork below 600 CSS pixels, the primary logo at 600 and wider —
  the intrinsic size of what LOADED is compared across the boundary (so a different file really was fetched),
  every selected artwork must have completed loading, and resizing 600 → 599 → 600 → 599 WITHOUT reloading must
  follow the boundary in both directions. Spoke-scoped compact artwork is proved on the test-owned Hub, where each
  member authors its own differently-sized compact mark and the selection must be served from that member's own
  namespace. FOUNDATION-UI-R1G adds the DELIVERY contract to every measured width: whichever artwork the browser
  selected was fetched from THIS DOCUMENT'S OWN ORIGIN (`img.currentSrc` against `window.location.origin`) — never
  from the origin the configuration names, which is canonical source identity only — and it carries the basename the
  width entitles the visitor to (the compact artwork below 600 CSS pixels, the primary logo at 600 and wider). A
  variant that configures no compact artwork composes no `<source>` at all and shows the primary logo
  at every width (the unchanged case), and the text fallback renders no image. No document overflow at any
  supported width (and a documented below-280 fallback), unchanged behaviour at tablet and desktop widths, and the
  rail, drawer, bottom bar, selectors and keyboard/pointer interactions protected throughout.
- **bottom navigation layout** (`bottom-nav-wrap` scenario, NAV1A): the sticky bar's rows
  are the `<li>` children of its `<ul>`, so the LIST owns their flow and wrapping. Proven
  with test-owned navigation fixtures on the disposable copy: SHORT labels share ONE row at
  a phone width (no forced one-item-per-row, no needless wrapping) and LONG labels WRAP
  onto another row because the available width genuinely requires it — every link stays
  inside the page-edge inset, the bar GROWS in height instead of clipping, and the
  page never scrolls horizontally.
- **advanced JSON** (`advanced-json` scenario): a declarative document authored under
  `content/pages/json/en/` is discovered, validated and served by the real application —
  exactly one `<h1>` (the document title), a Markdown field rendered (`**bold**`), a table
  with real column headings, a FAQ disclosure whose question is a heading, an action whose
  `route` resolved to `/en/services`, no element carrying an event handler, and the
  author's raw HTML present as TEXT but never executed.
- **nested pages** (`nested-pages` scenario): a page authored in a FOLDER
  (`content/pages/markdown/en/zz-nested/web-design.md`) is served at its nested URL
  (`/en/zz-nested/web-design`) through the ONE page route, with its authored title, its
  own generated heading fragment reachable in the browser, and its Markdown capability
  intact (a table renders). Documentation beside it (`…/zz-nested/README.md`) is NOT a
  route, and a URL that names no page — including the retired collection URLs
  (`/en/offerings`, `/en/blog`, `/en/testimonials`) — is a proper localized 404.
- **safe Markdown** (`safe-markdown` scenario): an authored page under
  `content/pages/markdown/en/` is served through the normal route with its authored
  title, its ordinary Markdown rendered, and no active markup anywhere — no author
  script, no event-handler attribute, no unsafe `href`, no forbidden element inside
  the content — while the author's raw HTML remains readable as inert text and the
  page raises no runtime error. The same served page proves the documented
  capability (a GFM table with real cells, nested lists, a quotation,
  strikethrough) and the authored **heading fragments**: `## Fixture Section`
  becomes `#fixture-section` (a repeat becomes `#fixture-section-2`), the author's
  `[jump](#fixture-section)` link reaches it, and the sticky header's clearance
  keeps the target visible — measured on a target the AUTHOR created. An id typed
  in raw HTML stays inert.
- **the deployment's own content** (`reference-content` scenario, R1A — **owned by the deployment**,
  sourced from `deployment/tests/browser/reference-content.scenario.mjs` and run by this harness): runs
  against the **shipped configuration, unmodified** — the JSON Home page (advanced mode) and the Markdown
  About page at their real URLs, each with exactly one `<h1>`; the Home → About destination; Home +
  About in the site-aware navigation; the visitor Layout control (its exact vocabulary, the sidebar
  default, switching, browser-local persistence and reload survival); the sidebar disclosure's two
  visual states (OPEN keeps its surface with the 24px icon inset INSIDE the control; CLOSED is
  transparent with no pill while keeping its hit target, its accessible name and its focus ring);
  and canonical / Open Graph / sitemap / robots all serving the reference origin.
- **multisite / multilingual** (`multisite` scenario, FOUNDATION-S1): one temporary deployment
  with TWO independent country sites (`ca` with French + English, `fr` with French) whose pages,
  chrome, languages and locations genuinely differ. It proves, through the four visitor dimensions:
  the Site selector appears (and lists both sites) while a one-site deployment offers none; the
  Language selector offers only the ACTIVE site's languages; Site and Location are distinct,
  labelled controls; `/ca/fr/about` and `/fr/fr/about` render their OWN bodies (and not each
  other's); switching Language stays inside the site; switching Site preserves the route when the
  target site serves it and lands on the target's HOME when it does not (never a 404); the target
  site's own navigation appears; the Location belongs to its site only and never leaks across; the
  chosen Layout survives BOTH a site and a language switch; the layout control's keyboard
  reachability survives switching; exactly one navigation structure stays exposed; and no band
  shows horizontal overflow. The configuration and every fixture page are restored/removed in
  `finally`, so the shipped template still ships one site and no pages.
- **appearance contract** (`appearance-contract` scenario, FOUNDATION-DEFECT-NAV3): every surface the
  appearance audit (NAV2) named an authority for is read from a REAL engine and compared with the
  value the engine itself computes for that token — so the contract cannot drift from the stylesheet
  and no second copy of a colour lives in the harness. In the LIGHT scheme, at desktop / tablet /
  mobile: the page's canvas and text (`--background` / `--foreground`), prose links (`--primary`),
  the sidebar's surface (`--background`), its navigation text (`--muted-foreground`) and its divider
  (`--border`), the header's text plus the layout selector's surface and border, and the ordinary
  footer's TRANSPARENT surface with its `--border` hairline, `--muted-foreground` headings and
  `--foreground` links. Those values must be IDENTICAL at all three widths (one
  breakpoint-independent colour signature). In the DARK scheme (engine-emulated) the same surfaces
  must resolve to the dark tokens. The Menu Bar's sticky full-width surface is proven as a PAINT
  contract: it spans the whole client width, paints `--background` across it, carries `--border` on
  top and `--foreground` links, and is hit-testable at BOTH edges — so a min-content block with an
  unpainted remainder fails. Interaction states: the current page is deliberately NOT asserted to look
  different (the platform conveys it by `aria-current`), while hover and focus are — with the right
  subject. Tailwind compiles every `hover:` utility inside `@media (hover: hover)` (the rows report that
  query), and a headless renderer may answer `:hover` while reporting the query FALSE, so the durable
  assertion is each control's own hover DECLARATION resolved through the engine (a sidebar navigation
  link's `hover:text-foreground` → `--foreground`; an ordinary footer link's `hover:text-primary` →
  `--primary`), and the runtime pointer behaviour is asserted on top whenever the runner really has
  hover (the row then reports a value, not a skip); the global `:focus-visible` ring is measured with
  real `Tab` presses and must resolve to `--ring`. ONE test-owned configuration phase then proves the
  propagation end to end on its own server: `ui.theme.background: "#00ff00"` appears on `<html>`, and
  the body, the sidebar rail, the selector and the Menu Bar surface all render exactly that colour
  while the text and the transparent footer keep their tokens; `site.assets.backgrounds.all` and
  `site.assets.footerGraphic` (pointed at SHIPPED mirrored placeholders — no new artwork) render
  exactly ONE decorative page layer (fixed, `cover`, centred, `no-repeat`, `z-index: -1`,
  `pointer-events: none`, `aria-hidden`) that never captures a hit from the content and adds no
  overflow, plus one inert layer behind the footer's own content. The configuration and the
  task-owned prose page are restored/removed in `finally`.


