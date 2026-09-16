"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Drawer (UI-03 — Shared UI Primitives + UI-10 behavioral gate).
 *
 * The generic client overlay/menu primitive — the single implementation behind
 * the roadmap's "MobileDrawer" / narrow-viewport drawer and overlay menus
 * (roadmap §4; `OverlayNavigation` is a compositional use of this same dialog).
 *
 * Contract:
 *  - Deterministic SSR-safe initial state: CLOSED. When `open === false`,
 *    NOTHING is rendered — no backdrop, no dialog, no hidden focusable content.
 *    Hooks are still called unconditionally (rule-of-hooks safety) but perform
 *    no DOM work while closed.
 *  - When open, renders `ui-drawer-backdrop` (a dismissing scrim) plus the
 *    dialog (`role="dialog"` + `aria-modal="true"` + `aria-labelledby={labelledBy}`
 *    + `id={id}` + `tabIndex={-1}` so the panel itself can host initial focus).
 *
 * UI-10 behavioral matrix (implemented here, shared by every disclosure
 * consumer — drawer, overlay, More-drawer — via the same structural path):
 *  - D1 focus entry: on open, focus moves to the first focusable inside the
 *    panel (or the panel itself); Tab/Shift+Tab are trapped; on close, focus
 *    RETURNS to the invoking trigger (found vocabulary-driven via
 *    `[aria-controls="${id}"]`), falling back to the previously-focused element.
 *  - D2 background inertness: while open, the platform `inert` attribute is
 *    applied to every background ancestor's siblings (never to the panel, its
 *    container, or browser chrome), and restored exactly on close.
 *  - D3 backdrop: the scrim dismisses on click/tap; Escape dismisses; the
 *    global `prefers-reduced-motion` rule governs any motion (none is added).
 *  - D4 scroll lock: the body's overflow is locked while open and restored to
 *    its prior value on close (repeated open/close cycles leak nothing).
 *
 * Props-driven and presentation-agnostic: no presentation identity, no business rules.
 * `id` is composer-provided (deterministic; avoids `useId` for SSR-safe tests).
 */
export interface DrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** id of the element that names this dialog (the trigger that controls it). */
  readonly labelledBy: string;
  /** Deterministic id for the dialog panel (composer-provided). */
  readonly id: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Focusables considered by the trap/entry. Mirrors common modal-dialog markup. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function collectFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Apply `inert` to every background ancestor's siblings so the open modal is the
 * only keyboard/a11y-reachable region (D2). Never inerts the panel/backdrop.
 *
 * When the portal mounts the panel directly under `document.body`, the walk
 * covers the body root: every app root sibling (header/main/footer container)
 * is made inert, leaving the dialog subtree the only reachable region.
 */
function setBackgroundInert(panel: HTMLElement): HTMLElement[] {
  const inerted: HTMLElement[] = [];
  let parent: HTMLElement | null = panel.parentElement;
  while (parent) {
    for (const child of Array.from(parent.children)) {
      if (
        child === panel ||
        !(child instanceof HTMLElement) ||
        child.contains(panel) ||
        child.hasAttribute("inert") ||
        child.classList.contains("ui-drawer-backdrop")
      ) {
        continue;
      }
      child.setAttribute("inert", "");
      inerted.push(child);
    }
    parent = parent.parentElement;
  }
  return inerted;
}

function restoreBackgroundInert(elements: readonly HTMLElement[]): void {
  for (const el of elements) el.removeAttribute("inert");
}

export function Drawer({ open, onClose, labelledBy, id, children, className }: DrawerProps) {
  const onCloseRef = useRef(onClose);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Keep the latest onClose without re-triggering the main behavioral effect:
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    // Focus-return target: the invoking trigger (the element that controls this
    // panel via aria-controls), found by the deterministic id relationship (B1).
    let trigger: HTMLElement | null = null;
    try {
      trigger = document.querySelector<HTMLElement>(`[aria-controls="${id}"]`);
    } catch {
      trigger = null;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const returnTarget = trigger ?? previouslyFocused;

    // D1 focus entry: first focusable inside the panel, else the panel itself.
    const firstFocusable = collectFocusable(panel)[0];
    (firstFocusable ?? panel).focus();

    // D1 containment + D3 Escape dismissal (single document keydown listener).
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = collectFocusable(panel);
      if (list.length === 0) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === list[0] || !(active && panel.contains(active))) {
          event.preventDefault();
          list[list.length - 1].focus();
        }
      } else if (active === list[list.length - 1] || !(active && panel.contains(active))) {
        event.preventDefault();
        list[0].focus();
      }
    };

    // D4 scroll lock: capture + lock, restore in cleanup (no leak across cycles).
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // D2 background inertness: applied + restored with the listener.
    const inerted = setBackgroundInert(panel);

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreBackgroundInert(inerted);
      document.body.style.overflow = previousOverflow;
      if (returnTarget && returnTarget.isConnected && document.activeElement !== returnTarget) {
        returnTarget.focus();
      }
    };
  }, [open, id]);

  if (!open) return null;

  const panelClassName = ["ui-drawer-panel", className].filter(Boolean).join(" ");
  const disclosure = (
    <>
      {/* D3 backdrop: dismissing scrim. NO onMouseDown preventDefault — a
          suppress on mousedown silences the subsequent click (proven in the
          browser matrix). The panel is a sibling rendered after this element. */}
      <div className="ui-drawer-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        id={id}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </>
  );

  // Mount AT THE DOCUMENT ROOT in the browser: the modal must overlay every
  // shell region (header/sidebar/bottom-bar). Rendering it inside a consumer's
  // header/sidebar stacks it under that region's static content (proven in the
  // browser matrix — backdrop hit-test missed the scrim). Under SSR the portal
  // is unavailable, so it renders in place — the closed/open markup the unit
  // suite asserts is unchanged.
  return typeof document === "undefined" ? disclosure : createPortal(disclosure, document.body);
}