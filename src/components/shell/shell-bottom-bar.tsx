"use client";

import { usePathname } from "next/navigation";

import { BottomNavigation } from "@/components/ui/bottom-navigation";
import type { NavItemModel } from "@/components/ui/nav-item";
import type { PageRegionBinding } from "@/core/region";
import { isInternalHref, resolveNavHref } from "@/core/regional-pages";
import { pathContextOr, sitePrefixPath, type SiteSet } from "@/core/site";
import { menuModeClass, type MenuMode } from "@/core/ui";

/**
 * ShellBottomBar (UI-05 — Shell Engine).
 *
 * The COMPOSED mobile "bottom-bar" layer for the Adaptive personality. It is
 * the interactive/region-aware counterpart of `ShellMobileNav`:
 *
 *  - resolves the same region-aware hrefs + active state as the site header's
 *    navigation (pure `@/core/regional-pages` helpers; content passes
 *    `pageBindings` + `locale` via props — no config import);
 *  - renders EVERY configured navigation destination DIRECTLY in the bar, in
 *    configuration order, flowing left-to-right and wrapping onto further rows
 *    as the width requires (R1 — the former "first four + More drawer" rule was
 *    RETIRED by the owner; no destination is hidden behind an overflow control);
 *  - composes ONLY the shared primitives (`BottomNavigation`, `NavItem`) — no
 *    presentation identity, no business rules.
 *
 * A11y contract (R1): ONE `<nav>` landmark (the bar) wherever the composition presents it, holding every
 * configured destination in configured order with `aria-current` on the active one; the rows WRAP at narrow
 * widths and never scroll horizontally, never truncate and never collapse into a drawer; every target keeps
 * the shared ≥44px box (`NavItem`'s own contract).
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
  /** Navigation content (labels already localized; hrefs resolved here). */
  readonly links: readonly ShellBottomBarLink[];
  readonly locale: string;
  /** Configured region page bindings (content layer passes its site config). */
  readonly pageBindings?: readonly PageRegionBinding[];
  /**
   * S1E3A — the deployment's resolved SITES, passed in like every other config-derived value.
   * The engine layer never imports `@/config`: it receives the site set and resolves the current
   * site/locale/region context from the URL with the ONE core helper.
   *
   * GEO-04 R10 — both this and `pageBindings` are REQUIRED by the legacy resolution path and ABSENT on the
   * EFS path, which receives `efsItems` instead and resolves nothing. Making them optional is what lets the
   * EFS document supply neither; the legacy body asserts their presence below, so a legacy caller that
   * forgets one fails loudly instead of silently resolving an empty context.
   */
  readonly siteSet?: SiteSet;
  /** Localized demo badge label (for `demoOnly` items). */
  readonly demoBadgeLabel?: string;
  /** P5-5 — bottom-menu presentation mode (open | compact | closed). */
  readonly mode?: MenuMode;
  /**
   * N2/NAV1A — inert layout-scope markers (`data-ui-shell-part` /
   * `data-ui-shell-layouts`): which composed layout(s) this bar IS the mobile
   * navigation for. The stylesheet exposes exactly one mobile surface per active
   * layout, so a bar owned by another layout is `display: none` — outside the
   * accessibility tree and the tab order. Absent → no attributes (one-composition
   * sites are byte-identical).
   */
  readonly scope?: Readonly<Record<string, string>>;
  /**
   * NAV1B — the width gate this bar is presented at, derived from the composition that owns
   * it (`bandClassName(mobileSurfaceBands(composition.decision))`): `md:hidden` for the
   * canonical sidebar composition, and NO gate for a Menu-bar composition, whose sticky bar
   * is the navigation at every width. The shell engine is the only caller that decides it;
   * the component never reads a breakpoint of its own, and the default is the shipped
   * mobile-only presentation so a direct consumer is unchanged.
   */
  readonly bandsClassName?: string;
  /**
   * GEO-04 R10 — THE EFS PRESENTATION: destinations the EFS compositor has ALREADY proved and marked.
   *
   * Present → the bar renders these items verbatim and performs NO URL resolution: no `usePathname`, no
   * `pathContextOr`, no `sitePrefixPath`, no `resolveNavHref`, no `pageBindings`/`siteSet` read. That is
   * mandatory under EFS because the shell composes no `ClientRoutingProvider`, the EFS address form is not a
   * regional page-binding address, and the `current` decision belongs to the verified view (R09), not to a
   * client pathname comparison.
   *
   * Absent → the legacy branch below is untouched, byte for byte.
   */
  readonly efsItems?: readonly ShellBottomBarEfsItem[];
}

/**
 * GEO-04 R10 — ONE ALREADY-RESOLVED EFS BAR DESTINATION.
 *
 * `active` is the publication's OWN current-Page decision, supplied by the compositor. It is never
 * recomputed here, which is why this type carries no `href` re-resolution surface at all.
 */
