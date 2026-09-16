import type {
  ContentWidth,
  CtaAction,
  CtaState,
  CtaStyle,
  DesktopNavigationPattern,
  IconPosition,
  MenuMode,
  MobileNavigationPattern,
  ShellVariant,
  TabletNavigationPattern,
  ThemeMode,
  ThemeRadius,
  UiDensity,
} from "./vocabulary";
import { PRESENTATION_DEFAULTS, type UiPresentation } from "./presentation";

/**
 * Foundation-level UI defaults (UI-02 — Configuration Infrastructure).
 *
 * The **base layer** of the resolution model (master-ui-phase §5):
 *
 * ```text
 * explicit developer override (UiConfig leaf, when present)
 *         ↓
 * Foundation canonical defaults (this module — FOUNDATION_UI_DEFAULTS)
 *         ↓
 * completeness invariant (assertResolvedUiConfigComplete)
 * ```
 *
 * There is **ONE canonical Foundation presentation**: the resolved personality
 * *is* this table. The former selectable-presentation layer (a preset identifier,
 * a profile table and the profile-merge step) was retired by owner decision — the
 * values the canonical presentation used are now ordinary defaults here, so the
 * resolved configuration is unchanged.
 *
 * These are NEUTRAL platform defaults: they express the Foundation's baseline
 * intent, nothing business-specific. Framework-neutral (pure data + types): see
 * ARCHITECTURE.md — UI System Architecture & Configuration Contract.
 */

/**
 * The roadmap §24 capability-matrix level the Foundation may claim for a
 * capability.
 *
 * P0-6 — the CAPABILITY-CLAIM VOCABULARY (each level has a concrete architectural
 * meaning + evidence rule; enforced by
 * `tests/architecture/capability-claims.test.ts`):
 *
 *  - supported   → the resolved canonical composition implements AND browser-
 *                  verifies the behavior. Evidence: resolved leaves select the
 *                  composition AND the browser matrix asserts the behavior.
 *  - optional    → the shared capability is implemented + verified at the
 *                  Foundation level, but the composition does NOT enable it by
 *                  default; a user can reach it via explicit configuration.
 *  - limited     → the shared capability exists only PARTIALLY (documented
 *                  limitation); it is not the full capability contract.
 *  - unsupported → NOT claimed (roadmap "—"). Absence is the honest default. A
 *                  shared primitive/config field existing in source is NOT
 *                  evidence of support. Custom configurations are never
 *                  capability-gated, so a user may still compose a shared
 *                  capability the Foundation does not claim.
 */
export type UiCapabilityLevel = "supported" | "optional" | "limited" | "unsupported";

/** The roadmap §24 capability matrix (the rows the Foundation may claim). */
export interface UiFoundationCapabilities {
  readonly topNavigation: UiCapabilityLevel;
  readonly sidebar: UiCapabilityLevel;
  readonly collapsibleSidebar: UiCapabilityLevel;
  readonly bottomMobileNavigation: UiCapabilityLevel;
  readonly mobileDrawer: UiCapabilityLevel;
  readonly primaryCta: UiCapabilityLevel;
  readonly overlayNavigation: UiCapabilityLevel;
  readonly secondaryPanel: UiCapabilityLevel;
  readonly complexNavigation: UiCapabilityLevel;
  readonly visualFirst: UiCapabilityLevel;
  readonly applicationDashboard: UiCapabilityLevel;
}

/**
 * The Foundation's capability claims (the audited P0-6 truth table row for the
 * canonical presentation). `capabilities()` semantics from the retired profile
 * table are preserved: every unlisted column is `unsupported` — the roadmap "—"
 * — and the default IS the truthful state.
 *
 * A row may only be raised (to optional/limited/supported) when the
 * implementation + composition + (for supported) browser verification exist, and
 * the claim gate (`tests/architecture/capability-claims.test.ts`) is updated with
 * the evidence in the same change.
 */
export const FOUNDATION_UI_CAPABILITIES: Readonly<UiFoundationCapabilities> = {
  topNavigation: "optional",
  sidebar: "supported",
  collapsibleSidebar: "supported",
  bottomMobileNavigation: "supported",
  mobileDrawer: "supported",
  primaryCta: "supported",
  // Not claimed (the roadmap "—"): the resolved canonical composition does not
  // implement these, so the honest level is `unsupported`.
  overlayNavigation: "unsupported",
  secondaryPanel: "unsupported",
  visualFirst: "unsupported",
  // P0-4/P0-6 truth: no grouped-navigation implementation exists (flat
  // `navigation[]`), so "complex navigation" is only the flat nav lists the
  // sidebar/header already compose (limited), not full grouping.
  complexNavigation: "limited",
  // P0-6 truth: an app-LIKE shell (sidebar/bottom-bar) exists but no dashboard
  // features (groups, secondary panel) — limited, not supported.
  applicationDashboard: "limited",
} as const;

