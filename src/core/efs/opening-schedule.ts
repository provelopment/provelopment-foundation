/**
 * THE EFS OPENING SCHEDULE (`D40` Decision A)
 * ===========================================
 *
 * A typed, OPTIONAL, non-geographic schedule property. Its computation is driven by exactly two
 * authored facts and nothing else:
 *
 *   - `openingSchedule` — the structured intervals and exception periods authored here;
 *   - `timezone`        — a SEPARATELY, EXPLICITLY authored IANA identifier.
 *
 * The timezone is an authored INPUT, never a derived OUTPUT. Nothing here reads a location, an
 * address, a place fact, a Site name, a prefix, a language, a locale subtag, a country, a region,
 * a hostname, a visitor address or the server environment. This module deliberately does NOT
 * import `resolveTimezone` from the legacy location module: that fallback is location-derived and
 * is exactly what `D40` §1 forbids on this path.
 *
 * There is no default zone. A missing, private or suppressed input yields NO open/closed
 * assertion — never UTC, never the server's zone, never the visitor's.
 *
 * Time/DST arithmetic is NOT reimplemented here. It is delegated to the Foundation's one DST-safe
 * wall-clock engine (`business-hours.ts`), which resolves wall-clock parts through `Intl` for the
 * authored zone. Pure data and pure functions: no I/O, no React, no filesystem.
 */

import {
  isIanaTimeZone,
  openStatusFromIntervalsStartingOnDay,
  parseIntervals,
  parseTime,
  weekdayOfISODate,
  type OpenStatus,
  type ParsedInterval,
} from "@/core/business-hours";

/** A weekday key, reusing the released `Weekday` vocabulary. */
export type EfsScheduleWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const WEEKDAYS: readonly EfsScheduleWeekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * One authored interval. `close` earlier than `open` is an OVERNIGHT interval carried into the
 * next day, matching the released engine's semantics. `close === open` is refused as ambiguous
 * rather than being silently read as either zero-length or a full day.
 */
export interface EfsScheduleInterval {
  /** The weekdays this interval STARTS on. */
  readonly days: readonly EfsScheduleWeekday[];
  /** Local wall-clock `HH:mm` in the authored timezone. */
  readonly open: string;
  /** Local wall-clock `HH:mm` in the authored timezone. */
  readonly close: string;
}

/**
 * One exact-date exception. A listed date REPLACES that date's weekly intervals (it is an
 * override, never a partial merge). `closed: true` — or a listed date carrying neither `closed`
 * nor a complete interval — means closed that day.
 */
export interface EfsScheduleException {
  /** Wall-clock `YYYY-MM-DD` in the authored timezone. */
  readonly date: string;
  readonly closed?: boolean;
  readonly open?: string;
  readonly close?: string;
}

