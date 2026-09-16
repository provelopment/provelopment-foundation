import { FOUNDATION_UI_DEFAULTS } from "./defaults";
import { PRESENTATION_DEFAULTS, type UiPresentation } from "./presentation";
import {
  CONTENT_WIDTHS,
  CTA_STATES,
  CTA_STYLES,
  DESKTOP_NAVIGATION_PATTERNS,
  ICON_POSITIONS,
  MENU_MODES,
  MOBILE_NAVIGATION_PATTERNS,
  PRESENTATION_HEADERS,
  PRESENTATION_HEROES,
  PRESENTATION_RHYTHMS,
  PRESENTATION_SURFACES,
  PRESENTATION_TYPOGRAPHIES,
  SHELL_VARIANTS,
  TABLET_NAVIGATION_PATTERNS,
  THEME_MODES,
  THEME_RADII,
  UI_DENSITIES,
  type ContentWidth,
  type CtaAction,
  type CtaState,
  type CtaStyle,
  type DesktopNavigationPattern,
  type IconPosition,
  type MenuMode,
  type MobileNavigationPattern,
  type PresentationHeader,
  type PresentationHero,
  type PresentationRhythm,
  type PresentationSurface,
  type PresentationTypography,
  type ShellVariant,
  type TabletNavigationPattern,
  type ThemeMode,
  type ThemeRadius,
  type UiDensity,
} from "./vocabulary";

/**
 * The validated intent-level UI configuration surface (UI-01 contract shape).
 *
 * Structurally mirrors `src/config/site-config.ts` `UiConfig` (same optional
 * leaf names, same vocabulary-backed types). Defined HERE in framework-free
 * core so the resolver never depends on the configuration layer: the core
 * boundary forbids any `@/config` import. The validated config surface's
 * `UiConfig` is structurally assignable to this shape, so UI-04 can pass the
 * validated UI configuration straight in.
 */
export interface UiConfigInput {
  readonly shell?: {
    readonly header?: ShellVariant;
    readonly footer?: ShellVariant;
    /** P0-1 — whether the composed aside rail is user-collapsible. */
    readonly sidebar?: { readonly collapsible?: boolean };
  };
  readonly navigation?: {
    readonly desktop?: DesktopNavigationPattern;
    readonly tablet?: TabletNavigationPattern;
    readonly mobile?: MobileNavigationPattern;
    /** P5-5 — sidebar presentation intent (mode + open/close control content). */
    readonly sidebar?: {
      readonly mode?: MenuMode;
      readonly open?: { readonly icon?: string; readonly text?: string };
      readonly close?: { readonly icon?: string; readonly text?: string };
    };
    /** P5-5 — ≥md top-navigation menu presentation mode. */
    readonly top?: { readonly mode?: MenuMode };
    /** P5-5 — mobile bottom-navigation menu presentation mode. */
    readonly bottom?: { readonly mode?: MenuMode };
  };
  readonly density?: UiDensity;
  readonly content?: { readonly width?: ContentWidth };
  /** P5-3 — generalized presentation intent (optional; Foundation defaults supply the rest). */
  readonly presentation?: {
    readonly typography?: PresentationTypography;
    readonly rhythm?: PresentationRhythm;
    readonly surface?: PresentationSurface;
    readonly header?: PresentationHeader;
    readonly hero?: PresentationHero;
  };
  readonly cta?: {
    readonly enabled?: boolean;
    readonly action?: CtaAction;
    readonly label?: string;
    readonly href?: string;
    readonly style?: CtaStyle;
    /** P5-5 — optional icon asset (plain public/assets filename; "" = none). */
    readonly icon?: string;
    /** P5-5 — icon placement within the CTA. */
    readonly iconPosition?: IconPosition;
    /** P5-5 — semantic CTA state. */
    readonly state?: CtaState;
  };
  readonly theme?: { readonly mode?: ThemeMode; readonly radius?: ThemeRadius; readonly background?: string };
}

