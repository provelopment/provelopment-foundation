import type { ComponentPropsWithoutRef } from "react";

/**
 * P1-7 — shared Grid (CSS multi-column layout) primitive.
 *
 * Before P1-7 the five collection listings repeated the same semantic contract
 * as inlined `<ul className="grid gap-… sm:grid-cols-2 …">`: an accessible
 * multi-column grid of cards. This primitive is the single shared path for
 * those DEMONSTRATED collection-grid contracts. Contract:
 *
 *  - semantic element: renders a `<ul>` by default; consumers pass `as="ol"`
 *    if an ordered grid is ever demonstrated (none today, so no default);
 *  - minimal alignment API: `columns` (a Tailwind `grid-cols-*` utility token,
 *    e.g. `sm:grid-cols-2 lg:grid-cols-3`) + `gap` (a `gap-*` utility);
 *  - compositional: `className` passes through (e.g. `mt-8` top spacing);
 *  - PRESENTATION-agnostic: no presentation branches, no config, no layout semantics beyond
 *    the demonstrated collection grid.
 *
 * Deliberately NOT used for: the form grid, region-block split, footer grid,
 * and the home section grid — each is a distinct one-off composition (kept
 * local). This is NOT a general CSS Grid escape hatch (no auto-fit, no
 * per-breakpoint column objects): the four demonstrated responsive column
 * patterns are exactly expressible via the `columns` utility token.
 */
export interface GridProps extends ComponentPropsWithoutRef<"ul"> {
  /** Semantic list element: `ul` (default). */
  readonly as?: "ul" | "ol";
  /** Columns utility token (e.g. `sm:grid-cols-2`, `lg:grid-cols-2`). */
  readonly columns?: string;
  /** Gap utility token (e.g. `gap-6`). Default `"gap-6"`. */
  readonly gap?: string;
}

const BASE = "grid";

export function Grid({ as = "ul", columns, gap = "gap-6", className, children, ...rest }: GridProps) {
  const Tag = as === "ol" ? "ol" : "ul";
  const classes = [BASE, columns, gap, className].filter(Boolean).join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}