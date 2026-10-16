import type { ReactNode } from "react";

import { AppShell } from "@/components/ui/app-shell";
import { Cta, isCtaRenderable } from "@/components/ui/cta";
import { ShellTopClearance } from "./shell-top-clearance";
import { Sidebar, type SidebarSelectionPolicy } from "@/components/ui/sidebar";
import type { PageRegionBinding } from "@/core/region";
import type { ResolvedUiConfig } from "@/core/ui";
import {
  bandClassName,
  bottomBarCompositions,
  contentWidthClass,
  densityClass,
  layoutScopeAttributes,
  mobileDisclosureCompositions,
  mobileSurfaceBands,
  railCompositions,
  railLayouts,
  resolveControlPresentation,
  resolveShellPattern,
  shellLayoutCompositions,
  type MenuMode,
  type ShellBand,
  type ShellLayout,
} from "@/core/ui";

import { ShellBottomBar, type ShellBottomBarLink } from "./shell-bottom-bar";
import { ShellMobileNav } from "./shell-mobile-nav";
import type { SiteSet } from "@/core/site";

/**
 * R3 — THE SIDEBAR'S NAVIGATION-SELECTION POLICY, ONE BAND AT A TIME.
 * =================================================================
 *
 * What SELECTING a destination inside the rail does to an OPEN rail, per viewport band. The composer declares
 * it because the composer is what knows which band it is composing: each rail below is composed for exactly
 * ONE band, behind a width gate this engine already owns, so no rail needs to measure the viewport itself and
 * no second responsive system appears (`@/components/ui/sidebar` holds the vocabulary and the rule).
 *
 *   mobile   `"close"`     the mobile band's long-standing contract: below `md` the expanded rail is an
 *                          OVERLAY, so choosing a destination dismisses it and the destination is immediately
 *                          visible beside the collapsed sticky rail.
 *   tablet   `"preserve"`  the expanded ≥md rail is IN FLOW — part of the page, not an overlay — so there is
 *                          nothing to dismiss: the visitor's own Show/Hide control stays the only thing that
 *                          changes it. An OPEN rail stays open; a CLOSED rail stays closed.
 *   desktop  `"preserve"`  the same reasoning, stated separately.
 *
 * THREE SEPARATE ENTRIES, deliberately, even though tablet and desktop currently agree: the owner may revise
 * one band's policy in a future task without touching the others, and an exhaustive `Record<ShellBand, …>`
 * turns a fourth band into a type error rather than a silent default.
 */
export const SIDEBAR_SELECTION_POLICY_BY_BAND: Readonly<Record<ShellBand, SidebarSelectionPolicy>> =
  Object.freeze({
    mobile: "close",
    tablet: "preserve",
    desktop: "preserve",
  });

/**
 * ShellEngine (UI-04/UI-05 — Shell Engine).
 *
 * The framework-layer orchestration component. It consumes RESOLVED SEMANTIC
 * INTENT (`ResolvedUiConfig`, UI-02) plus business CONTENT SLOTS and composes
 * the responsive shell around the SHARED PRIMITIVES (UI-03).
 *
 * UI-05 additions (locked founder decisions):
 *  - ASIDE composition: desktop `sidebar` / tablet `collapsed-sidebar` render
 *    via the `Sidebar` primitive in TWO deterministic bands (desktop
 *    `hidden lg:block`, tablet `hidden md:block lg:hidden`) with distinct ids
 *    and mutually exclusive responsive classes — at any width exactly ONE
 *    sidebar landmark is exposed, with zero `useId`/hydration risk.
 *  - MOBILE "bottom-bar": composed via `ShellBottomBar`, which renders EVERY
 *    configured navigation destination directly and WRAPS the rows as the width
 *    requires (R1 — the former "first four + More drawer" content split was
 *    retired by the owner; nothing is hidden behind an overflow control).
 *  - CTA: composed ONLY when `resolved.cta.enabled` AND label+href are
 *    supplied, placed per the decision's structural slot (header/aside/
 *    bottom). The engine NEVER invents an action, href, label, or meaning.
 *
 * LAYOUT FIDELITY (UI-04, owner-applied wording): the `header` slot carries
 * brand + switchers (+ header-slot nav) composed by the CONTENT layer, so
 * established header markup stays as-is at desktop/tablet for header-slot
 * compositions; below `md` the mobile layer (drawer/overlay/bottom-bar) takes
 * over.
 *
 * BOUNDARIES (master §7 + UI-05 requirement E): the engine branches ONLY on
 * resolved VOCABULARY/STRUCTURAL values (`sidebar`, `collapsed-sidebar`,
 * `bottom-bar`, `drawer`, `overlay`, `top`, `header`/`aside` slots, ctaSlot)
 * — NEVER presentation identity; it imports no configuration; config-derived context
 * (locale, pageBindings) arrives via props.
 */
