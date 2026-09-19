"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { DisclosureIcon } from "./disclosure-icon";
import { createInitialDisclosure, disclosureReducer, type DisclosureState } from "./state";

/**
 * Sidebar (UI-03 — Shared UI Primitives; P0-1 — global Sidebar capability).
 *
 * The persistent aside navigation rail container, and the single capability
 * behind every sidebar composition (desktop `sidebar`, tablet
 * `collapsed-sidebar`, immersive `floating` aside). It exposes a real
 * disclosure toggle (button with `aria-expanded`/`aria-controls`) so the
 * collapsed state is conveyed semantically.
 *
 * P0-1 contract (owner-approved; see plan/ui-ux-*.md):
 *  - `collapsible: true` means STRUCTURAL collapse — the panel is removed from
 *    layout and the tab order (`display:none` via the `hidden` Tailwind class)
 *    while the rail stays rendered as a reduced region. This is not an
 *    aria-only flip: a collapsed rail contains no focusable panel content.
 *  - The toggle is ALWAYS present when `collapsible` (a collapsed rail is never
 *    a dead-end): one discoverable, keyboard-accessible button conveys the
 *    current state (`aria-expanded`) and controls the panel (`aria-controls`).
 *  - `collapsed` is the INITIAL state only (true for `collapsed-sidebar`
 *    compositions, which by definition render collapsed and are expandable).
 *  - This primitive has NO rail/icon/branding/breakpoint policy. The rail
 *    content stays in the DOM regardless of collapse state — a rail is
 *    document/semantic content, not a modal (unlike `Drawer`).
 *  - Responsive interplay (expanded → collapsed → mobile overlay) is the
 *    shell-engine's composition responsibility; this primitive owns rail
 *    disclosure semantics.
 *
 * P6-1 — ONE sidebar vocabulary + ONE control contract on every breakpoint:
 *  - The toggle label FLIPS with state: `showLabel` when the rail is collapsed
 *    ("Show navigation" — the action that opens it), `hideLabel` when open
 *    ("Hide navigation"). The same two concepts drive the mobile drawer/overlay
 *    trigger + close control (ShellMobileNav), so desktop/tablet/mobile always
 *    say the same thing.
 *  - `open`/`close` are the ALREADY-RESOLVED control presentations
 *    (`{ icon, text }`, empty-string semantics identical to the mobile
 *    contract): missing leaves fell back in the composer to the shipped asset +
 *    the localized label; `text: ""` → icon-only (decorative icon, accessible
 *    name via `aria-label`); `icon: ""` → text-only (no `<img>`); BOTH `""` →
 *    P0-1 still wins: the toggle stays reachable with the localized label.
 *  - The toggle is a REAL interactive control (shared `.ui-sidebar-toggle`
 *    renderer styling: border, surface, hover/focus-visible/active affordance,
 *    pointer cursor) so it never reads as ordinary static heading text.
 *
 * Shared semantics, presentation-agnostic: `collapsible === true` means the same
 * thing in every Presentation/custom composition (the Presentation only supplies the
 * value). The UI-10 behavioral matrix covers focus/keyboard/scroll for the
 * MOBILE disclosure (a Drawer); this rail is not a modal.
 */
export interface SidebarProps {
  /** Rail content (navigation items, composer-supplied). */
  readonly children: ReactNode;
  /** Accessible label for the rail landmark. */
  readonly label: string;
  /** Deterministic id for the rail panel (composer-provided). */
  readonly id?: string;
  /** Whether the rail is user-collapsible (structural collapse + expand). */
  readonly collapsible?: boolean;
  /** Initial collapsed state (default: false). */
  readonly collapsed?: boolean;
  /** P6-1 — localized label shown while collapsed ("Show navigation"). */
  readonly showLabel?: string;
  /** P6-1 — localized label shown while open ("Hide navigation"). */
  readonly hideLabel?: string;
  /**
   * P6-1 — the RESOLVED "show" control presentation (icon + optional visible
   * text), the same shape the mobile trigger uses. Missing leaves resolve in
   * the composer; `text: ""` → icon-only; BOTH `""` → the localized label
   * fallback below (P0-1: a collapsible rail is never a dead-end).
   */
  readonly open?: { readonly icon?: string; readonly text?: string };
  /** P6-1 — the RESOLVED "hide" control presentation (see `open`). */
  readonly close?: { readonly icon?: string; readonly text?: string };
  readonly className?: string;
}

