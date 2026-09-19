import type { ReactNode } from "react";

import { AppShell } from "@/components/ui/app-shell";
import { Cta, isCtaRenderable } from "@/components/ui/cta";
import { Sidebar } from "@/components/ui/sidebar";
import type { PageRegionBinding } from "@/core/region";
import type { ResolvedUiConfig } from "@/core/ui";
import {
  contentWidthClass,
  DEFAULT_SIDEBAR_CLOSE_ICON,
  DEFAULT_SIDEBAR_OPEN_ICON,
  densityClass,
  resolveControlPresentation,
  resolveShellPattern,
  type MenuMode,
} from "@/core/ui";

import { ShellBottomBar, type ShellBottomBarLink } from "./shell-bottom-bar";

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
 *  - MOBILE "bottom-bar": composed via `ShellBottomBar` (deterministic
 *    content split: first `BOTTOM_NAV_PRIMARY_LIMIT` items + More drawer).
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
  /** Deterministic id for the `<main>` landmark (skip-link target). */
  readonly mainId: string;
  /** Optional class for the `<main>` landmark (layout-fidelity, e.g. `flex-1`). */
  readonly mainClassName?: string;
  /** Accessible label for the optional navigation slot. */
  readonly navigationLabel?: string;
  /** Content for the aside (sidebar) slot; rendered when desktop/tablet is aside. */
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
    readonly moreLabel: string;
    readonly links: readonly ShellBottomBarLink[];
    readonly demoBadgeLabel?: string;
    /** P6-1 — label for the explicit "Hide navigation" control in the More drawer. */
    readonly closeLabel?: string;
    /** P5-5 — bottom-menu presentation mode (open | compact | closed). */
    readonly mode?: MenuMode;
    /** P5-5 — configuration for the shared "Close navigation" disclosure control. */
    readonly sidebarClose?: { readonly icon?: string; readonly text?: string };
  };
  /** Client nav context: current locale + configured region page bindings. */
  readonly locale: string;
  readonly pageBindings: readonly PageRegionBinding[];
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
  mobileNavigation,
  ctaLabel,
  ctaHref,
}: ShellEngineProps) {
  const decision = resolveShellPattern(resolved);
  const asideActive =
    (decision.desktop.slot === "aside" || decision.tablet.slot === "aside") && asideContent !== undefined;

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
  const wrapperClass = `flex flex-col flex-1 ${asideActive ? "md:flex-row md:flex-wrap" : ""} ${densityClass(resolved.density)} ${contentWidthClass(resolved.content.width)}`.replace(/\s+/g, " ").trim();

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

  // The shell's TOP region: the header, then the single CTA beneath it. Neither
  // belongs to the aside rail, so collapsing or expanding the rail can neither
  // move the action nor clip it. No responsive duplication is needed at all —
  // the one instance is reachable at every width.
  const headerContent = topCtaNode ? (
    <div className="ui-shell-header-row">{header}{topCtaNode}</div>
  ) : (
    header
  );
  // P0-1 (converged from the verified UI-12.2 demo fix): in the ASIDE
  // composition the page frame becomes a wrapping row (`md:flex-row md:flex-wrap`,
  // P6-3B). The header is a flex ITEM like the rail and `<main>`, so without an
  // explicit full-width basis it sits INLINE beside the sidebar (seen live:
  // header 36%, rail 240px beside it, main squeezed to 45%). The header must
  // break to its own full-width row above the rail/main row; the footer does the
  // same below. Header-slot compositions (asideActive === false) are untouched.
  const headerSlot = asideActive ? (
    <div className="md:w-full">{headerContent}</div>
  ) : (
    headerContent
  );

  return (
    <div className={wrapperClass}>
      <AppShell
        header={headerSlot}
        main={main}
        footer={asideActive ? <div className="md:w-full">{footer}</div> : footer}
        sidebar={buildAside()}
        // P6-3A — the rail owns its own width (`.ui-sidebar-rail`): a horizontal
        // width state that persists in both collapsed/expanded states. The frame
        // keeps only the responsive band visibility + no-shrink.
        sidebarClassName="ui-shell-sidebar hidden md:block md:shrink-0"
        mainId={mainId}
        mainClassName={mainClassName}
        mobileNavigation={buildMobile()}
      />
    </div>
  );

  function buildAside() {
    if (!asideActive || !asideContent) return null;
    // P6-1 — the rail disclosure uses the SAME resolved control (icon + text)
    // contract as the mobile layer: missing leaves → shipped default asset +
    // the localized Show/Hide label; `text: ""` → icon-only; `icon: ""` →
    // text-only. The content layer already screened the icon filenames against
    // public/assets (availableIconName), so no broken image can be composed.
    const openControl = resolveControlPresentation(sidebarOpen ?? {}, {
      defaultIcon: DEFAULT_SIDEBAR_OPEN_ICON,
      fallbackText: sidebarLabels?.show ?? "Show navigation",
    });
    const closeControl = resolveControlPresentation(sidebarClose ?? {}, {
      defaultIcon: DEFAULT_SIDEBAR_CLOSE_ICON,
      fallbackText: sidebarLabels?.hide ?? "Hide navigation",
    });
    // P0-1 — the sidebar capability is configured (not hard-coded per band):
    // `resolved.shell.sidebar.collapsible` is the declarative intent. The
    // tablet `collapsed-sidebar` COMPOSITION additionally means
    // "collapsed-by-default, always expandable" — a property of the pattern,
    // not a second config leaf.
    const sidebarCollapsible = resolved.shell.sidebar.collapsible;
    const renderBand = (id: string, band: "desktop" | "tablet") => {
      const isDesktopBand = band === "desktop";
      const tabletCollapsedSidebar =
        !isDesktopBand && decision.tablet.primitiveKind === "collapsed-sidebar";
      // A collapsed-sidebar band is collapsible BY DEFINITION (its initial
      // state is collapsed; the user must be able to expand it — never a
      // dead-end). Non-collapsed bands follow the configured intent.
      const collapsible = tabletCollapsedSidebar || sidebarCollapsible;
      const collapsedInitial = tabletCollapsedSidebar;
      return (
        <Sidebar
          key={band}
          id={id}
          label={navigationLabel ?? "Navigation"}
          collapsible={collapsible}
          collapsed={collapsedInitial}
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
    return (
      <>
        {decision.desktop.slot === "aside" ? (
          <div className="hidden lg:block">{renderBand("shell-sidebar-desktop", "desktop")}</div>
        ) : null}
        {decision.tablet.slot === "aside" ? (
          <div className="hidden md:block lg:hidden">{renderBand("shell-sidebar-tablet", "tablet")}</div>
        ) : null}
      </>
    );
  }

  function buildMobile() {
    if (decision.mobile.primitiveKind === "bottom-bar" && bottomNav) {
      return (
        <>
          <ShellBottomBar
            label={bottomNav.label}
            moreLabel={bottomNav.moreLabel}
            links={bottomNav.links}
            locale={locale}
            pageBindings={pageBindings}
            demoBadgeLabel={bottomNav.demoBadgeLabel}
            closeLabel={bottomNav.closeLabel}
            mode={bottomNav.mode}
            sidebarClose={bottomNav.sidebarClose}
          />
        </>
      );
    }
    return mobileNavigation;
  }
}