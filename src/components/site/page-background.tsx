"use client";

import { usePathname } from "next/navigation";

import { pageSlugFromPathname } from "./page-banner";

/**
 * PageBackground (P12-BG — the reusable decorative background-graphic seam).
 *
 * The GLOBAL / PAGE-SPECIFIC background layer documented by the Background /
 * Watermark Contract (`.project/deployment-info/brand-system/visual/README.md`):
 *
 *     background-<page>   (page-specific)
 *             ↓
 *     background-all      (global)
 *             ↓
 *     none                (no graphic background at all)
 *
 * Contract:
 *  - CONFIGURED-ONLY: the server resolves `site.assets.backgrounds` (a page-role
 *    → absolute-URL record; `"all"` is the reserved GLOBAL key) to same-origin
 *    assets for entries whose file actually exists under `public/assets/`, and
 *    passes that map here. A page with no entry and no global entry renders
 *    NOTHING — no placeholder and never another page's graphic.
 *  - DECORATIVE ONLY: `aria-hidden="true"` and no text. The layer carries no
 *    accessible name, no semantics and no interaction; the page's meaning comes
 *    entirely from its own content. It is NOT a heading/title source.
 *  - NEVER INTERACTIVE: `pointer-events: none`, so it can never capture a click,
 *    a selection, or focus. Content stays fully selectable and focusable.
 *  - NON-STRUCTURAL: the layer is `position: fixed` and out of flow, so it adds
 *    no padding, no margin, no reserved height and no horizontal overflow, and
 *    it cannot shift the header, banner, content or footer.
 *  - BEHIND CONTENT: `z-index: -1` paints it above the page's flat colour (the
 *    canvas background from `body { background: var(--background) }`) and below
 *    every in-flow element — so `ui.theme.background` still defines the colour
 *    and the graphic is layered over it, never substituted for it.
 *  - ONE ASSET, ANY VIEWPORT: `background-size: cover` lets a single graphic
 *    survive normal viewport changes; there are no per-breakpoint roles and no
 *    art direction (`<picture>`), per the contract.
 *  - Client component because the current page is only known at render time
 *    (`usePathname`, the same established seam `PageBanner` uses); the map
 *    itself is computed on the server (`node:fs` availability reads never reach
 *    the browser). The page role is derived by the SAME
 *    `pageSlugFromPathname` helper the banner uses — there is no second
 *    pathname-classification system.
 */
export interface PageBackgroundProps {
  /** Page role → resolved same-origin background path (only entries whose file exists). */
  readonly backgrounds: Readonly<Record<string, string>>;
  /** Configured operating-region ids (skipped when deriving the page role). */
  readonly regionIds: readonly string[];
}

/** The reserved `site.assets.backgrounds` key for the GLOBAL background. */
export const GLOBAL_BACKGROUND_KEY = "all";

/**
 * Resolves the background for a page role: the page-specific entry first, then
 * the global (`"all"`) entry, then nothing. Exported so the resolution contract
 * is directly testable without a browser.
 */
export function resolveBackgroundPath(
  backgrounds: Readonly<Record<string, string>>,
  pageRole: string,
): string | undefined {
  return backgrounds[pageRole] ?? backgrounds[GLOBAL_BACKGROUND_KEY];
}

export function PageBackground({ backgrounds, regionIds }: PageBackgroundProps) {
  const pathname = usePathname() ?? "";
  const pageRole = pageSlugFromPathname(pathname, regionIds);
  const src = resolveBackgroundPath(backgrounds, pageRole);
  if (!src) return null;

  return (
    <div
      className="ui-page-background"
      aria-hidden="true"
      style={{ backgroundImage: `url(${JSON.stringify(src)})` }}
    />
  );
}