export interface ShellBottomBarEfsItem {
  readonly label: string;
  /** The published address, rendered VERBATIM. */
  readonly href: string;
  /** Stable, position-derived React key (two real items may share one destination). */
  readonly key: string;
  readonly active?: boolean;
  readonly external?: boolean;
  readonly icon?: string;
  readonly disabled?: boolean;
  readonly demoOnly?: boolean;
}

/**
 * NAV1A — THE STICKY BAR'S LINK LAYOUT, OWNED BY THE LIST (not the landmark).
 *
 * The rows are the `<li>` children of the `<ul>`, so this class belongs there: horizontal
 * flow, natural wrapping, and a consistent inter-link gap. The container's `px-4` page-edge
 * inset (`PAGE_EDGE_INSET_CLASS` below) IS the width the rows wrap inside, so no link text
 * can touch the viewport edge. The bar keeps its natural height and grows only when another
 * row is genuinely required — a fixed single-row height is never imposed.
 */
export const BOTTOM_NAV_LIST_CLASS = "flex flex-wrap items-center gap-x-4 gap-y-2";

/**
 * NAV1A/R1 — the bar's LINK box: the shared ≥44px interaction floor, plus the one-line rule.
 *
 * A flex item's automatic minimum size is its min-content size, so a label allowed to break inside itself
 * would let a row SQUASH its links instead of moving one onto the next line. Keeping each label on one line
 * (`whitespace-nowrap`) makes the item's minimum the full label, so a row wraps exactly when the next link
 * genuinely does not fit — which is what the wrapping contract requires.
 *
 * R1 — AND EVERY LINK CARRIES THE PLATFORM'S ≥44px TARGET BOX. The bar is now the whole navigation (every
 * configured destination renders in it, wrapping as required), so its links are the primary touch targets
 * rather than a compact subset: the same `inline-flex min-h-11 min-w-11 items-center` floor the header's
 * brand link (VIS1C/EN-M), the sidebar disclosure triggers and the footer links (VIS2S) already take. The
 * floor is LAYOUT only — typography and colour stay with the shared nav-item treatment — and it is why the
 * wrapped rows remain comfortable targets at narrow widths.
 */
export const BOTTOM_NAV_LINK_CLASS = "inline-flex min-h-11 min-w-11 items-center whitespace-nowrap";

/**
 * NAV1A — the bar's horizontal PAGE-EDGE INSET. It is the same `px-4` the header and the
 * footer use (`ui-site-header` / footer bands), so the bar shares the platform's existing
 * page-edge convention instead of introducing a second spacing system. NAV1D — the bar's
 * surface spans the viewport at EVERY width the composition presents it at (not only below
 * `md`), so the page-width container is never applied to it and this inset is the only
 * horizontal bound its content has. The rows still wrap inside it, so no link can touch the
 * viewport edge.
 */
export const PAGE_EDGE_INSET_CLASS = "px-4";

export function ShellBottomBar(props: ShellBottomBarProps) {
  // ── THE DISPATCHER CALLS NO HOOK ────────────────────────────────────────────────────────────────────
  // `usePathname` lives in the legacy child. The EFS shell composes no `ClientRoutingProvider` and does not
  // resolve addresses from the visitor's pathname, so the EFS child is hook-free; a conditional hook order
  // inside one component would be illegal, which is why the two branches are separate components.
  return props.efsItems === undefined ? (
    <LegacyShellBottomBar {...props} />
  ) : (
    <EfsShellBottomBar
      label={props.label}
      items={props.efsItems}
      demoBadgeLabel={props.demoBadgeLabel}
      mode={props.mode}
      scope={props.scope}
      bandsClassName={props.bandsClassName}
    />
  );
}