const DEFAULT_SHOW_LABEL = "Show navigation";
const DEFAULT_HIDE_LABEL = "Hide navigation";
export function Sidebar({
  children,
  label,
  id = "sidebar",
  collapsible = false,
  collapsed = false,
  showLabel,
  hideLabel,
  open,
  close,
  className,
}: SidebarProps) {
  const [state, setState] = useState<DisclosureState>(() => createInitialDisclosure(!collapsed));
  const isCollapsed = collapsible ? state === "closed" : collapsed;

  // P6-1 — the active control follows the STATE: closed → the "show" (open)
  // control; open → the "hide" (close) control. Exactly the mobile contract.
  const active = isCollapsed ? (open ?? {}) : (close ?? {});
  // P0-1 — never-dead-end fallback: with BOTH leaves empty the toggle stays
  // reachable using the localized label (never invisible, never an empty box).
  const fallbackLabel =
    isCollapsed ? showLabel ?? DEFAULT_SHOW_LABEL : hideLabel ?? DEFAULT_HIDE_LABEL;
  // P5-5/P6-1 empty-string semantics — the two "no text" states are NOT the
  // same thing, and conflating them is a bug:
  //  - `text: ""` WITH an icon → ICON-ONLY by contract: no visible text is
  //    painted (the accessible name comes from `aria-label`), which is what a
  //    collapsed rail and an adopter who deliberately removed the label rely on;
  //  - `text: ""` with NO icon (both leaves empty) → P0-1 wins and the localized
  //    label is painted, so the toggle can never be an empty, unnamed box;
  //  - `text` ABSENT → the localized `fallbackLabel` is used.
  const icon = active.icon === undefined || active.icon === "" ? undefined : active.icon;
  const iconOnly = active.text === "" && icon !== undefined;
  const visibleText = active.text !== undefined && active.text !== "" ? active.text : "";
  const toggleText = visibleText !== "" ? visibleText : iconOnly ? "" : fallbackLabel;

  return (
    <nav
      aria-label={label}
      id={`${id}-rail`}
      // P6-3A — the rail is PERSISTENT: `data-collapsed` drives a narrow
      // icon-only presentation (CSS width transition) instead of removing the
      // panel. The rail NEVER becomes `display:none`, so navigation stays in
      // the layout and the tab order in both states.
      data-collapsed={isCollapsed ? "true" : "false"}
      className={["ui-sidebar-rail", className].filter(Boolean).join(" ")}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setState((current) => disclosureReducer(current, { type: "toggle" }))}
          aria-expanded={!isCollapsed}
          aria-controls={`${id}-panel`}
          // Icon-only controls (visible text "" with an icon) keep the
          // accessible name from the localized label; decorative icon.
          aria-label={visibleText === "" && icon !== undefined ? fallbackLabel : undefined}
          className="ui-sidebar-toggle"
        >
          <DisclosureIcon asset={icon} className="ui-sidebar-toggle-icon" />
          {toggleText !== "" ? <span>{toggleText}</span> : null}
        </button>
      ) : null}
      {/* P6-3A persistent rail: the panel is ALWAYS rendered. Collapse narrows
          the rail horizontally (CSS) rather than hiding the panel — labels are
          visually hidden (but kept for assistive tech) only for icon-bearing
          items; icon-less items keep their labels so no destination becomes
          invisible/inaccessible while nav icons are unconfigured. */}
      <div id={`${id}-panel`} className="ui-sidebar-rail-panel">
        {children}
      </div>
    </nav>
  );
}