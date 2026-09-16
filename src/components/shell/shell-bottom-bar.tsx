"use client";

import { usePathname } from "next/navigation";

import { BottomNavigation } from "@/components/ui/bottom-navigation";
import { NavItem } from "@/components/ui/nav-item";
import type { NavItemModel } from "@/components/ui/nav-item";
import type { PageRegionBinding } from "@/core/region";
import { isInternalHref, parseRegionalPath, resolveNavHref } from "@/core/regional-pages";
import { menuModeClass, splitBottomNavItems, type MenuMode } from "@/core/ui";

import { ShellMobileNav } from "./shell-mobile-nav";

/**
 * ShellBottomBar (UI-05 — Shell Engine).
 *
 * The COMPOSED mobile "bottom-bar" layer for the Adaptive personality. It is
 * the interactive/region-aware counterpart of `ShellMobileNav`:
 *
 *  - resolves the same region-aware hrefs + active state as the site header's
 *    navigation (pure `@/core/regional-pages` helpers; content passes
 *    `pageBindings` + `locale` via props — no config import);
 *  - applies the DETERMINISTIC content rule (`splitBottomNavItems` from the
 *    decision core): the first `BOTTOM_NAV_PRIMARY_LIMIT` items render in the
 *    `BottomNavigation` bar, the remainder (when non-empty) is exposed through
 *    a closed-by-default "More" drawer;
 *  - composes ONLY the shared primitives (`BottomNavigation`, `NavItem`,
 *    `ShellMobileNav`) — no presentation identity, no business rules.
 *
 * A11y contract: single `<nav>` landmark (the bar) at <md; the More drawer is
 * a `role=dialog` overlay (closed-by-default SSR, Escape closes) that is never
 * simultaneously present in the tab order with the bar. ≥44px touch targets.
 */
export interface ShellBottomBarLink {
  readonly href: string;
  readonly label: string;
  readonly key?: string;
  readonly demoOnly?: boolean;
  /** P5-5 — optional navigation-item icon (plain public/assets filename). */
  readonly icon?: string;
  /** P5-5 — semantically disabled (aria-disabled, not navigable). */
  readonly disabled?: boolean;
}

export interface ShellBottomBarProps {
  /** Accessible label for the bar landmark (localized by the composer). */
  readonly label: string;
  /** Accessible label for the "More" drawer trigger (localized). */
  readonly moreLabel: string;
  /** Navigation content (labels already localized; hrefs resolved here). */
  readonly links: readonly ShellBottomBarLink[];
  readonly locale: string;
  /** Configured region page bindings (content layer passes its site config). */
  readonly pageBindings: readonly PageRegionBinding[];
  /** Localized demo badge label (for `demoOnly` items). */
  readonly demoBadgeLabel?: string;
  /** P6-1 — label for the explicit "Hide Sidebar" control in the More drawer
   * (the shared sidebar contract; absent → no close control renders). */
  readonly closeLabel?: string;
  /** P5-5 — bottom-menu presentation mode (open | compact | closed). */
  readonly mode?: MenuMode;
  /** P5-5 — configuration for the shared "Hide Sidebar" disclosure control. */
  readonly sidebarClose?: { readonly icon?: string; readonly text?: string };
}

export function ShellBottomBar({
  label,
  moreLabel,
  links,
  locale,
  pageBindings,
  demoBadgeLabel,
  closeLabel,
  mode,
  sidebarClose,
}: ShellBottomBarProps) {
  const pathname = usePathname();
  // P5-5 — "closed" means the menu is not composed at all (adopter choice;
  // Escape/backdrop/focus machinery is untouched when present).
  if (mode === "closed") return null;
  const parsed = parseRegionalPath(pageBindings, pathname ?? `/${locale}`);
  const region = parsed.region;

  const resolved: NavItemModel[] = links.flatMap((link) => {
    const href = resolveNavHref(pageBindings, locale, region, link.href);
    if (href === null) return [];
    return [
      {
        label: link.label,
        href,
        key: link.key ?? href,
        active: pathname === href,
        external: !isInternalHref(link.href),
        badge: link.demoOnly && demoBadgeLabel ? demoBadgeLabel : undefined,
        icon: link.icon,
        disabled: link.disabled,
      },
    ];
  });

  // P6-3C — the bar carries NAVIGATION only. The primary CTA has its single
  // authoritative home in the shell's TOP region (below the header), so it is
  // never duplicated into the bar and can never be obscured by it.
  const { primary, remainder } = splitBottomNavItems(resolved);

  return (
    <div className={`ui-shell-bottom-bar sticky bottom-0 z-40 border-t border-border bg-background md:hidden ${menuModeClass(mode ?? "open") ?? ""}`}>
      <BottomNavigation label={label} items={primary} className="flex items-center justify-around gap-x-1" />
      {remainder.length > 0 ? (
        <ShellMobileNav
          pattern="drawer"
          id="shell-bottom-more"
          triggerLabel={moreLabel}
          closeLabel={closeLabel}
          close={sidebarClose}
        >
          <ul>
            {remainder.map((item) => (
              <NavItem key={item.key ?? item.href} item={item} />
            ))}
          </ul>
        </ShellMobileNav>
      ) : null}
    </div>
  );
}
