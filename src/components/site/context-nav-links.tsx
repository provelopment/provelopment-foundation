"use client";

import { usePathname } from "next/navigation";

import { isInternalHref, bindingsForSite, resolveNavHref } from "@/core/regional-pages";
import { pathContextOr, sitePrefixPath } from "@/core/site";
import { regionOrder, type NavRegion } from "@/core/ui";
import { NavItem } from "@/components/ui/nav-item";
import { useClientRouting } from "./client-routing-context";

export interface ContextNavLink {
  readonly href: string;
  readonly label: string;
  /** Stable React key (defaults to the resolved href when omitted). */
  readonly key?: string;
  /** Marks configured demonstration entries with a badge (Phase M refinement). */
  readonly demoOnly?: boolean;
  /** P5-5 — optional navigation-item icon (plain public/assets filename). */
  readonly icon?: string;
  /**
   * P6-3B — optional expanded-state sidebar item icon (plain public/assets
   * filename). Rendered by the sidebar rail when the rail is expanded.
   */
  readonly openIcon?: string;
  /** P6-3B — optional collapsed-state sidebar item icon (see `openIcon`). */
  readonly closedIcon?: string;
  /** P5-5 — sidebar region group (`top` | `middle` | `bottom`). */
  readonly position?: NavRegion;
  /** P5-5 — semantically disabled (aria-disabled, not navigable). */
  readonly disabled?: boolean;
}

/**
 * One ALREADY RESOLVED public navigation destination for the EFS-resolved mode.
 *
 * Plain, serialisable presentation data: a trusted server compositor decides what belongs here and sends it
 * across the boundary. Nothing in this type can be used to re-resolve a destination.
 */
export interface EfsResolvedNavItem {
  /**
   * The public address, VERBATIM. Never prefixed, folded, localised or completed here — it is rendered
   * exactly as supplied.
   */
  readonly href: string;
  /** Visible label. */
  readonly label: string;
  /**
   * Stable, POSITION-DERIVED React key. Required on purpose: two separate navigation items may legitimately
   * share one destination, so keying by anything else (or defaulting to `href`) would collapse two real
   * items into one identity.
   */
  readonly key: string;
  /**
   * The verified current-Page decision (or an explicitly documented selection result) — never recomputed
   * from a client pathname. An `external` item is never marked current, even if this is set in error.
   */
  readonly active?: boolean;
  /**
   * Whether the destination is external. Optional because the caller may rely on the shared scheme test;
   * either way it only selects which `NavItem` contract renders and can never alter `href`.
   */
  readonly external?: boolean;
  /** Semantically disabled (aria-disabled, not navigable) — the shared `NavItem` contract. */
  readonly disabled?: boolean;
  /** Marks a configured demonstration entry with the shared badge chip. */
  readonly demoOnly?: boolean;
  /** Optional resolved icon asset (from the asset-resolution seam). */
  readonly icon?: string;
  /** Optional expanded-state sidebar icon (see `icon`). */
  readonly openIcon?: string;
  /** Optional collapsed-state sidebar icon (see `icon`). */
  readonly closedIcon?: string;
  /** Presentation grouping only (`top` | `middle` | `bottom`) — never a geographic region. */
  readonly position?: NavRegion;
}

/** Props both modes share: list presentation, never destination resolution. */
interface SharedContextNavLinksProps {
  /** Optional `nav` grouping label (footer sections) or `void` (plain list). */
  readonly ariaLabel?: string;
  readonly className?: string;
  /** Extra classes applied to every link (brand vs nav vs footer styling). */
  readonly linkClassName?: string;
  /** Localized demo badge label (rendered for demo-only items). */
  readonly demoBadgeLabel?: string;
  /**
   * P5-5 — when true, links are ordered by their configured sidebar region
   * (top → middle → bottom, stable within each group). Used by the sidebar
   * surfaces (aside rail + mobile sidebar disclosure); the header top-nav and
   * footer keep configuration order.
   */
  readonly sortByRegion?: boolean;
}

/** The historical contract: the component resolves each destination itself. */
export interface LegacyContextNavLinksProps extends SharedContextNavLinksProps {
  /** Omitted or `"legacy"` — the default, unchanged behaviour. */
  readonly mode?: "legacy";
  readonly locale: string;
  readonly links: readonly ContextNavLink[];
}

