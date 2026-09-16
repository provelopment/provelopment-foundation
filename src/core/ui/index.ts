/**
 * UI system architecture contract (UI-01).
 *
 * Barrel for the framework-neutral UI vocabulary, the canonical Foundation
 * defaults and the resolution machinery. Import from `@/core/ui`; never import
 * the inner modules directly from consumers.
 */
export {
  COLOR_HEX_PATTERN,
  CONTENT_WIDTHS,
  CTA_ACTIONS,
  CTA_STATES,
  CTA_STYLES,
  DESKTOP_NAVIGATION_PATTERNS,
  ICON_ASSET_PATTERN,
  ICON_POSITIONS,
  isIconAssetName,
  MENU_MODES,
  MOBILE_NAVIGATION_PATTERNS,
  NAV_REGIONS,
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
} from "./vocabulary";
export type {
  ContentWidth,
  CtaAction,
  CtaState,
  CtaStyle,
  DesktopNavigationPattern,
  IconPosition,
  MenuMode,
  MobileNavigationPattern,
  NavRegion,
  PresentationHeader,
  PresentationHero,
  PresentationRhythm,
  PresentationSurface,
  PresentationTypography,
  ShellVariant,
  TabletNavigationPattern,
  ThemeMode,
  ThemeRadius,
  UiDensity,
} from "./vocabulary";

export {
  PRESENTATION_DEFAULTS,
  presentationDataAttributes,
  radiusDataAttribute,
} from "./presentation";
export type { UiPresentation } from "./presentation";

export { FOUNDATION_UI_CAPABILITIES, FOUNDATION_UI_DEFAULTS } from "./defaults";
export type { UiCapabilityLevel, UiFoundationCapabilities, UiFoundationDefaults } from "./defaults";

export {
  assertResolvedUiConfigComplete,
  UiConfigResolutionError,
  resolveUiConfig,
} from "./resolve";
export type {
  ResolvedUiConfig,
  UiConfigInput,
  UiConfigResolutionIssue,
} from "./resolve";

export { contentWidthClass, densityClass, resolveShellPattern, splitBottomNavItems } from "./shell";
export { BOTTOM_NAV_PRIMARY_LIMIT } from "./shell";
export type {
  BottomNavSplit,
  PerViewportDecision,
  ShellPatternDecision,
  ShellPrimitiveKind,
} from "./shell";

export {
  DEFAULT_SIDEBAR_CLOSE_ICON,
  DEFAULT_SIDEBAR_OPEN_ICON,
  iconAssetUrl,
  menuModeClass,
  regionOrder,
  resolveControlPresentation,
} from "./controls";
export type { ControlPresentation } from "./controls";