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
 *
 * VALIDATION IS STRICTER THAN THE ENGINE (R02). The released engine answers "is it open at this
 * instant" from the schedule it is given, and is deliberately tolerant because it also serves
 * legacy location configuration. An authored EFS declaration has no such compatibility obligation,
 * so a contradiction the engine would silently resolve one way is REFUSED here instead:
 *
 *   - two intervals whose ACTUAL wall-clock coverage intersects, including across adjacent
 *     weekdays and the Sunday→Monday boundary (an overnight interval does not stop at midnight);
 *   - an exception that both closes a date and opens it;
 *   - an exception that states neither a closure nor a complete interval;
 *   - an explicit `closed: false` with no interval, which would otherwise read as a closure;
 *   - a closure on a date that still carries an overnight interval from the preceding date, which
 *     the engine honours by design and which the author's `closed` therefore contradicts.
 *
 * The overlap test is a deterministic 7×1440-minute WEEKLY TIMELINE. It is a validation aid only:
 * it never computes an open/closed answer, so there remains exactly one status engine.
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

/** Minutes in one day, and in one authored week. */
const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;

/** The members each object form may carry. Anything else is refused, not ignored. */
const SCHEDULE_MEMBERS = new Set(["intervals", "exceptions"]);
const INTERVAL_MEMBERS = new Set(["days", "open", "close"]);
const EXCEPTION_MEMBERS = new Set(["date", "closed", "open", "close"]);

function unknownMemberIssue(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): string | null {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length === 0) return null;
  return `${label} carries ${unknown.map((key) => `"${key}"`).join(", ")}, which is not part of the accepted shape.`;
}

/** Shifts a `YYYY-MM-DD` by a number of calendar days (UTC-safe wall-clock arithmetic). */
function shiftISODate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The minutes one interval covers, as an absolute offset into the authored WEEK.
 *
 * `close` earlier than `open` is overnight and runs past midnight — including Sunday into Monday,
 * which wraps to the start of the same week. Half-open: the close minute is not covered, so
 * `09:00-12:00` and `12:00-17:00` remain adjacent and valid.
 */
function weeklyCoverage(interval: EfsScheduleInterval): number[] {
  const openMinute = parseTime(interval.open);
  const closeMinute = parseTime(interval.close);
  const duration =
    closeMinute > openMinute
      ? closeMinute - openMinute
      : MINUTES_PER_DAY - openMinute + closeMinute;
  const covered: number[] = [];
  for (const day of interval.days) {
    const dayIndex = WEEKDAYS.indexOf(day);
    const start = dayIndex * MINUTES_PER_DAY + openMinute;
    for (let offset = 0; offset < duration; offset += 1) {
      covered.push((start + offset) % MINUTES_PER_WEEK);
    }
  }
  return covered;
}

/**
 * Refuse intervals whose ACTUAL wall-clock coverage intersects.
 *
 * A same-day-only comparison is insufficient: `Mon 22:00-02:00` is still open at 01:00 on Tuesday,
 * so `Tue 01:00-03:00` genuinely overlaps it. The weekly timeline catches that, the
 * `Sun 23:00-02:00` + `Mon 01:00-04:00` boundary case, and every other adjacent-day combination,
 * without consulting any clock, zone, location or date.
 */
function weeklyTimelineIssue(intervals: readonly EfsScheduleInterval[]): string | null {
  const owner = new Int32Array(MINUTES_PER_WEEK).fill(-1);
  for (const [index, interval] of intervals.entries()) {
    for (const minute of weeklyCoverage(interval)) {
      const holder = owner[minute];
      if (holder === -1) {
        owner[minute] = index;
        continue;
      }
      if (holder === index) continue;
      const other = intervals[holder];
      return (
        `intervals[${index}] ("${interval.open}-${interval.close}" on ${interval.days.join(",")}) ` +
        `overlaps intervals[${holder}] ("${other.open}-${other.close}" on ${other.days.join(",")}) ` +
        `in actual wall-clock coverage; an overnight interval continues into the following day.`
      );
    }
  }
  return null;
}

/**
 * The intervals that START on a wall-clock date, given the authored intervals and the authored
 * exceptions. Used by validation (to inspect the preceding date) and by the status path.
 */
function intervalsStartingOnDate(
  intervals: readonly EfsScheduleInterval[],
  exceptionsByDate: ReadonlyMap<string, EfsScheduleException>,
  isoDate: string,
): ParsedInterval[] {
  const exception = exceptionsByDate.get(isoDate);
  if (exception) {
    return exception.open !== undefined && exception.close !== undefined
      ? parseIntervals([{ open: exception.open, close: exception.close }])
      : [];
  }
  const weekday = WEEKDAYS[weekdayOfISODate(isoDate)];
  return parseIntervals(intervals.filter((interval) => interval.days.includes(weekday)));
}

/** `HH:mm` from minutes past midnight, for diagnostic messages only. */
function formatMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Refuse a closure that the released engine cannot honour.
 *
 * The one status engine deliberately checks the PRECEDING day first, so an overnight interval is
 * never revoked by the following day's schedule ("never revoked by today's schedule",
 * `business-hours.ts`). A `closed: true` exception on a date whose preceding day still runs an
 * overnight interval into it is therefore a genuine contradiction: the author states the date is
 * closed while the engine states it is open until the interval ends. Rather than arbitrarily
 * choosing one, the declaration is refused and the author must say what they mean.
 */
