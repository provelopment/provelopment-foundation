import type { ReactNode } from "react";

/**
 * AppShell (UI-03 — Shared UI Primitives).
 *
 * The generic composition FRAME of the Foundation shell. It is a slot
 * renderer, NOT a shell engine (master-ui-phase §6):
 *
 *  - it never decides top-vs-sidebar-vs-drawer navigation, responsive
 *    breakpoints, CTA/branding/navigation-transform policy, or Presentation
 *    selection — those belong to UI-04 (Shell Engine) and beyond;
 *  - it renders stable semantic landmarks so every composition yields an
 *    accessible page frame;
 *  - `mainId` must be provided (the skip link and directly linked anchors
 *    target it) so `id` values stay deterministic and collision-free.
 *
 * Props-driven and configuration-agnostic: consumers (UI-04) map resolved UI
 * intent into these plain props; this component imports no configuration, no
 * core, no adapters, and no resolved types.
 */
export interface AppShellProps {
  /** Header block (any composition the consumer supplies). */
  readonly header: ReactNode;
  /** Main content. The primary landmark receives `id={mainId}`. */
  readonly main: ReactNode;
  /** Footer block. */
  readonly footer: ReactNode;
  /** Optional navigation slot (sidebar rail, top bar, etc.). */
  readonly navigation?: ReactNode;
  /**
   * Optional aside/sidebar slot (UI-05). Rendered between the header and the
   * main landmark WITHOUT an extra landmark wrapper, so a consumer-side
   * navigation rail (e.g. the `Sidebar` primitive, which is itself a `<nav>`)
   * stays the SINGLE navigation landmark. Absent → renders nothing.
   */
  readonly sidebar?: ReactNode;
  /** Optional class for the sidebar wrapper (responsive placement). */
  readonly sidebarClassName?: string;
  /** Optional secondary/context panel slot (workspace-style compositions). */
  readonly secondaryPanel?: ReactNode;
  /** Optional slot for a mobile-navigation layer (drawer/bottom bar etc.). */
  readonly mobileNavigation?: ReactNode;
  /** Deterministic `id` for the `<main>` landmark (skip-link target). */
  readonly mainId: string;
  /** Optional class for the `<main>` landmark (layout-fidelity, e.g. `flex-1`). */
  readonly mainClassName?: string;
  /** Accessible label for the optional navigation landmark slot. */
  readonly navigationLabel?: string;
}

export function AppShell({
  header,
  main,
  footer,
  navigation,
  navigationLabel,
  sidebar,
  sidebarClassName,
  secondaryPanel,
  mobileNavigation,
  mainId,
  mainClassName,
}: AppShellProps) {
  return (
    <>
      {header}
      {sidebar ? <div className={sidebarClassName}>{sidebar}</div> : null}
      {navigation ? (
        <nav aria-label={navigationLabel}>{navigation}</nav>
      ) : null}
      <main id={mainId} className={mainClassName}>{main}</main>
      {secondaryPanel ? (
        <aside>{secondaryPanel}</aside>
      ) : null}
      {footer}
      {mobileNavigation ?? null}
    </>
  );
}