export interface ShellEngineProps {
  /** The resolved UI configuration (UI-02). */
  readonly resolved: ResolvedUiConfig;
  /** Header content slot: brand + switchers (+ header-slot nav) via the content layer. */
  readonly header: ReactNode;
  /** Main content (the primary landmark receives `id={mainId}`). */
  readonly main: ReactNode;
  /** Footer content slot. */
  readonly footer: ReactNode;
  /**
   * R1 — an optional frame-level band presented IMMEDIATELY BELOW the header and ABOVE everything else the
   * frame composes (the sidebar lead, the rail, the main landmark). It has no landmark and no wrapper of its
   * own, because its consumer's surface (`SiteNotice`) is already a semantic `<aside>`: the frame's job is
   * only to place shell chrome where the page structure cannot move it. Absent → nothing is rendered, so a
   * build that presents no notice is byte-identical to before.
   */
  readonly notice?: ReactNode;
  /** Deterministic id for the `<main>` landmark (skip-link target). */
  readonly mainId: string;
  /** Optional class for the `<main>` landmark (layout-fidelity, e.g. `flex-1`). */
  readonly mainClassName?: string;
  /** Accessible label for the optional navigation slot. */
  readonly navigationLabel?: string;
  /**
   * The SIDEBAR's navigation content (its ordered list). Rendered inside the rail where the
   * rail is composed, and inside the composition's constrained-width disclosure where it is
   * not — one model, two presentations, never a duplicate authority (NAV1B).
   */
  readonly asideContent?: ReactNode;
  /**
   * P6-1 — localized labels for the sidebar disclosure toggle: `show` while
   * the rail is collapsed ("Show navigation"), `hide` while open ("Hide navigation").
   * Same vocabulary as the mobile drawer/overlay trigger + close control.
   */
  readonly sidebarLabels?: { readonly show: string; readonly hide: string };
  /**
   * P6-1 — the sidebar "show" control content (icon asset filename + optional
   * visible text) resolved by the content layer from `ui.navigation.sidebar.open`
   * (icons pre-screened against public/assets by the framework layer; missing
   * leaves → shipped asset + localized label via resolveControlPresentation).
   */
  readonly sidebarOpen?: { readonly icon?: string; readonly text?: string };
  /** P6-1 — the sidebar "hide" control content (see `sidebarOpen`). */
  readonly sidebarClose?: { readonly icon?: string; readonly text?: string };
  /** Region-aware bottom-bar spec (mobile "bottom-bar" pattern). */
  readonly bottomNav?: {
    readonly label: string;
    readonly links: readonly ShellBottomBarLink[];
    readonly demoBadgeLabel?: string;
    /** P5-5 — bottom-menu presentation mode (open | compact | closed). */
    readonly mode?: MenuMode;
  };
  /** Client nav context: current locale + configured region page bindings. */
  readonly locale: string;
  readonly pageBindings: readonly PageRegionBinding[];
  /**
   * S1E3A — the resolved sites, passed down like every other config-derived value (the engine
   * layer imports no configuration; see the UI-04 boundary).
   */
  readonly siteSet: SiteSet;
  /** Optional <md frame-level layer (drawer/bottom bar etc.). */
  readonly mobileNavigation?: ReactNode;
  /** CTA label (only composed when `resolved.cta.enabled`). */
  readonly ctaLabel?: string;
  /** CTA href (only composed when `resolved.cta.enabled`). */
  readonly ctaHref?: string;
}

