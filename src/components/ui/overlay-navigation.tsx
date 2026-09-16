"use client";

import type { ReactNode } from "react";

import { Drawer } from "./drawer";

/**
 * OverlayNavigation (UI-03 — Shared UI Primitives).
 *
 * The visual-first, full-viewport navigation overlay (roadmap §9 / §15:
 * "overlay", "OverlayNavigation"). It is a COMPOSITION over the generic
 * `Drawer` dialog primitive: same dialog semantics, same `Escape` handling,
 * same closed-by-default SSR behavior — only the visual treatment (full-screen
 * panel vs partial drawer) differs, and that belongs to the composer/theme.
 *
 * No presentation/breakpoint policy lives here.
 */
export interface OverlayNavigationProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** id of the element that names this overlay (the trigger's label). */
  readonly labelledBy: string;
  /** Deterministic id for the overlay panel (composer-provided). */
  readonly id?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function OverlayNavigation({
  open,
  onClose,
  labelledBy,
  id = "overlay",
  children,
  className,
}: OverlayNavigationProps) {
  return (
    <Drawer open={open} onClose={onClose} labelledBy={labelledBy} id={id} className={className}>
      {children}
    </Drawer>
  );
}