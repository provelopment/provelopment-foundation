/**
 * Shared UI primitives (UI-03).
 *
 * Barrel for the presentation-agnostic, prop-driven presentation primitives the
 * Shell Engine (UI-04) will compose and the Presentations (UI-05+) will reuse.
 *
 * IMPORTANT: importing from this barrel is allowed at the FRAMEWORK/UI layer
 * only. These components never import configuration, core, adapters, the
 * resolved UI configuration, or any Presentation — the architectural boundary tests
 * in `tests/architecture/boundaries.test.ts` enforce this.
 */
export { AppShell } from "./app-shell";
export type { AppShellProps } from "./app-shell";

export { Button } from "./button";
export type { ButtonProps } from "./button";

export { Section } from "./section";
export type { SectionProps } from "./section";

export { Empty } from "./empty";
export type { EmptyProps } from "./empty";

export { Grid } from "./grid";
export type { GridProps } from "./grid";

export { FieldError } from "./field-error";
export type { FieldErrorProps } from "./field-error";

export { CardImage } from "./card-image";
export type { CardImageProps } from "./card-image";

export { AssetIcon } from "./asset-icon";
export type { AssetIconProps } from "./asset-icon";

export { Heading } from "./heading";
export type { HeadingProps } from "./heading";

export { Stack } from "./stack";
export type { StackProps } from "./stack";

export { Navigation } from "./navigation";
export type { NavigationProps } from "./navigation";

export { NavItem } from "./nav-item";
export type { NavItemModel, NavItemProps } from "./nav-item";

export { NavGroup } from "./nav-group";
export type { NavGroupProps } from "./nav-group";

export { NavCta } from "./nav-cta";
export type { NavCtaProps } from "./nav-cta";

export { Cta, isCtaRenderable } from "./cta";
export type { CtaProps } from "./cta";

export { NavBadge } from "./nav-badge";
export type { NavBadgeProps } from "./nav-badge";

export { BottomNavigation } from "./bottom-navigation";
export type { BottomNavigationProps } from "./bottom-navigation";

export { Sidebar } from "./sidebar";
export type { SidebarProps } from "./sidebar";

export { Drawer } from "./drawer";
export type { DrawerProps } from "./drawer";

export { OverlayNavigation } from "./overlay-navigation";
export type { OverlayNavigationProps } from "./overlay-navigation";

export {
  DISCLOSURE_CLOSED,
  DISCLOSURE_OPEN,
  createInitialDisclosure,
  disclosureReducer,
} from "./state";
export type { DisclosureAction, DisclosureState } from "./state";