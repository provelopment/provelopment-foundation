import type {
  PresentationHeader,
  PresentationHero,
  PresentationRhythm,
  PresentationSurface,
  PresentationTypography,
  ThemeRadius,
} from "./vocabulary";

/**
 * P5-3 — Presentation intent (framework-neutral core).
 *
 * The RESOLVED `presentation` block describes HOW the shared renderer
 * presents the same content: display typography voice, section rhythm,
 * surface/card treatment, header band treatment, and home hero composition.
 *
 * This module owns the NEUTRAL defaults (the balanced/Adaptive presentation —
 * the shipped appearance) and the deterministic mapping from resolved
 * presentation values to the inert `data-ui-*` attributes the renderer layer
 * applies to `<html>` (globals.css consumes them; see
 * `src/app/globals.css` — P5-3 presentation tokens).
 *
 * Framework-neutral by design: pure data + types only (see ARCHITECTURE.md —
 * UI System Architecture). No React, Next.js, Tailwind, adapters, or config.
 */

/** The resolved presentation intent for one site/Presentation. */
export interface UiPresentation {
  /** Display/heading "voice". */
  readonly typography: PresentationTypography;
  /** Section/page vertical rhythm. */
  readonly rhythm: PresentationRhythm;
  /** Surface/card treatment family. */
  readonly surface: PresentationSurface;
  /** Header band treatment. */
  readonly header: PresentationHeader;
  /** Home hero composition. */
  readonly hero: PresentationHero;
}

/** The neutral presentation defaults (the balanced/Adaptive appearance). */
export const PRESENTATION_DEFAULTS: Readonly<UiPresentation> = {
  typography: "balanced",
  rhythm: "balanced",
  surface: "default",
  header: "default",
  hero: "default",
};

/**
 * The deterministic inert data attributes the renderer applies to `<html>`
 * for a resolved presentation. Values are vocabulary members only (never
 * presentation names), so the CSS token layer can implement presentation without
 * any presentation identity.
 */
export function presentationDataAttributes(
  presentation: Readonly<UiPresentation>,
): Readonly<Record<string, string>> {
  return {
    "data-ui-typography": presentation.typography,
    "data-ui-rhythm": presentation.rhythm,
    "data-ui-surface": presentation.surface,
    "data-ui-header": presentation.header,
    "data-ui-hero": presentation.hero,
  };
}

/** The data attribute for the resolved theme radius (corner language). */
export function radiusDataAttribute(radius: ThemeRadius): Readonly<Record<string, string>> {
  return { "data-ui-radius": radius };
}