/**
 * UI configuration resolution (UI-02 - Configuration Infrastructure).
 *
 * The single, deterministic resolution machinery for the intent-level
 * configuration surface (`UiConfigInput`, the UI-01 contract shape). It
 * produces a fully-determined `ResolvedUiConfig` through the documented
 * precedence model:
 *
 * ```text
 * explicit override (input leaf)
 *         ↓
 * Foundation canonical defaults (FOUNDATION_UI_DEFAULTS)
 *         ↓
 * completeness invariant (assertResolvedUiConfigComplete)
 * ```
 *
 * CONTRACT DECISIONS (locked, owner-approved; see .project/plan/archive/todo-milestone-ui-02.md,
 * amended by the single-presentation closure — .project/CHANGELOG.md):
 *
 * 1. ONE canonical presentation. There is no presentation/profile selection
 *    layer: resolution is exactly `override ?? FOUNDATION_UI_DEFAULTS.<leaf>`.
 *    The retired `ui.preset` key is not part of the contract surface at all —
 *    the configuration schema rejects it as an unknown key.
 * 2. Neutral CTA defaults. The Foundation never invents a business action:
 *     `cta.enabled` defaults to `false`; `action`/`label` are adopter-only
 *     strings and resolve to `undefined` when not configured（never invented）。
 * 3. Completeness is structural: every leaf that MUST resolve (all leaves except
 *     the adopter-only CTA strings `action`/`label`/`href`) must
 *     be defined or resolution throws `UiConfigResolutionError` listing the
 *     missing leaf path — future vocabulary/default growth fails loudly rather
 *     than silently resolving to `undefined`.
 * 4. Framework-neutral: pure TS (no React/Next/Zod/adapters/configuration
 *     imports);the only config coupling is the structural `UiConfigInput`
 *     shape defined in this module (no `@/config` import at all)。
 */

/** A single resolution issue, with an actionable path + message. */
export interface UiConfigResolutionIssue {
  readonly path: string;
  readonly message: string;
}

/** Thrown when the completeness invariant is violated. */
export class UiConfigResolutionError extends Error {
  readonly issues: readonly UiConfigResolutionIssue[];
  constructor(issues: readonly UiConfigResolutionIssue[]) {
    super(`Invalid resolved UI configuration:\n${issues
      .map((issue) => `  - ${issue.path}: ${issue.message}`)
      .join("\n")}`);
    this.name = "UiConfigResolutionError";
    this.issues = issues;
  }
}

/**
 * The fully-resolved, deterministic UI configuration consumed by later phases.
 *
 * Same leaf shape as the input surface, but every leaf that must resolve is
 * non-optional and fully determined.
 */
export interface ResolvedUiConfig {
  readonly shell: {
    readonly header: ShellVariant;
    readonly footer: ShellVariant;
    /** P0-1 — resolved rail collapsibility (false when no rail is composed). */
    readonly sidebar: { readonly collapsible: boolean };
  };
  readonly navigation: {
    readonly desktop: DesktopNavigationPattern;
    readonly tablet: TabletNavigationPattern;
    readonly mobile: MobileNavigationPattern;
    /** P5-5 — fully-resolved sidebar presentation intent. */
    readonly sidebar: {
      readonly mode: MenuMode;
      readonly open: { readonly icon?: string; readonly text?: string };
      readonly close: { readonly icon?: string; readonly text?: string };
    };
    readonly top: { readonly mode: MenuMode };
    readonly bottom: { readonly mode: MenuMode };
  };
  readonly density: UiDensity;
  readonly content: { readonly width: ContentWidth };
  /** P5-3 — the fully-resolved presentation intent (renderer consumes it). */
  readonly presentation: UiPresentation;
  readonly cta: {
    readonly enabled: boolean;
    readonly action?: CtaAction;
    readonly label?: string;
    /** Adopter-owned destination (UI-07 D1): never invented or inferred. */
    readonly href?: string;
    readonly style: CtaStyle;
    /** P5-5 — resolved optional CTA icon ("", absent = none). */
    readonly icon?: string;
    readonly iconPosition: IconPosition;
    readonly state: CtaState;
  };
  readonly theme: { readonly mode: ThemeMode; readonly radius: ThemeRadius; readonly background?: string };
}