/** Foundation-level default values for the semantic UI intent leaves. */
export interface UiFoundationDefaults {
  readonly shell: { readonly header: ShellVariant; readonly footer: ShellVariant; readonly sidebar: { readonly collapsible: boolean } };
  readonly navigation: {
    readonly desktop: DesktopNavigationPattern;
    readonly tablet: TabletNavigationPattern;
    readonly mobile: MobileNavigationPattern;
    /** P5-5 — sidebar presentation intent (mode + open/close control content). */
    readonly sidebar: {
      readonly mode: MenuMode;
      readonly open: { readonly icon?: string; readonly text?: string };
      readonly close: { readonly icon?: string; readonly text?: string };
    };
    /** P5-5 — ≥md top-navigation menu presentation mode. */
    readonly top: { readonly mode: MenuMode };
    /** P5-5 — mobile bottom-navigation menu presentation mode. */
    readonly bottom: { readonly mode: MenuMode };
  };
  readonly density: UiDensity;
  readonly content: { readonly width: ContentWidth };
  /** P5-3 — the canonical presentation intent (balanced). */
  readonly presentation: UiPresentation;
  readonly cta: {
    /** DELIBERATE neutral default (D1, owner-approved): the Foundation's own
     *  composition renders no CTA; an action is a business decision, never
     *  invented by the Foundation. The shipped reference site enables one
     *  explicitly through configuration. */
   readonly enabled: boolean;
    readonly action?: CtaAction;
    readonly label?: string;
    /**
     * ADOPTER-OWNED DESTINATION (UI-07 D1): the CTA `href` is a business
     * decision — the Foundation NEVER infers a destination from `action` or
     * invents a route. Optional; resolves `undefined` when omitted. An enabled
     * CTA without label+href renders nothing (the engine's existing invariant).
     */
    readonly href?: string;
    /** CTA visual prominence. */
   readonly style: CtaStyle;
    /** P5-5 — optional leading/trailing icon asset (plain public/assets filename). */
    readonly icon?: string;
    /** P5-5 — icon placement within the CTA ("start" or "end"). */
    readonly iconPosition: IconPosition;
    /** P5-5 — semantic CTA state ("default" | "disabled"). */
    readonly state: CtaState;
  };
  readonly theme: { readonly mode: ThemeMode; readonly radius: ThemeRadius; readonly background?: string };
}

/**
 * The Foundation canonical defaults table (approved; see
 * .project/plan/archive/todo-milestone-ui-02.md §2.4, flattened at
 * the single-presentation closure).
 *
 * The navigation/shell values below are the CANONICAL Foundation presentation:
 * a collapsible desktop sidebar, a collapsed rail on tablet and a bottom bar on
 * mobile — previously supplied by the retired default profile, now ordinary
 * defaults (identical resolved output).
 *
 * Do NOT add entries here without a documented architectural reason — every
 * addition silently changes the resolved config for every adopter.
 */
export const FOUNDATION_UI_DEFAULTS: Readonly<UiFoundationDefaults> = {
  shell: {
    header: "standard",
    footer: "standard",
    // P0-1: the canonical Foundation composition OWNS a user-collapsible rail.
    // A custom config may opt out with `shell.sidebar.collapsible: false`.
    sidebar: { collapsible: true },
  },
  navigation: {
    desktop: "sidebar",
    tablet: "collapsed-sidebar",
    mobile: "bottom-bar",
    // P5-5 — neutral defaults: sidebar fully open (labels + shipped icons),
    // top/bottom menus open. `open`/`close` text falls back to the localized
    // dictionary labels and icon to the shipped assets at composition time.
    sidebar: { mode: "open", open: { icon: undefined, text: undefined }, close: { icon: undefined, text: undefined } },
    top: { mode: "open" },
    bottom: { mode: "open" },
  },
  density: "comfortable",
  content: { width: "standard" },
  presentation: PRESENTATION_DEFAULTS,
  cta: {
    enabled: false,
    action: undefined,
    label: undefined,
    // UI-07 D1: the CTA destination is adopter-owned; the Foundation never
    // invents or infers a href (no action→URL registry, no route inference).
    href: undefined,
    style: "standard",
    // P5-5 — no icon, leading placement, enabled by default when composed.
    icon: undefined,
    iconPosition: "start",
    state: "default",
  },
  theme: { mode: "system", radius: "medium" },
};