/** The complete authored schedule property value. */
export interface EfsOpeningSchedule {
  /** Authored weekly intervals. Empty is valid and means "closed every day". */
  readonly intervals: readonly EfsScheduleInterval[];
  /** Exact-date exceptions, replacing the weekly intervals for those dates. */
  readonly exceptions?: readonly EfsScheduleException[];
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A real calendar date, so `2026-02-30` and `2026-13-01` are refused. */
function isCalendarDate(iso: string): boolean {
  const match = ISO_DATE_PATTERN.exec(iso);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** `HH:mm` validity, strict then delegated to the one released time parser. */
function timeIssue(value: unknown, label: string): string | null {
  if (typeof value !== "string") return `${label} must be an "HH:mm" string.`;
  // `parseTime` is deliberately tolerant (it splits on ":") and would accept "9:00". A property
  // declaration is authored data, so the published shape is enforced exactly.
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return `${label} must be a valid "HH:mm" time, received "${value}".`;
  }
  try {
    parseTime(value);
    return null;
  } catch {
    return `${label} must be a valid "HH:mm" time, received "${value}".`;
  }
}

/**
 * A half-open span in minutes, normalised so an overnight interval becomes one continuous range
 * that may exceed 1440. Used only to detect overlap; never for the status answer itself.
 */
function spanOf(open: string, close: string): { start: number; end: number } {
  const start = parseTime(open);
  const end = parseTime(close);
  return { start, end: end > start ? end : end + 1440 };
}

/**
 * Detect two intervals that both START on the same weekday and overlap.
 *
 * Adjacent intervals (`09:00-12:00` then `12:00-17:00`) are NOT overlapping: the ranges are
 * half-open. An overnight interval overlaps a same-day interval only when their ranges intersect
 * once the overnight span is extended past midnight.
 */
function overlapIssue(a: EfsScheduleInterval, b: EfsScheduleInterval): string | null {
  const first = spanOf(a.open, a.close);
  const second = spanOf(b.open, b.close);
  const overlaps = first.start < second.end && second.start < first.end;
  if (!overlaps) return null;
  return `Intervals "${a.open}-${a.close}" and "${b.open}-${b.close}" overlap on the same day.`;
}

/**
 * Refuse a malformed or contradictory declaration. Returns the FIRST issue, or `null` when the
 * declaration is valid. Callers refuse to serve rather than degrade: this runs during manifest
 * validation, before any representation is published.
 */
export function efsOpeningScheduleIssue(value: unknown): string | null {
  if (!isRecord(value)) return "An opening schedule must be an object.";

  const intervals = value.intervals;
  if (!Array.isArray(intervals)) return "An opening schedule must declare an `intervals` array.";

  const parsed: EfsScheduleInterval[] = [];
  for (const [index, raw] of intervals.entries()) {
    const at = `intervals[${index}]`;
    if (!isRecord(raw)) return `${at} must be an object.`;

    const days = raw.days;
    if (!Array.isArray(days) || days.length === 0) {
      return `${at}.days must be a non-empty array of weekdays.`;
    }
    const seen = new Set<string>();
    for (const day of days) {
      if (!WEEKDAYS.includes(day as EfsScheduleWeekday)) {
        return `${at}.days contains "${String(day)}", which is not one of ${WEEKDAYS.join(", ")}.`;
      }
      if (seen.has(day as string)) return `${at}.days repeats "${String(day)}".`;
      seen.add(day as string);
    }

    const openIssue = timeIssue(raw.open, `${at}.open`);
    if (openIssue) return openIssue;
    const closeIssue = timeIssue(raw.close, `${at}.close`);
    if (closeIssue) return closeIssue;
    if (raw.open === raw.close) {
      return `${at} has identical open and close times ("${String(raw.open)}"), which is ambiguous.`;
    }

    const interval: EfsScheduleInterval = {
      days: days as EfsScheduleWeekday[],
      open: raw.open as string,
      close: raw.close as string,
    };
    for (const previous of parsed) {
      const sharesDay = previous.days.some((day) => interval.days.includes(day));
      if (!sharesDay) continue;
      const issue = overlapIssue(previous, interval);
      if (issue) return issue;
    }
    parsed.push(interval);
  }

  const exceptions = value.exceptions;
  if (exceptions !== undefined) {
    if (!Array.isArray(exceptions)) return "`exceptions` must be an array when present.";
    const dates = new Set<string>();
    for (const [index, raw] of exceptions.entries()) {
      const at = `exceptions[${index}]`;
      if (!isRecord(raw)) return `${at} must be an object.`;
      if (typeof raw.date !== "string" || !isCalendarDate(raw.date)) {
        return `${at}.date must be a real "YYYY-MM-DD" date, received "${String(raw.date)}".`;
      }
      if (dates.has(raw.date)) {
        return `${at}.date repeats "${raw.date}"; exception dates must be unique.`;
      }
      dates.add(raw.date);
      if (raw.closed !== undefined && typeof raw.closed !== "boolean") {
        return `${at}.closed must be a boolean when present.`;
      }
      if (raw.open !== undefined || raw.close !== undefined) {
        const openIssue = timeIssue(raw.open, `${at}.open`);
        if (openIssue) return openIssue;
        const closeIssue = timeIssue(raw.close, `${at}.close`);
        if (closeIssue) return closeIssue;
        if (raw.open === raw.close) {
          return `${at} has identical open and close times, which is ambiguous.`;
        }
      }
    }
  }

  return null;
}


/**
 * The authored IANA identifier, or an issue. Never defaulted.
 *
 * `isIanaTimeZone` alone is not sufficient: ECMA-402 also accepts OFFSET time zones such as
 * `+01:00`, which `Intl` resolves without complaint but which are not IANA identifiers and carry
 * no DST rules. The shape is therefore checked first — an IANA identifier is at least
 * `Area/Location`, with `UTC` and `GMT` the only permitted single-segment names.
 */
export function efsTimezoneIssue(value: unknown): string | null {
  if (typeof value !== "string") return "A timezone must be an IANA identifier string.";
  if (!/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/.test(value)) {
    return `"${value}" is not a recognised IANA timezone identifier.`;
  }
  if (!value.includes("/") && value !== "UTC" && value !== "GMT") {
    return `"${value}" is not a recognised IANA timezone identifier.`;
  }
  return isIanaTimeZone(value) ? null : `"${value}" is not a recognised IANA timezone identifier.`;
}

function exceptionOn(
  schedule: EfsOpeningSchedule,
  isoDate: string,
): EfsScheduleException | undefined {
  return schedule.exceptions?.find((entry) => entry.date === isoDate);
}

/**
 * Intervals that START on a wall-clock date, honoring an exact-date exception.
 *
 * An exception replaces the weekly intervals for its date. A `closed` exception — or one carrying
 * neither `closed` nor a complete interval — yields none. Overnight intervals are preserved
 * exactly as the shared engine expects.
 */
export function efsIntervalsStartingOnDay(
  schedule: EfsOpeningSchedule,
  isoDate: string,
): readonly ParsedInterval[] {
  const exception = exceptionOn(schedule, isoDate);
  if (exception) {
    if (exception.closed === true) return [];
    if (exception.open !== undefined && exception.close !== undefined) {
      return parseIntervals([{ open: exception.open, close: exception.close }]);
    }
    return [];
  }
  const weekday = WEEKDAYS[weekdayOfISODate(isoDate)];
  return parseIntervals(schedule.intervals.filter((interval) => interval.days.includes(weekday)));
}

/**
 * Open/closed status at `date`, computed in the AUTHORED timezone.
 *
 * Reuses the Foundation's single DST-safe engine. The caller must have already established that a
 * schedule and a timezone are both effectively authored and publicly projected — this function
 * never invents either. An empty schedule is simply "closed", never "unknown".
 */
export function efsOpenStatusAt(
  schedule: EfsOpeningSchedule,
  timeZone: string,
  date: Date,
): OpenStatus {
  const status = openStatusFromIntervalsStartingOnDay(
    {
      timeZone,
      intervalsStartingOnDay: (isoDate) => efsIntervalsStartingOnDay(schedule, isoDate),
    },
    date,
  );
  return status === "noSchedule" ? { open: false } : status;
}

/** The two authored facts a public open/closed assertion requires. */
export interface EfsScheduleInputs {
  readonly schedule: EfsOpeningSchedule;
  readonly timeZone: string;
}

/** The minimum property view this module needs (satisfied by `EffectiveProperties`). */
export interface PropertyLookup {
  get(key: string):
    | { readonly value: unknown; readonly public: boolean; readonly state: string }
    | undefined;
}

/**
 * The public open/closed inputs for a resolved property set, or `null`.
 *
 * `null` is returned — producing NO assertion — in every one of these cases:
 *
 *   - a key is absent at every ownership level (nothing authored);
 *   - a key is explicitly `null` (suppressed);
 *   - a key is declared but NOT publicly projected (private);
 *   - a declared value is not valid (refused at validation; never guessed here).
 *
 * This is `D40` Decision A applied literally: absence never manufactures a schedule, a timezone or
 * a status, and privacy or suppression is never filled in from a default.
 */
export function publicScheduleInputs(properties: PropertyLookup): EfsScheduleInputs | null {
  const scheduleEntry = properties.get("openingSchedule");
  if (!scheduleEntry || scheduleEntry.state === "suppressed" || !scheduleEntry.public) return null;

  const timezoneEntry = properties.get("timezone");
  if (!timezoneEntry || timezoneEntry.state === "suppressed" || !timezoneEntry.public) return null;

  if (efsOpeningScheduleIssue(scheduleEntry.value)) return null;
  if (efsTimezoneIssue(timezoneEntry.value)) return null;

  return {
    schedule: scheduleEntry.value as EfsOpeningSchedule,
    timeZone: timezoneEntry.value as string,
  };
}

