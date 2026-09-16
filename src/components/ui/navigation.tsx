import { NavItem, type NavItemModel } from "./nav-item";

/**
 * Navigation (UI-03 — Shared UI Primitives).
 *
 * The primary navigation list primitive: a landmark (`<nav aria-label>`) over
 * a list of server-safe NavItems. Prop-driven and presentation-agnostic — the
 * consumer composes which items appear and how the list is styled.
 *
 * This SERVER component NEVER operates a disclosure/drawer; responsive
 * transformation is a UI-04 shell-engine concern. A client interactive
 * navigation menu is a separate primitive.
 */
export interface NavigationProps {
  /** Accessible label for the landmark (localized by the composer). */
  readonly label: string;
  /** The items to render. */
  readonly items: readonly NavItemModel[];
  /** List class (composer-provided layout). */
  readonly className?: string;
  /** Link class applied to every item. */
  readonly linkClassName?: string;
}

export function Navigation({ label, items, className, linkClassName }: NavigationProps) {
  return (
    <nav aria-label={label}>
      <ul className={className}>
        {items.map((item) => (
          <NavItem key={`${item.key ?? item.href}:${item.label}`} item={item} className={linkClassName} />
        ))}
      </ul>
    </nav>
  );
}

export type { NavItemModel } from "./nav-item";