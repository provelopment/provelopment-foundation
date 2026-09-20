/**
 * VIS2S — THE SHARED FOOTER LINK TARGET CONTRACT.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The footer's links were plain inline text anchors with no minimum box, so every
 * one of them measured exactly one line tall (21px) — and the narrowest, a short
 * label like `Help`, measured 36×21. The interactive target therefore depended on
 * the LENGTH OF A LABEL, which is not something a visitor can be asked to
 * compensate for.
 *
 * The floor is the one the shared shell already applies to the header brand and
 * the mobile navigation trigger (`inline-flex min-h-11 min-w-11 items-center`):
 * Tailwind's `11` is `2.75rem` = **44px**, the programme's interactive-target
 * contract. Footer links keep their existing typography and colour treatment —
 * only the interactive BOX is guaranteed, never enlarged type.
 *
 * ONE AUTHORITY, COMPOSED: this module exports the target floor only. Each footer
 * control composes its own visual treatment on top (`hover:text-primary`, the
 * Connect heading's typography, the business-info links), so a future visual
 * change cannot silently drop the floor, and the floor cannot smuggle in a visual
 * style of its own.
 */
export const FOOTER_TARGET_CLASS = "inline-flex min-h-11 min-w-11 items-center";

/** The default footer LINK treatment: the target floor plus the hover colour. */
export const FOOTER_LINK_CLASS = `${FOOTER_TARGET_CLASS} hover:text-primary`;