function LegacyShellBottomBar({
  label,
  links,
  locale,
  pageBindings,
  siteSet,
  demoBadgeLabel,
  mode,
  scope,
  bandsClassName = "md:hidden",
}: ShellBottomBarProps) {
  const pathname = usePathname();
  // P5-5 — "closed" means the menu is not composed at all (adopter choice;
  // Escape/backdrop/focus machinery is untouched when present).
  if (mode === "closed") return null;
  // GEO-04 R10 — the legacy resolution path's inputs. The EFS path returned above and never reaches this;
  // a legacy caller that omits either is a wiring defect, so fail loudly rather than resolve an empty
  // context and silently produce the wrong hrefs.
  if (pageBindings === undefined || siteSet === undefined) {
    throw new Error(
      "ShellBottomBar: the legacy resolution path requires `pageBindings` and `siteSet`; " +
        "an EFS composition must pass `efsItems` instead.",
    );
  }
  const parsed = pathContextOr(
    siteSet,
    pageBindings,
    pathname ?? `/${locale}`,
    locale,
  );
  const region = parsed.region;
  // S1 — links stay inside the CURRENT site: the site's own prefix is part of every href.
  const sitePrefix = sitePrefixPath(parsed.site);

  const resolved: NavItemModel[] = links.flatMap((link) => {
    const href = resolveNavHref(pageBindings, locale, region, link.href, sitePrefix);
    if (href === null) return [];
    return [
      {
        label: link.label,
        href,
        key: link.key ?? href,
        // D43 (R04-C33-R02) — the SAME folded route comparison the shared context navigation uses:
        // a Page route's letter case is not identity, so a visitor at `/de-de/About` is on the
        // `/de-de/about` Page and the bar must say so. Only the comparison is folded — the emitted
        // href, the region/site resolution and the bar's composition are unchanged, and a null
        // pathname stays non-current.
        active: pathname !== null && pathname.toLowerCase() === href.toLowerCase(),
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
  //
  // R1 — EVERY destination renders here, in configured order. `BOTTOM_NAV_LIST_CLASS` already owns the
  // wrapping, so the bar grows in height instead of hiding a destination behind an overflow control.

  return (
    <BottomBarSurface
      label={label}
      items={resolved}
      bandsClassName={bandsClassName}
      scope={scope}
      mode={mode}
    />
  );
}

/**
 * GEO-04 R10 — THE ONE BAR SURFACE, SHARED BY BOTH BRANCHES.
 *
 * The legacy and EFS branches differ ONLY in how a destination and its `current` flag are decided; the
 * SURFACE — the landmark, the sticky layer, the width gate, the layout-scope attributes, the list and link
 * classes — is one implementation, so the EFS shell cannot drift from the shipped bar visually or
 * semantically. Both branches hand it an already-resolved `NavItemModel[]`.
 */
function BottomBarSurface({
  label,
  items,
  bandsClassName = "md:hidden",
  scope,
  mode,
}: {
  readonly label: string;
  readonly items: readonly NavItemModel[];
  readonly bandsClassName?: string;
  readonly scope?: Readonly<Record<string, string>>;
  readonly mode?: MenuMode;
}) {
  // P5-5 — "closed" means the menu is not composed at all (adopter choice).
  if (mode === "closed") return null;
  return (
    <div
      // NAV1B/NAV1D — THE BAR SPANS THE VIEWPORT: it IS the sticky surface, and it keeps that
      // surface at EVERY width, in every frame. `w-full` is what makes that true inside the shell's
      // wrapping row (an aside composition lays the page out as a row at `md` and up, and NAV1D
      // extends that row to every width when the sidebar covers the mobile band): a flex item with
      // no width basis shrinks to its content there, which is how the bar came to render as a small
      // left-hand block instead of a footer-wide menu. `basis-full` additionally keeps it on a row
      // of its own, so the surface can never share a line with page content.
      //
      // NAV1D — the CONTENT inside it uses the full available WIDTH minus the page-edge inset. The
      // page's own `max-w-page` bound is deliberately NOT applied here: a navigation surface that
      // stops at the article's width is not the full-width menu this mode means, and centring a
      // handful of links inside a viewport-wide bar would leave the surface reading as an island.
      className={[
        "ui-shell-bottom-bar sticky bottom-0 z-40 w-full basis-full border-t border-border bg-background",
        bandsClassName,
        menuModeClass(mode ?? "open"),
      ]
        .filter(Boolean)
        .join(" ")}
      {...scope}
    >
      <div className={`${PAGE_EDGE_INSET_CLASS} py-1`}>
        <BottomNavigation
          label={label}
          items={items}
          listClassName={BOTTOM_NAV_LIST_CLASS}
          linkClassName={BOTTOM_NAV_LINK_CLASS}
        />
      </div>
    </div>
  );
}

/**
 * GEO-04 R10 — THE EFS BAR: presentation of already-proved destinations, and nothing else.
 *
 * It performs NO URL resolution. Every href arrives from the EFS compositor as a published address and is
 * forwarded verbatim; the `current` marker arrives from the verified view, so the bar never compares a
 * client pathname against an address computed by a different authority. `isInternalHref` is used ONLY as the
 * scheme test when the caller omits `external` — it classifies an href and can never produce one.
 */
function EfsShellBottomBar({
  label,
  items,
  demoBadgeLabel,
  mode,
  scope,
  bandsClassName,
}: {
  readonly label: string;
  readonly items: readonly ShellBottomBarEfsItem[];
  readonly demoBadgeLabel?: string;
  readonly mode?: MenuMode;
  readonly scope?: Readonly<Record<string, string>>;
  readonly bandsClassName?: string;
}) {
  const resolved: NavItemModel[] = items.map((item) => {
    const external = item.external ?? !isInternalHref(item.href);
    return {
      label: item.label,
      href: item.href,
      key: item.key,
      // An external destination is never the current Page, even if a contradictory input says so.
      active: external ? false : item.active === true,
      external,
      badge: item.demoOnly && demoBadgeLabel ? demoBadgeLabel : undefined,
      icon: item.icon,
      disabled: item.disabled,
    };
  });

  return (
    <BottomBarSurface
      label={label}
      items={resolved}
      bandsClassName={bandsClassName}
      scope={scope}
      mode={mode}
    />
  );
}
