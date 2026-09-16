/**
 * UI system vocabulary (UI-01 — Architecture & Contract).
 *
 * The closed value sets for the Foundation `ui` configuration namespace.
 * These constants are the SINGLE source of allowed values: the configuration
 * schema (`src/config/schema.ts`) derives from them, so the documented
 * vocabulary and the schema can never drift.
 *
 * Framework-neutral by design (see ARCHITECTURE.md — UI System Architecture):
 * pure data + types only; never import React, Next.js, Tailwind, adapters, or
 * configuration from here.
 *
 * IMPORTANT: none of these values establish a default. The Foundation's
 * resolved default for each leaf lives in `defaults.ts`
 * (`FOUNDATION_UI_DEFAULTS`) — a resolution policy, never a contract-surface
 * default. There is ONE canonical Foundation presentation; the retired
 * selectable-presentation (Presentation) vocabulary is deliberately gone.
 */

/** Desktop navigation patterns (roadmap §11, §15). */
export const DESKTOP_NAVIGATION_PATTERNS = [
  "top",
  "sidebar",
  "minimal",
  "floating",
] as const;
export type DesktopNavigationPattern = (typeof DESKTOP_NAVIGATION_PATTERNS)[number];

/** Tablet navigation patterns (roadmap §15 transformations). */
export const TABLET_NAVIGATION_PATTERNS = [
  "top-compact",
  "collapsed-sidebar",
  "minimal",
  "floating",
] as const;
export type TabletNavigationPattern = (typeof TABLET_NAVIGATION_PATTERNS)[number];

/** Mobile navigation patterns (roadmap §15). */
export const MOBILE_NAVIGATION_PATTERNS = [
  "drawer",
  "bottom-bar",
  "top",
  "overlay",
] as const;
export type MobileNavigationPattern = (typeof MOBILE_NAVIGATION_PATTERNS)[number];

/** Semantic UI density values (roadmap §16). */
export const UI_DENSITIES = ["compact", "comfortable", "spacious"] as const;
export type UiDensity = (typeof UI_DENSITIES)[number];

/** Semantic content-width values (roadmap §17). */
export const CONTENT_WIDTHS = ["narrow", "standard", "wide", "full"] as const;
export type ContentWidth = (typeof CONTENT_WIDTHS)[number];

/** Shell variants (roadmap §5.1 "standard" header, §7 "minimal" header). */
export const SHELL_VARIANTS = ["standard", "minimal"] as const;
export type ShellVariant = (typeof SHELL_VARIANTS)[number];

/** CTA visual prominence values (roadmap §11 `cta.style`). */
export const CTA_STYLES = ["standard", "prominent"] as const;
export type CtaStyle = (typeof CTA_STYLES)[number];

/** Semantic CTA actions (roadmap §19). */
export const CTA_ACTIONS = [
  "book",
  "reserve",
  "order",
  "contact",
  "call",
  "quote",
  "enquire",
  "buy",
  "subscribe",
] as const;
export type CtaAction = (typeof CTA_ACTIONS)[number];

/** Theme modes (roadmap §18). `system` follows the OS color-scheme preference. */
export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/**
 * Semantic theme radii (roadmap §18, §22). Values align with the existing
 * `--radius-*` design tokens in `src/app/globals.css`.
 */
export const THEME_RADII = ["none", "small", "medium", "large"] as const;
export type ThemeRadius = (typeof THEME_RADII)[number];

/** A normalized hex color (`#rgb`, `#rrggbb`, or `#rrggbbaa`) — RE for config validation. */
export const COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{8}$/;

/**
 * P5-3 — Presentation vocabulary (generalized Presentation-presentation dimensions).
 *
 * These are the closed value sets for the `ui.presentation` namespace. Each
 * dimension is a GENERALIZED presentation intent (never a fixed presentation name): a
 * Presentation profile selects one value per dimension, and any custom configuration
 * may too. The renderer (CSS token layer + shared components) implements each
 * value; the resolver/schema derive from these arrays so the documented
 * vocabulary and the schema can never drift.
 *
 * Framework-neutral by design (see ARCHITECTURE.md — UI System Architecture).
 */

/** Display/heading "voice": how display typography is tuned (P5-3). */
export const PRESENTATION_TYPOGRAPHIES = [
  "balanced",
  "editorial",
  "minimal",
  "utility",
  "expressive",
] as const;
export type PresentationTypography = (typeof PRESENTATION_TYPOGRAPHIES)[number];

/** Section/page vertical rhythm (P5-3). */
export const PRESENTATION_RHYTHMS = [
  "balanced",
  "structured",
  "airy",
  "dense",
  "spacious",
] as const;
export type PresentationRhythm = (typeof PRESENTATION_RHYTHMS)[number];

/** Surface/card treatment family (P5-3). */
export const PRESENTATION_SURFACES = [
  "default",
  "paper",
  "minimal",
  "instrument",
  "layered",
] as const;
export type PresentationSurface = (typeof PRESENTATION_SURFACES)[number];

/** Header band treatment (P5-3). */
export const PRESENTATION_HEADERS = [
  "default",
  "rule",
  "bare",
  "compact",
  "elevated",
] as const;
export type PresentationHeader = (typeof PRESENTATION_HEADERS)[number];

/** Home hero composition (P5-3). */
export const PRESENTATION_HEROES = [
  "default",
  "split",
  "center",
  "concise",
  "showcase",
] as const;
export type PresentationHero = (typeof PRESENTATION_HEROES)[number];

/**
 * P5-5 — Configurable controls & navigation-presentation vocabulary.
 *
 * Closed value sets for the adopter-configurable control/menu intent that P5-5
 * introduces. Like every other vocabulary, these are the SINGLE source of
 * allowed values: the configuration schema derives from them, and the shared
 * renderer implements each value with a small semantic rule — never arbitrary
 * CSS-through-JSON and never presentation identity.
 */

/** Menu/control presentation modes — the SAME three-state contract used by the
 * sidebar, the ≥md top navigation, and the mobile bottom navigation. */
export const MENU_MODES = ["open", "compact", "closed"] as const;
export type MenuMode = (typeof MENU_MODES)[number];

/** Sidebar navigation region groups (deterministic order: top → middle → bottom). */
export const NAV_REGIONS = ["top", "middle", "bottom"] as const;
export type NavRegion = (typeof NAV_REGIONS)[number];

/** Icon placement within a control ("start" = leading, "end" = trailing). */
export const ICON_POSITIONS = ["start", "end"] as const;
export type IconPosition = (typeof ICON_POSITIONS)[number];

/** Semantic CTA state (a finite vocabulary, not arbitrary CSS). */
export const CTA_STATES = ["default", "disabled"] as const;
export type CtaState = (typeof CTA_STATES)[number];

/**
 * P5-5 — the configurable UI asset (icon) filename contract.
 *
 * A plain filename that resolves under `public/assets/` (via the shared
 * /assets/ URL). Paths, traversal, query strings, and URLs are REJECTED — the
 * adopter replaces an asset in place or swaps the configured filename, never a
 * server path. Allowed formats: svg, png, webp, jpg/jpeg, gif, ico (png/webp
 * icons are rendered at a fixed control size so intrinsic dimensions can never
 * overflow layout).
 */
export const ICON_ASSET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:svg|png|webp|jpg|jpeg|gif|ico)$/;

/** Whether a string is a valid configurably-replaceable asset filename. */
export function isIconAssetName(value: string): boolean {
  return ICON_ASSET_PATTERN.test(value);
}