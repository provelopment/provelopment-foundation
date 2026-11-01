/**
 * THE TYPED EFS PROPERTY CONTRACT (`D40` Decision A, extended by `GEO-02-R02` C2)
 * ==============================================================================
 *
 * The five-level cascade accepts any valid JSON value. A handful of keys additionally carry a
 * CONTRACT, because a consumer computes from them or publishes them, and a malformed declaration
 * must be refused before serving rather than degraded at render time:
 *
 *   - `timezone`        — a single IANA identifier, validated against the runtime's timezone table;
 *   - `openingSchedule` — structured intervals and exceptions (`opening-schedule.ts`);
 *   - `brand.name`, `contact.name`, `contact.email`, `contact.phone` — the STRING facts consumed by
 *     the `D40`-C precedence. A non-string declaration must never reach the composition, where it
 *     could otherwise be mistaken for "no value" and silently re-open the configuration fallback.
 *
 * Every other key keeps the generic validation in `properties.ts` (non-empty string, finite
 * number, JSON data) and its established, non-computing role. In particular `openingHours` remains
 * authored, display-only information and is NOT validated as a schedule: it is not one.
 *
 * This module adds no ownership tier, no resolver and no inheritance mechanism.
 */

import { efsOpeningScheduleIssue, efsTimezoneIssue } from "@/core/efs/opening-schedule";

/** The established facts whose only accepted value is a non-empty string. */
export const STRING_FACT_KEYS = [
  "brand.name",
  "contact.name",
  "contact.email",
  "contact.phone",
] as const;

/** The keys carrying a typed contract beyond the generic property validation. */
export const TYPED_PROPERTY_KEYS = [
  "timezone",
  "openingSchedule",
  ...STRING_FACT_KEYS,
] as const;

export type TypedPropertyKey = (typeof TYPED_PROPERTY_KEYS)[number];

/**
 * The issue for a typed key's value, or `null` when valid or untyped.
 *
 * Called from manifest validation for every ownership level, so an invalid declaration fails the
 * Installation instead of reaching a renderer.
 */
export function typedPropertyIssue(key: string, value: unknown): string | null {
  if ((STRING_FACT_KEYS as readonly string[]).includes(key)) {
    if (typeof value !== "string") {
      return `A "${key}" fact must be a string, received ${typeof value}.`;
    }
    return value.trim().length === 0 ? `A "${key}" fact must not be empty.` : null;
  }
  switch (key) {
    case "timezone":
      return efsTimezoneIssue(value);
    case "openingSchedule":
      return efsOpeningScheduleIssue(value);
    default:
      return null;
  }
}