export function ShellEngine({
  resolved,
  header,
  notice,
  main,
  footer,
  mainId,
  mainClassName,
  navigationLabel,
  asideContent,
  sidebarLabels,
  sidebarOpen,
  sidebarClose,
  bottomNav,
  locale,
  pageBindings,
  siteSet,
  mobileNavigation,
  ctaLabel,
  ctaHref,
}: ShellEngineProps) {
  const decision = resolveShellPattern(resolved);
  // N2 — the LAYOUT PRESENTATION. With the switcher disabled this is the single
  // composition the shell has always produced. With it enabled the shell exposes the
  // structures of BOTH layouts and marks each one with the layouts it IS the active
  // navigation for (`layoutScopeAttributes`); the stylesheet then exposes exactly one
  // of them for the active `data-ui-shell-layout` value, so two structures can never
  // be focusable or announced at once. NAV1A — the MOBILE surface is one of those
  // structures: the sticky bar below `md` belongs to the layout whose mobile
  // composition IS the bottom bar, and a sidebar layout presents its own drawer
  // instead (composed by the content layer in the shell's top region).
  const layoutCompositions = shellLayoutCompositions(resolved);
  const scopedLayouts = layoutCompositions.some((composition) => composition.scoped);
  const desktopRail = railCompositions(resolved, "desktop");
  const tabletRail = railCompositions(resolved, "tablet");
  const desktopRailLayouts = railLayouts(resolved, "desktop");
  const tabletRailLayouts = railLayouts(resolved, "tablet");
  // NAV1D — THE SIDEBAR'S MOBILE BAND IS THE SAME RAIL. A composition that names
  // `navigation.mobile: "persistent-sidebar"` places a rail in the aside slot for the MOBILE band
  // too, exactly as the `sidebar`/`collapsed-sidebar` leaves do for the two wider bands, so the
  // engine composes one more instance of the SAME `Sidebar` primitive rather than the capability's
  // off-canvas disclosure. Nothing about the rail differs by band: same markup, same classes, same
  // visitor-owned state — only the width gate that presents it.
  const mobileRail = railCompositions(resolved, "mobile");
  const mobileRailLayouts = railLayouts(resolved, "mobile");
  // NAV1A/NAV1B — the composed mobile BARS: one per composition whose MOBILE navigation IS the
  // sticky bar, each carrying the width gate ITS composition presents it at. The gate is derived
  // from the composition's bands (never from a call-site breakpoint), so the canonical sidebar
  // composition keeps the historic `<md` bar while a Menu-bar composition — whose ≥md top menu is
  // closed, its navigation being this bar — presents it at EVERY width. At most one bar is exposed.
  const mobileBarCompositions = bottomBarCompositions(resolved);
  // NAV1B — the constrained-width navigation of a composition that DOES declare a disclosure
  // (`navigation.mobile: "drawer" | "overlay"`), composed at the SIDEBAR/SHELL BOUNDARY (not in the
  // page header), so the affordance has one stable place and cannot migrate between header rows as
  // width changes. NAV1D — a `persistent-sidebar` composition declares none and reaches here with
  // an empty list, so the sidebar mode composes no disclosure band, no trigger and no dialog.
  const mobileDisclosureCompositionList = mobileDisclosureCompositions(resolved);
  const asideActive =
    (desktopRail.length > 0 || tabletRail.length > 0 || mobileRail.length > 0) &&
    asideContent !== undefined;
  // …and whether that rail is composed BESIDE the content at EVERY width. Where it is, the page
  // frame is a wrapping row from the smallest supported width (the rail is the same sidebar there,
  // never a top-of-page list) and the header/footer/CTA regions keep their full-width row, exactly
  // as they already do at `md` and up for a rail composition.
  const railAtMobile = mobileRail.length > 0;
  // The regions that must break to their own full-width row in an aside composition (P6-3B): the
  // width basis a row needs, at the widths the rail is present beside the content. NAV1D — where the
  // rail is beside the content at EVERY width the content column is shrinkable (`min-w-0`), so a
  // full-width region must ALSO claim its own line (`basis-full`): with the content column's basis
  // at 0 a wrapping row would otherwise place the footer (or the bar) beside it — fitting on paper,
  // and overflowing the viewport once the content column grew back to the space left over.
  const regionWidthClass = asideActive ? (railAtMobile ? "w-full basis-full" : "md:w-full") : undefined;

  // Default (header-slot) path stays byte-identical (UI-04): flex column,
  // full page width to header/footer. The aside layout switches the page frame
  // to a wrapping row at `md` and up (P6-3B — see below) so the rail sits BESIDE
  // main at every width where a sidebar band is composed.
  //
  // P6-3B — the row now applies at `md` (not only `lg`). Previously the aside
  // composition was a row at `lg` but a STACKED COLUMN at `md`–`lg`, so the
  // tablet sidebar band (`md:block`) rendered as a full-width vertical list at
  // the TOP of the page content — the reported tablet defect. The aside band
  // breakpoints themselves are unchanged (`md:block` / `lg:*`): the fix is that
  // any composed rail is laid out as a side rail, never a top-of-content list.
  // …and the frame carries the ONE marker of the shell's page layout (`ui-shell-frame`), which owns
  // the deliberate minimum layout width the stylesheet declares (NAV1D-V2): the shell's geometry has
  // an established supported-minimum floor (280px, FOUNDATION-UI-R1D) instead of shredding itself
  // below it.
  const wrapperClass = `ui-shell-frame flex flex-col flex-1 ${asideActive ? (railAtMobile ? "flex-row flex-wrap" : "md:flex-row md:flex-wrap") : ""} ${densityClass(resolved.density)} ${contentWidthClass(resolved.content.width)}`.replace(/\s+/g, " ").trim();

  // P0-2/P6-3C — the primary CTA is the one shared `Cta` capability. `Cta` owns
  // WHETHER one exists (enabled ∧ href ∧ (label ∨ icon) ∧ a real accessible
  // name) and its prominence/presentation; the engine owns WHERE it sits.
  // P6-3C — that place is the ONE authoritative top region: below the header,
  // above `<main>`, rendered exactly once for EVERY viewport and structurally
  // OUTSIDE the aside rail and the mobile navigation layers. The former
  // per-viewport placements (aside band / bottom bar / drawer / overlay) are
  // gone, so a Book Now can never be duplicated, collapsed away, or obscured.
  // Nothing here invents a label or href; P5-5 icon/state flow through as before.
  const ctaNode = isCtaRenderable(
    resolved.cta.enabled,
    ctaLabel,
    ctaHref,
    resolved.cta.icon,
    resolved.cta.action,
  ) ? (
    <Cta
      enabled={resolved.cta.enabled}
      style={resolved.cta.style}
      label={ctaLabel}
      href={ctaHref}
      action={resolved.cta.action}
      icon={resolved.cta.icon}
      iconPosition={resolved.cta.iconPosition}
      state={resolved.cta.state}
      className="ui-shell-cta"
    />
  ) : null;
  const topCtaNode = decision.cta.present ? ctaNode : null;

  // ── NAV1B — THE SIDEBAR'S CONSTRAINED-WIDTH NAVIGATION, AT THE SIDEBAR BOUNDARY ─────────
  //
  // Where the rail is NOT composed, the configured MODE still owns the navigation: the sidebar
  // composition presents its own disclosure — the same control vocabulary as the rail's toggle
  // (configured icon + Show/Hide navigation copy), the same navigation list — in ONE stable place
  // immediately below the header region and above the content row.
  //
  // It is deliberately NOT part of the page header. Inside the header it shared a wrapping row
  // with the identity and the visitor controls, so it migrated between header lines and grew with
  // the header's typography as the width narrowed (the reported defect). Here its band carries the
  // SAME width gate its composition declares, its marker pair (`mobile-drawer` + the layouts it
  // serves) keeps exactly one mobile navigation exposed at a time, and an open drawer withdraws
  // itself when the visitor switches to another mode.
  const sidebarDisclosure =
    mobileDisclosureCompositionList.length > 0 && asideContent !== undefined ? (
      <>
        {mobileDisclosureCompositionList.map((composition) => (
          <div
            key={composition.layout ?? "sidebar-disclosure"}
            className={[
              "ui-shell-sidebar-disclosure",
              bandClassName(mobileSurfaceBands(composition.decision)),
              asideActive ? "md:w-full" : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
            {...layoutScopeAttributes(
              "mobile-drawer",
              composition.layout === null ? [] : [composition.layout],
              scopedLayouts,
            )}
          >
            <ShellMobileNav
              // The sidebar composition's own disclosure pattern (drawer or overlay).
              pattern={composition.decision.mobile.primitiveKind === "overlay" ? "overlay" : "drawer"}
              id="shell-mobile-nav"
              triggerLabel={sidebarLabels?.show ?? "Show navigation"}
              closeLabel={sidebarLabels?.hide ?? "Hide navigation"}
              activeLayouts={composition.layout === null ? undefined : [composition.layout]}
              open={sidebarOpen}
              close={sidebarClose}
            >
              {asideContent}
            </ShellMobileNav>
          </div>
        ))}
      </>
    ) : null;

  // ── PERSISTENT NAVIGATION — the shell's TOP region, and WHERE it persists ──
  //
  // The region is the header: identity, any header-slot primary navigation, and
  // the mobile disclosure trigger. Nothing here belongs to the aside rail, so
  // collapsing or expanding the rail can neither move nor clip anything in it.
  //
  // WHY THE HEADER GETS ITS OWN CONTAINER: `position: sticky` is bounded by its
  // CONTAINING BLOCK, so a persistent element must be a direct child of the tall
  // shell frame — not of a content-sized box, which would give it no room to stay
  // pinned (globals.css — persistent navigation).
  //
  // `md:w-full` ALSO carries the P0-1 (converged from the verified UI-12.2 demo
  // fix) layout rule: in the ASIDE composition the page frame becomes a wrapping
  // row (`md:flex-row md:flex-wrap`, P6-3B). The header is a flex ITEM like the
  // rail and `<main>`, so without an explicit full-width basis it sits INLINE
  // beside the sidebar (seen live: header 36%, rail 240px beside it, main
  // squeezed to 45%). The header must break to its own full-width row above the
  // rail/main row; the footer does the same below. Header-slot compositions
  // (asideActive === false) are untouched.
  //
  // WHICH REGION PERSISTS AT WHICH WIDTH: one marker class per viewport band
  // whose composition puts the RAIL beside the content. There the rail is the
  // persistent primary navigation, so the top region scrolls normally — the two
  // can never be sticky at once, can never overlap, and never need a measured
  // offset between them. Where no rail band is composed (a header-slot
  // composition, or every width below `md`) the header itself carries the
  // navigation, so it persists instead. Both markers are pure functions of the
  // resolved slot vocabulary; no configuration and no composition identity is
  // read here.
  const railBesideMd = asideActive && tabletRail.length > 0;
  const railBesideLg = asideActive && desktopRail.length > 0;
  // NAV1D — a rail composed at EVERY width means the top region is never the persistent
  // navigation: the rail is, at every width, so the top region stays in normal flow throughout.
  const railBesideSm = asideActive && railAtMobile;
  const topRegion = (
    <div
      className={[
        "ui-shell-top",
        railBesideSm ? "ui-shell-top--rail-mobile" : undefined,
        railBesideMd ? "ui-shell-top--rail-md" : undefined,
        railBesideLg ? "ui-shell-top--rail-lg" : undefined,
        regionWidthClass,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {header}
      {/* R1C — the persistent top region's REAL height is published as the clearance every
          fragment target leaves for it (the static stylesheet allowance is only the no-JS/
          pre-hydration fallback). It is a sibling of the header, adds no DOM and no visual. */}
      <ShellTopClearance />
    </div>
  );

  // P6-3C — the primary CTA keeps its ONE authoritative home in the shell's TOP
  // region, directly beneath the header and structurally OUTSIDE the aside rail.
  // It stays in NORMAL FLOW and is deliberately NOT part of the persistent
  // region: persistence exists for NAVIGATION (so a visitor never has to scroll
  // back to the top of the page to reach another one), and an action is not a
  // destination list. Its position, wording and presentation are unchanged, and
  // it is still rendered exactly once, for every viewport.
  const ctaRow = topCtaNode ? (
    <div
      className={["ui-shell-header-row", regionWidthClass]
        .filter(Boolean)
        .join(" ")}
    >
      {topCtaNode}
    </div>
  ) : null;

  return (
    <div className={wrapperClass}>
      <AppShell
        header={
          <>
            {topRegion}
            {ctaRow}
          </>
        }
        main={main}
        footer={asideActive ? <div className={regionWidthClass}>{footer}</div> : footer}
        notice={notice}
        sidebar={buildAside()}
        sidebarLead={sidebarDisclosure}
        // P6-3A — the rail owns its own width (`.ui-sidebar-rail`): a horizontal
        // width state that persists in both collapsed/expanded states. The frame
        // keeps only the responsive band visibility + no-shrink — and NAV1D drops the
        // `md:` gate entirely when the rail is composed at every width, because the frame's own
        // band wrappers (not the frame) decide which band's rail is presented.
        sidebarClassName={railAtMobile ? "ui-shell-sidebar md:shrink-0" : "ui-shell-sidebar hidden md:block md:shrink-0"}
        mainId={mainId}
        // NAV1D — WHERE THE RAIL IS BESIDE THE CONTENT AT EVERY WIDTH, THE CONTENT COLUMN IS THE ONE
        // THAT SHARES THE RAIL'S ROW: `ui-shell-content-column` gives it a real flex basis (so a
        // wrapping row can never append it to a full line and give it zero width) and lets it shrink
        // to the width a narrow viewport actually leaves. See globals.css for the measurements. The
        // canonical composition without a mobile rail is byte-identical to before.
        mainClassName={
          railAtMobile
            ? [mainClassName, "ui-shell-content-column"].filter(Boolean).join(" ")
            : mainClassName
        }
        mobileNavigation={buildMobile()}
      />
    </div>
  );

  function buildAside() {
    if (!asideActive || !asideContent) return null;
    // P6-1 — the rail disclosure uses the SAME resolved control (icon + text)
    // contract as the mobile layer: missing leaves → the control the framework layer resolved; `text: ""`
    // → icon-only; `icon: ""` → text-only.
    //
    // SIDEBAR ASSET CORRECTION — there is NO filename fallback here any more. A shipped default is
    // RESOLVED by the framework layer (`resolveIconControlUrl`), because only that layer knows which of a
    // context's runtime namespaces OWNS the file: a Spoke's replaceable role artwork is served from its own
    // namespace in an explicit Installation. A lower renderer that substituted `/assets/<name>` from a bare
    // filename was exactly the defect: a broken image and a 404 wherever the platform namespace does not own
    // the role. A control composed without a resolved icon renders NO icon, never a guessed path.
    const openControl = resolveControlPresentation(sidebarOpen ?? {}, {
      fallbackText: sidebarLabels?.show ?? "Show navigation",
    });
    const closeControl = resolveControlPresentation(sidebarClose ?? {}, {
      fallbackText: sidebarLabels?.hide ?? "Hide navigation",
    });
    // P0-1 — the sidebar capability is configured (not hard-coded per band):
    // `resolved.shell.sidebar.collapsible` is the declarative intent. The
    // tablet `collapsed-sidebar` COMPOSITION additionally means
    // "collapsed-by-default, always expandable" — a property of the pattern,
    // not a second config leaf.
    //
    // NAV1D — AND IT IS RESOLVED ONCE FOR THE WHOLE RAIL, FROM THE COMPOSITION RATHER THAN THE BAND.
    // The bands present the SAME sidebar, so "is there a Show/Hide control" must not depend on which
    // band is on screen: a rail that must be expandable in one band (a `collapsed-sidebar` band is
    // collapsed by definition — never a dead-end) is expandable in every band, and a rail that is
    // collapsible nowhere renders no toggle anywhere. Reading it per band is what let the control
    // appear and disappear as the viewport crossed a breakpoint.
    const collapsedSidebarComposed = [...desktopRail, ...tabletRail, ...mobileRail].some(
      (composition) =>
        composition.decision.desktop.primitiveKind === "collapsed-sidebar" ||
        composition.decision.tablet.primitiveKind === "collapsed-sidebar" ||
        composition.decision.mobile.primitiveKind === "collapsed-sidebar",
    );
    const collapsible = collapsedSidebarComposed || resolved.shell.sidebar.collapsible;
    const renderBand = (id: string, band: ShellBand, selection: SidebarSelectionPolicy) => {
      // UI1 — THE CANONICAL NO-PREFERENCE STATE OF A COMPOSED RAIL IS CLOSED. The visitor's
      // open/closed choice is ONE presentation preference (remembered by the primitive — see
      // `@/components/ui/sidebar-preference`), so an untoggled sidebar presents the SAME state in
      // every band instead of inheriting "expanded" from whichever pattern a band resolves to. The
      // tablet `collapsed-sidebar` composition has always meant "collapsed by default"; the
      // canonical state is now the platform's one answer for a collapsible rail, and the visitor's
      // stored preference is layered on top of it (adopted before the first paint, so a document
      // reload or a client-side navigation never paints a state the visitor did not choose).
      //
      // A rail that is NOT collapsible has no disclosure state to remember (it renders no toggle),
      // so it keeps the expanded geometry its composition declares — exactly as before.
      const collapsedInitial = collapsible;
      return (
        <Sidebar
          key={band}
          id={id}
          label={navigationLabel ?? "Navigation"}
          collapsible={collapsible}
          collapsed={collapsedInitial}
          // R3 — THIS band's navigation-selection policy, from the ONE table above. The rail never infers a
          // viewport: the band it is composed for is the band it belongs to.
          selection={selection}
          // P6-1 — the disclosure consumes the SAME resolved control shape as
          // the mobile layer: missing leaves fall back to the shipped asset +
          // the localized Show/Hide label (resolveControlPresentation).
          showLabel={sidebarLabels?.show}
          hideLabel={sidebarLabels?.hide}
          open={openControl}
          close={closeControl}
        >
          {/* P6-3C — the aside rail carries NAVIGATION ONLY. The primary CTA is
              never composed here: it lives once in the shell's top region, so no
              rail state (expanded/collapsed) can obscure or clip it. */}
          {asideContent}
        </Sidebar>
      );
    };
    // NAV1D — ONE RAIL, ONE INSTANCE PER BAND, EACH BEHIND THE SAME KIND OF WIDTH GATE. The bands
    // are the mutually exclusive gates the ≥md rails have always used (at any width exactly ONE
    // rail landmark is exposed, so there is no duplicate landmark, no second focusable navigation
    // and no hidden duplicate the tab order could reach); NAV1D adds the MOBILE band for a
    // composition that declares `persistent-sidebar`, replacing the disclosure it was substituted
    // with. The instance rendered for each band is the same primitive with the same classes and the
    // same visitor-owned state — the sidebar IS the same sidebar at every width; only WHEN it is
    // presented, and (R3) what a navigation SELECTION does to it, differ, and each band states both
    // where that band is composed.
    const railBands: readonly {
      readonly id: string;
      readonly band: ShellBand;
      readonly composed: number;
      readonly gate: string;
      readonly layouts: readonly ShellLayout[];
      /** R3 — this band's own navigation-selection policy (see the table above). */
      readonly selection: SidebarSelectionPolicy;
    }[] = [
      {
        id: "shell-sidebar-desktop",
        band: "desktop",
        composed: desktopRail.length,
        gate: "hidden lg:block",
        layouts: desktopRailLayouts,
        selection: SIDEBAR_SELECTION_POLICY_BY_BAND.desktop,
      },
      {
        id: "shell-sidebar-tablet",
        band: "tablet",
        composed: tabletRail.length,
        gate: "hidden md:block lg:hidden",
        layouts: tabletRailLayouts,
        selection: SIDEBAR_SELECTION_POLICY_BY_BAND.tablet,
      },
      {
        id: "shell-sidebar-mobile",
        band: "mobile",
        composed: mobileRail.length,
        gate: "md:hidden",
        layouts: mobileRailLayouts,
        selection: SIDEBAR_SELECTION_POLICY_BY_BAND.mobile,
      },
    ];
    return (
      <>
        {railBands.map(({ id, band, composed, gate, layouts, selection }) =>
          composed > 0 ? (
            <div
              key={id}
              className={gate}
              {...layoutScopeAttributes("rail", layouts, scopedLayouts)}
            >
              {renderBand(id, band, selection)}
            </div>
          ) : null,
        )}
      </>
    );
  }

  function buildMobile() {
    // NAV1A/NAV1B — the sticky bar is exposed by the composition whose MOBILE navigation IS the
    // bottom bar; the marker pair is inert DOM state the stylesheet uses to keep exactly ONE mobile
    // navigation present at a time, and `bandsClassName` is the width gate this composition
    // declares (the canonical sidebar composition → `<md`; a Menu-bar composition → every width).
    if (mobileBarCompositions.length > 0 && bottomNav) {
      return (
        <>
          {mobileBarCompositions.map((composition) => (
            <ShellBottomBar
              key={composition.layout ?? "bottom-bar"}
              label={bottomNav.label}
              links={bottomNav.links}
              locale={locale}
              pageBindings={pageBindings}
              siteSet={siteSet}
              demoBadgeLabel={bottomNav.demoBadgeLabel}
              mode={bottomNav.mode}
              bandsClassName={bandClassName(mobileSurfaceBands(composition.decision))}
              scope={layoutScopeAttributes(
                "bottom-bar",
                composition.layout === null ? [] : [composition.layout],
                scopedLayouts,
              )}
            />
          ))}
        </>
      );
    }
    return mobileNavigation;
  }
}