const VOCAB_MEMBERSHIP: Readonly<Record<string, readonly string[]>> = {
  "shell.header": SHELL_VARIANTS,
  "shell.footer": SHELL_VARIANTS,
  "navigation.desktop": DESKTOP_NAVIGATION_PATTERNS,
  "navigation.tablet": TABLET_NAVIGATION_PATTERNS,
  "navigation.mobile": MOBILE_NAVIGATION_PATTERNS,
  "navigation.sidebar.mode": MENU_MODES,
  "navigation.top.mode": MENU_MODES,
  "navigation.bottom.mode": MENU_MODES,
  "density": UI_DENSITIES,
  "content.width": CONTENT_WIDTHS,
  "cta.style": CTA_STYLES,
  "cta.iconPosition": ICON_POSITIONS,
  "cta.state": CTA_STATES,
  "theme.mode": THEME_MODES,
  "theme.radius": THEME_RADII,
  "presentation.typography": PRESENTATION_TYPOGRAPHIES,
  "presentation.rhythm": PRESENTATION_RHYTHMS,
  "presentation.surface": PRESENTATION_SURFACES,
  "presentation.header": PRESENTATION_HEADERS,
  "presentation.hero": PRESENTATION_HEROES,
};

/**
 * Resolves ONE leaf: an explicit override wins, otherwise the Foundation
 * canonical default. There is no third (profile) layer — see the contract at the
 * top of this module.
 */
function resolveLeaf<T>(override: T | undefined, foundationValue: T): T {
  return override ?? foundationValue;
}

/**
 * Asserts that a resolved-shaped object is COMPLETE (every leaf that must
 * resolve is defined; the adopter-only CTA strings `action`/`label`/`href`
 * are intentionally optional) and that vocab-backed leaves are members of the
 * shipped vocabulary.
 *
 * Exported for testability: future Foundation-default additions (new fields)
 * fail loudly here rather than silently resolving to `undefined`.
 */
export function assertResolvedUiConfigComplete(
  resolved: Readonly<Partial<ResolvedUiConfig>>,
): asserts resolved is ResolvedUiConfig {
  const issues: UiConfigResolutionIssue[] = [];

  const check = (path: string, value: unknown): void => {
    if (value === undefined) {
      issues.push({ path, message: "missing resolved value (no override or Foundation default provided)" });
    } else {
      const members = VOCAB_MEMBERSHIP[path];
      if (members && !members.includes(value as string)) {
        issues.push({
          path,
          message: `value "${String(value)}" is not a member of the shipped vocabulary (expected one of: ${members.join(", ")})`,
        });
      }
    }
  };

  check("shell.header", resolved.shell?.header);
  check("shell.footer", resolved.shell?.footer);
  check("shell.sidebar.collapsible", resolved.shell?.sidebar?.collapsible);
  check("navigation.desktop", resolved.navigation?.desktop);
  check("navigation.tablet", resolved.navigation?.tablet);
  check("navigation.mobile", resolved.navigation?.mobile);
  check("navigation.sidebar.mode", resolved.navigation?.sidebar?.mode);
  check("navigation.top.mode", resolved.navigation?.top?.mode);
  check("navigation.bottom.mode", resolved.navigation?.bottom?.mode);
  check("density", resolved.density);
  check("content.width", resolved.content?.width);
  check("cta.enabled", resolved.cta?.enabled);
  check("cta.style", resolved.cta?.style);
  check("cta.iconPosition", resolved.cta?.iconPosition);
  check("cta.state", resolved.cta?.state);
  check("theme.mode", resolved.theme?.mode);
  check("theme.radius", resolved.theme?.radius);
  check("presentation.typography", resolved.presentation?.typography);
  check("presentation.rhythm", resolved.presentation?.rhythm);
  check("presentation.surface", resolved.presentation?.surface);
  check("presentation.header", resolved.presentation?.header);
  check("presentation.hero", resolved.presentation?.hero);

  if (issues.length > 0) {
    throw new UiConfigResolutionError(issues);
  }
}

/**
 * Resolve the validated intent-level UI configuration into a fully-determined,
 * deterministic resolved configuration (see precedence model above)。
 *
 * Pure function: does NOT mutate its input; produces a fresh object each call;
 * free of state and application/business assumptions.
 */
