"use client";

import type { ComponentPropsWithoutRef } from "react";

/**
 * P1-4 — the shared Button primitive (the demonstrated primary-action contract).
 *
 * Before P1-4, exactly two consumers (`[locale]/error.tsx` reset, contact-form
 * submit) duplicated an IDENTICAL token-driven className; this primitive is the
 * single shared path for that primary action. Contract:
 *
 *  - NATIVE semantics: renders a native `<button>`. It is deliberately NOT used
 *    for links — link/CTA semantics stay with `NavItem`/`Cta`/`NavCta` (P0-2/
 *    P0-5), and the disclosure/toggle controls (Sidebar, ShellMobileNav,
 *    NavGroup collapsible) keep their bespoke structural geometry inside their
 *    own primitives (SRP).
 *  - TOKEN-driven: the single demonstrated treatment uses `bg-primary`,
 *    `text-primary-foreground`, `rounded-md` — no raw colors, no duplicated
 *    class strings in consumers.
 *  - `type` defaults to "button" (never a surprise form submit); pass
 *    `type="submit"` for a form submit. `disabled` flows through natively
 *    (`disabled:opacity-60`), and `aria-busy` passes through for live
 *    submitting-state feedback.
 *  - ACCESSIBILITY: visible keyboard focus is provided by the ONE global
 *    `:focus-visible` rule (P1-3) — this primitive adds NO focus CSS and never
 *    strips the keyboard indicator cosmetically.
 *  - PRESENTATION-agnostic: no presentation-name branches; no configuration leaf.
 *
 * Deliberately NOT consumed by `global-error.tsx`'s reset button — that root
 * fallback renders inside its own inline-styled `<html>` and therefore outside
 * the design system by contract.
 */
/**
 * Button accepts the full native `<button>` prop surface (including `disabled`,
 * `aria-busy`, `aria-label`, `onClick`); the only behavioral guardrail added is
 * the `type` default below.
 */
export type ButtonProps = ComponentPropsWithoutRef<"button">;

/** The demonstrated primary-action treatment (token-pure; matches the two
 *  pre-P1-4 consumers byte-for-byte so behavior is unchanged). */
const PRIMARY_ACTION_CLASS =
  "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60";

export function Button({ type = "button", className, children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={[PRIMARY_ACTION_CLASS, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}