/** The EFS contract: every destination was verified BEFORE this render. */
export interface EfsResolvedContextNavLinksProps extends SharedContextNavLinksProps {
  readonly mode: "efs-resolved";
  readonly items: readonly EfsResolvedNavItem[];
}

export type ContextNavLinksProps = LegacyContextNavLinksProps | EfsResolvedContextNavLinksProps;

/**
 * Phase M — URL-authoritative, region-aware navigation links.
 *
 * TWO EXPLICIT MODES, ONE COMPONENT (FOUNDATION-GEO-04 Stage B R05)
 * ================================================================
 *
 * `mode` is an OPTIONAL, defaulted discriminator: every existing caller passes `{ locale, links }` and keeps
 * the LEGACY path byte-for-byte, while an EFS caller opts in explicitly with `mode="efs-resolved"`. There is
 * no inference, no feature flag and no ambient detection — a caller always knows which contract it uses.
 *
 * LEGACY (default). Active context comes from the current URL (server-resolved, no client state). In a
 * REGIONAL context only pages that actually exist for (locale, region) are exposed (a nav item must never
 * promise one page and silently deliver another); `href === "/"` always resolves to the regional LANDING —
 * Home means "home for the currently selected location". In the generic context flat `/{locale}{href}`
 * routes are used.
 *
 * EFS-RESOLVED. The caller supplies destinations verified BEFORE rendering — each `href` is verbatim from
 * `EfsShellAddressProjection.navigation`, or the `published` href of `resolveEfsShellInternalDestination`
 * for an authored current-Site Page route, or an independently validated external link. This mode never
 * resolves, prefixes, folds, de-duplicates or re-derives a destination, and reads no pathname or
 * client-routing hook, so it renders with no legacy provider. It cannot verify authorship or owner
 * membership — that happened upstream, which is exactly why the input is a finished presentation list and
 * not a view, manifest, context or resolver.
 *
 * P0-5 (link-semantics convergence): the LINK SEMANTICS live in the shared `NavItem` primitive — internal
 * Next `<Link>`, external new-tab + `rel="noreferrer"`, `aria-current="page"` on the active internal item,
 * and the badge chip. Both modes render through that one primitive: legacy mode owns the CONTEXT NavItem
 * must not (URL/region-aware destination resolution, active-page computation from the pathname, UI-10 B2),
 * while EFS mode owns none of it because those decisions already arrived with the data.
 */
/**
 * The exported entry point owns NO hooks, so choosing a mode can never break the Rules of Hooks: each branch
 * is a separate child, and only the legacy one reads `usePathname()`/`useClientRouting()`. An EFS caller
 * therefore needs no `ClientRoutingProvider` — and would fail loudly if it ever accidentally got one.
 */
export function ContextNavLinks(props: ContextNavLinksProps) {
  if (props.mode === "efs-resolved") {
    return <EfsResolvedContextNavLinks {...props} />;
  }
  return <LegacyContextNavLinks {...props} />;
}

/**
 * The historical implementation, moved here with its body UNCHANGED so the exported wrapper can choose
 * between it and a hook-free sibling. Its destination resolution, active computation and rendered output are
 * exactly what every existing caller already gets.
 */