export function resolveUiConfig(raw: UiConfigInput): ResolvedUiConfig {
  // ONE canonical presentation: there is no preset/profile selection step — a
  // leaf resolves from an explicit override or from the Foundation canonical
  // default (`FOUNDATION_UI_DEFAULTS`). The schema, loader and every other
  // module inject nothing.
  const resolved: ResolvedUiConfig = {
    shell: {
      header: resolveLeaf(raw.shell?.header, FOUNDATION_UI_DEFAULTS.shell.header),
      footer: resolveLeaf(raw.shell?.footer, FOUNDATION_UI_DEFAULTS.shell.footer),
      sidebar: {
        collapsible: resolveLeaf(
          raw.shell?.sidebar?.collapsible,
          FOUNDATION_UI_DEFAULTS.shell.sidebar.collapsible,
        ),
      },
    },
    navigation: {
      desktop: resolveLeaf(raw.navigation?.desktop, FOUNDATION_UI_DEFAULTS.navigation.desktop),
      tablet: resolveLeaf(raw.navigation?.tablet, FOUNDATION_UI_DEFAULTS.navigation.tablet),
      mobile: resolveLeaf(raw.navigation?.mobile, FOUNDATION_UI_DEFAULTS.navigation.mobile),
      // P5-5 — sidebar/top/bottom presentation values are adopter configuration
      // with Foundation defaults (the canonical composition leaves them open).
      sidebar: {
        mode: resolveLeaf(raw.navigation?.sidebar?.mode, FOUNDATION_UI_DEFAULTS.navigation.sidebar.mode),
        open: {
          icon: resolveLeaf(raw.navigation?.sidebar?.open?.icon, FOUNDATION_UI_DEFAULTS.navigation.sidebar.open.icon),
          text: resolveLeaf(raw.navigation?.sidebar?.open?.text, FOUNDATION_UI_DEFAULTS.navigation.sidebar.open.text),
        },
        close: {
          icon: resolveLeaf(raw.navigation?.sidebar?.close?.icon, FOUNDATION_UI_DEFAULTS.navigation.sidebar.close.icon),
          text: resolveLeaf(raw.navigation?.sidebar?.close?.text, FOUNDATION_UI_DEFAULTS.navigation.sidebar.close.text),
        },
      },
      top: { mode: resolveLeaf(raw.navigation?.top?.mode, FOUNDATION_UI_DEFAULTS.navigation.top.mode) },
      bottom: { mode: resolveLeaf(raw.navigation?.bottom?.mode, FOUNDATION_UI_DEFAULTS.navigation.bottom.mode) },
    },
    density: resolveLeaf(raw.density, FOUNDATION_UI_DEFAULTS.density),
    content: {
      width: resolveLeaf(raw.content?.width, FOUNDATION_UI_DEFAULTS.content.width),
    },
    presentation: {
      typography: resolveLeaf(
        raw.presentation?.typography,
        PRESENTATION_DEFAULTS.typography,
      ),
      rhythm: resolveLeaf(raw.presentation?.rhythm, PRESENTATION_DEFAULTS.rhythm),
      surface: resolveLeaf(raw.presentation?.surface, PRESENTATION_DEFAULTS.surface),
      header: resolveLeaf(raw.presentation?.header, PRESENTATION_DEFAULTS.header),
      hero: resolveLeaf(raw.presentation?.hero, PRESENTATION_DEFAULTS.hero),
    },
    cta: {
      enabled: resolveLeaf(raw.cta?.enabled, FOUNDATION_UI_DEFAULTS.cta.enabled),
      action: resolveLeaf(raw.cta?.action, FOUNDATION_UI_DEFAULTS.cta.action),
      label: resolveLeaf(raw.cta?.label, FOUNDATION_UI_DEFAULTS.cta.label),
      href: resolveLeaf(raw.cta?.href, FOUNDATION_UI_DEFAULTS.cta.href),
      style: resolveLeaf(raw.cta?.style, FOUNDATION_UI_DEFAULTS.cta.style),
      icon: resolveLeaf(raw.cta?.icon, FOUNDATION_UI_DEFAULTS.cta.icon),
      iconPosition: resolveLeaf(raw.cta?.iconPosition, FOUNDATION_UI_DEFAULTS.cta.iconPosition),
      state: resolveLeaf(raw.cta?.state, FOUNDATION_UI_DEFAULTS.cta.state),
    },
    theme: {
      mode: resolveLeaf(raw.theme?.mode, FOUNDATION_UI_DEFAULTS.theme.mode),
      radius: resolveLeaf(raw.theme?.radius, FOUNDATION_UI_DEFAULTS.theme.radius),
      // FS-5 — background is ADOPTER-OWNED presentation (an optional hex color).
      // Absent → undefined → the existing `--background` design token renders.
      // Validated by the config schema (COLOR_HEX_PATTERN); the resolver only
      // passes the (already-validated) value through.
      background: raw.theme?.background,
    },
  };

  assertResolvedUiConfigComplete(resolved);
  return resolved;
}