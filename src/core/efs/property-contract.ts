/**
 * THE TYPED EFS PROPERTY CONTRACT (`D40` Decision A)
 * =================================================
 *
 * The five-level cascade accepts any valid JSON value. Two keys additionally carry a CONTRACT,
 * because a consumer computes from them and a malformed declaration must be refused before
 * serving rather than degraded at render time:
 *
 *   - `timezone`        — a single IANA identifier, validated against the runtime's timezone table;
 *   - `openingSchedule` — structured intervals and exceptions (`opening-schedule.ts`).
 *
 * Every other key keeps the generic validation in `properties.ts` (non-empty string, finite
 * number, JSON data) and its established, non-computing role. In particular `openingHours` remains
 * authored, display-only information and is NOT validated as a schedule: it is not one.
 *
 * This module adds no ownership tier, no resolver and no inheritance mechanism.
 */

import { efsOpeningScheduleIssue, efsTimezoneIssue } from "@/core/efs/opening-schedule";

/** The keys carrying a typed contract beyond the generic property validation. */
export const TYPED_PROPERTY_KEYS = ["timezone", "openingSchedule"] as const;

export type TypedPropertyKey = (typeof TYPED_PROPERTY_KEYS)[number];

/**
 * The issue for a typed key's value, or `null` when valid or untyped.
 *
 * Called from manifest validation for every ownership level, so an invalid declaration fails the
 * Installation instead of reaching a renderer.
 */
export function typedPropertyIssue(key: string, value: unknown): string | null {
  switch (key) {
    case "timezone":
      return efsTimezoneIssue(value);
    case "openingSchedule":
      return efsOpeningScheduleIssue(value);
    default:
      return null;
  }
}
