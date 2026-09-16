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
pnpm test:browser
```

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
  "Close Sidebar" control that closes with focus-return + inert/scroll restore);
- responsive landmark exclusivity and deterministic unique ids;
- Adaptive's bottom-bar **More** disclosure through the same Drawer path.