function closureVersusCarryOverIssue(
  intervals: readonly EfsScheduleInterval[],
  exceptionsByDate: ReadonlyMap<string, EfsScheduleException>,
): string | null {
  for (const [date, exception] of exceptionsByDate) {
    if (exception.closed !== true) continue;
    const previous = shiftISODate(date, -1);
    const carried = intervalsStartingOnDate(intervals, exceptionsByDate, previous).filter(
      (interval) => interval.overnight,
    );
    if (carried.length === 0) continue;
    const source = exceptionsByDate.has(previous) ? "an exception on" : "the weekly schedule on";
    return (
      `exceptions["${date}"] declares a closure, but ${source} ${previous} carries the overnight ` +
      `interval "${formatMinutes(carried[0].open)}-${formatMinutes(carried[0].close)}" into ${date}, ` +
      `so that date is already open after midnight. Shorten the preceding interval or drop the closure.`
    );
  }
  return null;
}

/**
 * Refuse a malformed or contradictory declaration. Returns the FIRST issue, or `null` when the
 * declaration is valid. Callers refuse to serve rather than degrade: this runs during manifest
 * validation, before any representation is published.
 *
 * The accepted exception forms are EXACTLY two:
 *
 *   1. `{ "date": "YYYY-MM-DD", "closed": true }` — a declared closure;
 *   2. `{ "date": "YYYY-MM-DD", "open": "HH:mm", "close": "HH:mm" }` — one complete interval that
 *      REPLACES the day's regular schedule.
 *
 * Everything else is refused rather than interpreted: a partial interval, a closure carrying times,
 * a bare `{ "date": … }`, and an explicit `closed: false` with no interval (which would otherwise be
 * read as an intentional closure — a silent reinterpretation of the author's statement).
 */
export function efsOpeningScheduleIssue(value: unknown): string | null {
  if (!isRecord(value)) return "An opening schedule must be an object.";
  const unknown = unknownMemberIssue(value, SCHEDULE_MEMBERS, "An opening schedule");
  if (unknown) return unknown;

  const intervals = value.intervals;
  if (!Array.isArray(intervals)) return "An opening schedule must declare an `intervals` array.";

  const parsed: EfsScheduleInterval[] = [];
  for (const [index, raw] of intervals.entries()) {
    const at = `intervals[${index}]`;
    if (!isRecord(raw)) return `${at} must be an object.`;
    const extra = unknownMemberIssue(raw, INTERVAL_MEMBERS, at);
    if (extra) return extra;

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

    parsed.push({
      days: days as EfsScheduleWeekday[],
      open: raw.open as string,
      close: raw.close as string,
    });
  }

  const exceptionsByDate = new Map<string, EfsScheduleException>();
  const exceptions = value.exceptions;
  if (exceptions !== undefined) {
    if (!Array.isArray(exceptions)) return "`exceptions` must be an array when present.";
    for (const [index, raw] of exceptions.entries()) {
      const at = `exceptions[${index}]`;
      if (!isRecord(raw)) return `${at} must be an object.`;
      const extra = unknownMemberIssue(raw, EXCEPTION_MEMBERS, at);
      if (extra) return extra;

      if (typeof raw.date !== "string" || !isCalendarDate(raw.date)) {
        return `${at}.date must be a real "YYYY-MM-DD" date, received "${String(raw.date)}".`;
      }
      if (exceptionsByDate.has(raw.date)) {
        return `${at}.date repeats "${raw.date}"; exception dates must be unique.`;
      }
      if (raw.closed !== undefined && typeof raw.closed !== "boolean") {
        return `${at}.closed must be a boolean when present.`;
      }

      const hasOpen = raw.open !== undefined;
      const hasClose = raw.close !== undefined;
      if (hasOpen !== hasClose) {
        return `${at} declares only one of \`open\`/\`close\`; an interval must be complete.`;
      }

      if (hasOpen && hasClose) {
        const openIssue = timeIssue(raw.open, `${at}.open`);
        if (openIssue) return openIssue;
        const closeIssue = timeIssue(raw.close, `${at}.close`);
        if (closeIssue) return closeIssue;
        if (raw.open === raw.close) {
          return `${at} has identical open and close times, which is ambiguous.`;
        }
        if (raw.closed === true) {
          return `${at} both closes the date and declares an interval; those are contradictory.`;
        }
        if (raw.closed === false) {
          return `${at} declares \`closed: false\` alongside an interval; \`closed\` is redundant there and is refused rather than ignored.`;
        }
      } else if (raw.closed === true) {
        // Form 1 — a declared closure. Checked against carry-over below.
      } else if (raw.closed === false) {
        return `${at} declares \`closed: false\` with no interval; that would be read as a closure, so it is refused as ambiguous.`;
      } else {
        return `${at} states neither a closure nor a complete interval; declare \`closed: true\` or an \`open\`/\`close\` pair.`;
      }

      exceptionsByDate.set(raw.date, {
        date: raw.date,
        ...(raw.closed === undefined ? {} : { closed: raw.closed as boolean }),
        ...(hasOpen ? { open: raw.open as string, close: raw.close as string } : {}),
      });
    }
  }

  return (
    weeklyTimelineIssue(parsed) ?? closureVersusCarryOverIssue(parsed, exceptionsByDate) ?? null
  );
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

/** The authored exceptions, indexed by date. */
function exceptionsByDate(
  schedule: EfsOpeningSchedule,
): ReadonlyMap<string, EfsScheduleException> {
  return new Map((schedule.exceptions ?? []).map((entry) => [entry.date, entry]));
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
  return intervalsStartingOnDate(
    schedule.intervals,
    exceptionsByDate(schedule),
    isoDate,
  );
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
