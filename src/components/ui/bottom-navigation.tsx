import { NavItem, type NavItemModel } from "./nav-item";

/**
 * BottomNavigation (UI-03 — Shared UI Primitives).
 *
 * A narrow-viewport primary navigation bar (roadmap §15 "bottom-bar"/"bottom
 * navigation"). It is a SERVER component over the same NavItem primitive:
 * landmark `<nav aria-label>` + list, `aria-current="page"` on the active
 * item, built at ≥44px touch-target spacing via tokens.
 *
 * No breakpoint/media-query logic lives here — the shell engine (UI-04)
 * decides WHEN a bottom bar is the appropriate composition. Props-driven,
 * presentation-agnostic, serializable (no callbacks).
 */
export interface BottomNavigationProps {
  /** Accessible label for the landmark. */
  readonly label: string;
  /** Items (limited to a small bar set by the composer). */
  readonly items: readonly NavItemModel[];
  readonly className?: string;
  readonly linkClassName?: string;
}

export function BottomNavigation({ label, items, className, linkClassName }: BottomNavigationProps) {
  return (
    <nav aria-label={label} className={className}>
      <ul>
        {items.map((item) => (
          <NavItem key={`${item.key ?? item.href}:${item.label}`} item={item} className={linkClassName} />
        ))}
      </ul>
    </nav>
  );
}