function LegacyContextNavLinks({
  locale,
  links,
  ariaLabel,
  className,
  linkClassName,
  demoBadgeLabel,
  sortByRegion = false,
}: LegacyContextNavLinksProps) {
  const pathname = usePathname();
  // M14 — the routing facts arrive from the SERVER's projection for the CURRENT Spoke (the ONE client
  // transport below the server composition): this component holds no configuration and can select nothing.
  const routing = useClientRouting();
  const parsed = pathContextOr(
    routing.siteSet,
    routing.pageBindings,
    pathname ?? `/${locale}`,
    locale,
  );
  // S1 — every resolved href belongs to the CURRENT site (its prefix is part of the URL),
  // so a navigation link can never leave the site it was composed for.
  const sitePrefix = sitePrefixPath(parsed.site);
  // S1E2 — the bindings are THIS site's own: a region bound to another site must not make a nav
  // item appear (or disappear) here, so the client resolver receives one site's inventory.
  const entries = bindingsForSite(routing.pageBindings, parsed.site.code);

  const resolved = links.flatMap((link) => {
    const href = resolveNavHref(entries, locale, parsed.region, link.href, sitePrefix);
    if (href === null) return [];
    return [{ ...link, href, external: !isInternalHref(link.href) }];
  });

  // B2 (UI-10): the active page is conveyed via `aria-current="page"` on the
  // internal link whose RESOLVED href is the current pathname — the same
  // route-comparison convention the bottom navigation uses
  // (shell-bottom-bar.tsx). External links never carry aria-current.
  //
  // D43 (R04-C33-R02) — a Page route's LETTER CASE is NOT identity: `/de-de/About` serves the
  // `/de-de/about` Page, so the marker compares the FOLDED address. Only the comparison is folded —
  // the emitted href, the resolution and the Platform's own spelling are untouched, and a null
  // pathname (the platform's "not available" case) stays non-current.
  const resolvedWithActive = resolved.map((link) => ({
    ...link,
    active: !link.external && pathname !== null && pathname.toLowerCase() === link.href.toLowerCase(),
  }));

  // P5-5 — sidebar surfaces order by configured region (top → middle → bottom),
  // stable within each group: predictable, keyboard/AT natural, no absolute
  // positioning, no presentation dependence.
  const ordered = sortByRegion
    ? [...resolvedWithActive].sort(
        (a, b) => regionOrder(a.position) - regionOrder(b.position),
      )
    : resolvedWithActive;

  const listClassName = className ?? "space-y-2";
  const linkClass = linkClassName ?? "hover:text-primary";

  return (
    <ul aria-label={ariaLabel} className={listClassName}>
      {ordered.map((link) => (
        <NavItem
          key={link.key ?? link.href}
          item={{
            label: link.label,
            href: link.href,
            active: link.active,
            external: link.external,
            badge: link.demoOnly && demoBadgeLabel ? demoBadgeLabel : undefined,
            icon: link.icon,
            openIcon: link.openIcon,
            closedIcon: link.closedIcon,
            disabled: link.disabled,
          }}
          className={linkClass}
        />
      ))}
    </ul>
  );
}

/**
 * THE EFS-RESOLVED RENDERING BRANCH — hook-free by construction.
 *
 * Every destination, label, key and active flag arrives already decided; this function composes the SAME
 * `ul`/`NavItem` presentation as the legacy branch and nothing else. It deliberately contains no
 * `usePathname()`, no `useClientRouting()`, no `pathContextOr`, no `sitePrefixPath`, no `bindingsForSite`, no
 * `resolveNavHref` and no pageBindings/Site-Set/region read: those are exactly the second-resolution hazards
 * this seam exists to remove. It must never be given an opportunity to run them "harmlessly" as an
 * intermediate formatter, because a second resolution is what produces mixed URLs.
 *
 * `isInternalHref` is used ONLY as the scheme test when the caller omits `external` — it classifies an href
 * and can never produce or rewrite one. `regionOrder` is the shared presentation-ordering helper for the
 * `position` grouping; it is not regional routing and reads no configuration.
 */
function EfsResolvedContextNavLinks({
  items,
  ariaLabel,
  className,
  linkClassName,
  demoBadgeLabel,
  sortByRegion = false,
}: EfsResolvedContextNavLinksProps) {
  // P5-5 — the same stable region grouping as the legacy branch (Array#sort is stable per spec), applied as
  // PRESENTATION ORDER ONLY: it never reorders within a group and never touches an href.
  const ordered = sortByRegion
    ? [...items].sort((a, b) => regionOrder(a.position) - regionOrder(b.position))
    : items;

  const listClassName = className ?? "space-y-2";
  const linkClass = linkClassName ?? "hover:text-primary";

  return (
    <ul aria-label={ariaLabel} className={listClassName}>
      {ordered.map((item) => {
        const external = item.external ?? !isInternalHref(item.href);
        return (
          <NavItem
            // The caller's stable, position-derived key — never the destination, which two real items may
            // legitimately share.
            key={item.key}
            item={{
              label: item.label,
              href: item.href,
              // An external destination is never the current page, even if a contradictory input says so.
              active: external ? false : item.active === true,
              external,
              badge: item.demoOnly && demoBadgeLabel ? demoBadgeLabel : undefined,
              icon: item.icon,
              openIcon: item.openIcon,
              closedIcon: item.closedIcon,
              disabled: item.disabled,
            }}
            className={linkClass}
          />
        );
      })}
    </ul>
  );
}