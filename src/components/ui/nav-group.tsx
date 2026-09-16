"use client";

import { useState } from "react";

import { DISCLOSURE_OPEN, createInitialDisclosure, disclosureReducer } from "./state";
import { NavItem, type NavItemModel } from "./nav-item";

/**
 * NavGroup (UI-03 — Shared UI Primitives).
 *
 * A titled group of navigation items with OPTIONAL rollup capability.
 *
 *  - Static mode (SERVER): heading + list; no disclosure behavior.
 *  - Collapsible mode (CLIENT): the heading becomes a disclosure `<button>`
 *    (ARIA `aria-expanded`/`aria-controls`); open/closed initial state is
 *    controlled by the composer, and transitions use the pure
 *    `disclosureReducer` from `state.ts`. The content is conditionally
 *    rendered (never `display:none` over focusable content) so a closed group
 *    contributes nothing to the tab order.
 *
 * The panel `id` is composer-provided (deterministic and SSR-safe; avoids
 * `useId`, which is unavailable under `renderToStaticMarkup`). Props-driven
 * and presentation-agnostic: the composer decides when/where a group is collapsible.
 */
export interface NavGroupProps {
  /** Group heading (visible label). */
  readonly label: string;
  /** Items within the group. */
  readonly items: readonly NavItemModel[];
  /** Deterministic id for the collapsible panel (composer-provided). */
  readonly id?: string;
  readonly className?: string;
  readonly linkClassName?: string;
  /** When true, render as a client disclosure (default: false). */
  readonly collapsible?: boolean;
  /** Initial disclosure state (only meaningful for collapsible groups). */
  readonly defaultOpen?: boolean;
}

function NavGroupList({
  items,
  linkClassName,
}: {
  readonly items: readonly NavItemModel[];
  readonly linkClassName?: string;
}) {
  return (
    <ul>
      {items.map((item) => (
        <NavItem key={`${item.key ?? item.href}:${item.label}`} item={item} className={linkClassName} />
      ))}
    </ul>
  );
}

export function NavGroup({
  label,
  items,
  id = "navgroup",
  className,
  linkClassName,
  collapsible = false,
  defaultOpen = false,
}: NavGroupProps) {
  const [open, setOpen] = useState(createInitialDisclosure(defaultOpen));

  if (!collapsible) {
    return (
      <div className={className}>
        <h3>{label}</h3>
        <NavGroupList items={items} linkClassName={linkClassName} />
      </div>
    );
  }

  return (
    <div className={className}>
      <h3>
        <button
          type="button"
          aria-expanded={open === DISCLOSURE_OPEN}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((current) => disclosureReducer(current, { type: "toggle" }))}
        >
          {label}
        </button>
      </h3>
      {open === DISCLOSURE_OPEN ? (
        <ul id={`${id}-panel`}>
          {items.map((item) => (
            <NavItem key={`${item.key ?? item.href}:${item.label}`} item={item} className={linkClassName} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}