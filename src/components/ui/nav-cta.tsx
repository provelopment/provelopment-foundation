import { NavItem, type NavItemModel } from "./nav-item";

/**
 * NavCta (UI-03 — Shared UI Primitives).
 *
 * A prominent call-to-action navigation item. Thin by design: it is a
 * server-safe NavItem with the `cta` visual variant applied — the underlying
 * semantics (link/active/external/badge) stay identical to any other NavItem.
 *
 * Deliberately NO action/pixel/placement policy: the composer decides what
 * the CTA points to and where it sits; the shell engine (UI-04) and Presentations
 * (UI-05+) decide prominence/responsive treatment.
 */
export interface NavCtaProps {
  readonly item: Omit<NavItemModel, "variant">;
  readonly className?: string;
  readonly linkClassName?: string;
}

export function NavCta({ item, className, linkClassName }: NavCtaProps) {
  // CTA prominence is applied via the item variant (pure visual intent) —
  // the Link, active, external and badge semantics remain unchanged.
  return (
    <div className={className}>
      <NavItem item={{ ...item, variant: "cta" }} className={linkClassName} />
    </div>
  );
}