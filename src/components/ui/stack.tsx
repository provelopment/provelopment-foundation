import type { ComponentPropsWithoutRef } from "react";

/**
 * P1-7 — shared Stack (flex-direction + gap) layout primitive.
 *
 * Before P1-7 the header's repeated alignment stacks were inlined as
 * `flex flex-wrap items-center gap-x-* gap-y-*` / `flex flex-col items-start
 * gap-y-2` in site-header.tsx (3×). This primitive is the single shared path
 * for those DEMONSTRATED alignment-stack contracts. Contract:
 *
 *  - minimal: ONLY what evidence demands — `direction` (row/col) + `gap`
 *    (a Tailwind gap utility token) + item alignment. No generic Flexbox API;
 *    no wrap/basis/grow (nothing demonstrated requires them);
 *  - compositional: `className` always passes through, so consumers keep their
 *    own width/responsive extras;
 *  - PRESENTATION-agnostic: no presentation branches, no config, no semantics beyond layout.
 *
 * Deliberately NOT used for: the shell page frame (flex `min-h-full` wrapper —
 * ShellEngine owns that), button/cta `inline-flex` (those are primitive-internal),
 * and the one-off hero/footer/region layouts (each is a distinct composition).
 */
export interface StackProps extends ComponentPropsWithoutRef<"div"> {
  /** Flex direction. Default `"row"`. */
  readonly direction?: "row" | "col";
  /** Gap utility token (Tailwind `gap-*`). Default `"gap-2"`. */
  readonly gap?: string;
  /** Item alignment (`items-*`). Default none — consumers supply when needed. */
  readonly items?: string;
}

const BASE = "flex";

export function Stack({ direction = "row", gap = "gap-2", items, className, children, ...rest }: StackProps) {
  const classes = [
    BASE,
    direction === "col" ? "flex-col" : "flex-wrap",
    gap,
    items,
    className,
  ].filter(Boolean).join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}