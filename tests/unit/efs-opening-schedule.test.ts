import { describe, expect, it } from "vitest";

import {
  efsOpeningScheduleIssue,
  efsOpenStatusAt,
  efsTimezoneIssue,
  publicScheduleInputs,
  type EfsOpeningSchedule,
} from "@/core/efs/opening-schedule";

/** A UTC instant for a Berlin wall-clock time in summer (CEST = UTC+2). */
function berlinSummer(hour: number, minute = 0, day = 15): Date {
  return new Date(Date.UTC(2026, 6, day, hour - 2, minute));
}

const weekly: EfsOpeningSchedule = {
  intervals: [{ days: ["mon", "tue", "wed", "thu", "fri"], open: "09:00", close: "17:00" }],
};

describe("EFS opening schedule — validation refuses malformed and contradictory declarations", () => {
  it("accepts a valid weekly schedule, multiple intervals, overnight and exceptions", () => {
    expect(efsOpeningScheduleIssue(weekly)).toBeNull();
    expect(
      efsOpeningScheduleIssue({
        intervals: [
          { days: ["mon"], open: "09:00", close: "12:00" },
          { days: ["mon"], open: "13:00", close: "17:00" },
          { days: ["fri"], open: "22:00", close: "02:00" },
        ],
      }),
    ).toBeNull();
    expect(
      efsOpeningScheduleIssue({
        intervals: [],
        exceptions: [
          { date: "2026-12-25", closed: true },
          { date: "2026-12-24", open: "10:00", close: "14:00" },
        ],
      }),
    ).toBeNull();
  });

  it("accepts adjacent intervals but refuses overlapping ones", () => {
    // Half-open ranges: 09:00-12:00 then 12:00-17:00 do not overlap.
    expect(
      efsOpeningScheduleIssue({
        intervals: [
          { days: ["mon"], open: "09:00", close: "12:00" },
          { days: ["mon"], open: "12:00", close: "17:00" },
        ],
      }),
    ).toBeNull();
    expect(
      efsOpeningScheduleIssue({
        intervals: [
          { days: ["mon"], open: "09:00", close: "13:00" },
          { days: ["mon"], open: "12:00", close: "17:00" },
        ],
      }),
    ).toMatch(/overlap/);
    // Overlap is only checked between intervals that share a day.
    expect(
      efsOpeningScheduleIssue({
        intervals: [
          { days: ["mon"], open: "09:00", close: "13:00" },
          { days: ["tue"], open: "12:00", close: "17:00" },
        ],
      }),
    ).toBeNull();
  });

  it("refuses malformed structure, weekdays and times", () => {
    expect(efsOpeningScheduleIssue("Mon-Fri 9-5")).toMatch(/must be an object/);
    expect(efsOpeningScheduleIssue({})).toMatch(/`intervals` array/);
    expect(
      efsOpeningScheduleIssue({ intervals: [{ days: [], open: "09:00", close: "17:00" }] }),
    ).toMatch(/non-empty array of weekdays/);
    expect(
      efsOpeningScheduleIssue({ intervals: [{ days: ["monday"], open: "09:00", close: "17:00" }] }),
    ).toMatch(/not one of/);
    expect(
      efsOpeningScheduleIssue({
        intervals: [{ days: ["mon", "mon"], open: "09:00", close: "17:00" }],
      }),
    ).toMatch(/repeats/);
    expect(
      efsOpeningScheduleIssue({ intervals: [{ days: ["mon"], open: "9:00", close: "17:00" }] }),
    ).toMatch(/HH:mm/);
    expect(
      efsOpeningScheduleIssue({ intervals: [{ days: ["mon"], open: "09:00", close: "25:00" }] }),
    ).toMatch(/HH:mm/);
    expect(
      efsOpeningScheduleIssue({ intervals: [{ days: ["mon"], open: "09:00", close: "09:00" }] }),
    ).toMatch(/ambiguous/);
  });

  it("refuses impossible dates and duplicate exception dates", () => {
    const intervals = [{ days: ["mon"] as const, open: "09:00", close: "17:00" }];
    expect(
      efsOpeningScheduleIssue({ intervals, exceptions: [{ date: "2026-02-30", closed: true }] }),
    ).toMatch(/real "YYYY-MM-DD"/);
    expect(
      efsOpeningScheduleIssue({ intervals, exceptions: [{ date: "2026-13-01", closed: true }] }),
    ).toMatch(/real "YYYY-MM-DD"/);
    expect(efsOpeningScheduleIssue({ intervals, exceptions: [{ date: "25/12/2026" }] })).toMatch(
      /real "YYYY-MM-DD"/,
    );
    expect(
      efsOpeningScheduleIssue({
        intervals,
        exceptions: [
          { date: "2026-12-25", closed: true },
          { date: "2026-12-25", open: "10:00", close: "12:00" },
        ],
      }),
    ).toMatch(/unique|repeats/);
  });
});

describe("EFS timezone — an authored IANA identifier, never defaulted", () => {
  it("accepts real IANA identifiers and refuses anything else", () => {
    expect(efsTimezoneIssue("Europe/Berlin")).toBeNull();
    expect(efsTimezoneIssue("America/New_York")).toBeNull();
    expect(efsTimezoneIssue("UTC")).toBeNull();
    expect(efsTimezoneIssue("Europe/Berlinn")).toMatch(/not a recognised IANA/);
    expect(efsTimezoneIssue("Mars/Olympus")).toMatch(/not a recognised IANA/);
    expect(efsTimezoneIssue("+01:00")).toMatch(/not a recognised IANA/);
    expect(efsTimezoneIssue(2)).toMatch(/IANA identifier string/);
    expect(efsTimezoneIssue(undefined)).toMatch(/IANA identifier string/);
  });
});

describe("EFS opening schedule — computed status in the authored timezone", () => {
  it("is open inside a weekly interval and closed outside it", () => {
    // Wednesday 2026-07-15, 12:00 Berlin.
    expect(efsOpenStatusAt(weekly, "Europe/Berlin", berlinSummer(12, 0, 15))).toEqual({
      open: true,
      minutesRemaining: 300,
    });
    // Same Wednesday, 08:59 Berlin.
    expect(efsOpenStatusAt(weekly, "Europe/Berlin", berlinSummer(8, 59, 15))).toEqual({
      open: false,
    });
    // Saturday is not a working day.
    expect(efsOpenStatusAt(weekly, "Europe/Berlin", berlinSummer(12, 0, 18))).toEqual({
      open: false,
    });
  });

  it("reads wall-clock time in the authored zone, not UTC", () => {
    // 10:00Z is 12:00 in Berlin (CEST) and 10:00 in UTC. The authored zone decides the answer.
    const instant = new Date(Date.UTC(2026, 6, 15, 10, 0));
    expect(efsOpenStatusAt(weekly, "Europe/Berlin", instant)).toEqual({
      open: true,
      minutesRemaining: 300,
    });
    expect(efsOpenStatusAt(weekly, "UTC", instant)).toEqual({ open: true, minutesRemaining: 420 });
  });

  it("handles multiple intervals with a midday gap", () => {
    const schedule: EfsOpeningSchedule = {
      intervals: [
        { days: ["wed"], open: "09:00", close: "12:00" },
        { days: ["wed"], open: "13:00", close: "17:00" },
      ],
    };
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(11, 59, 15))).toEqual({
      open: true,
      minutesRemaining: 1,
    });
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(12, 30, 15))).toEqual({
      open: false,
    });
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(13, 0, 15))).toEqual({
      open: true,
      minutesRemaining: 240,
    });
  });

  it("supports overnight intervals carried into the next day", () => {
    const schedule: EfsOpeningSchedule = {
      intervals: [{ days: ["mon"], open: "22:00", close: "02:00" }],
    };
    // Monday 23:00 Berlin — open, running to 02:00 (180 minutes).
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(23, 0, 13))).toEqual({
      open: true,
      minutesRemaining: 180,
    });
    // Tuesday 01:00 Berlin — still open, carried over from Monday.
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(1, 0, 14))).toEqual({
      open: true,
      minutesRemaining: 60,
    });
    // Tuesday 02:00 Berlin — closed.
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(2, 0, 14))).toEqual({
      open: false,
    });
  });


  it("lets an exception close or replace a day", () => {
    const schedule: EfsOpeningSchedule = {
      ...weekly,
      exceptions: [
        { date: "2026-07-15", closed: true },
        { date: "2026-07-16", open: "10:00", close: "12:00" },
      ],
    };
    // Wednesday is normally open, but the exception closes it outright.
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(12, 0, 15))).toEqual({
      open: false,
    });
    // Thursday's exception REPLACES the weekly 09:00-17:00: 11:00 open, 13:00 closed.
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(11, 0, 16))).toEqual({
      open: true,
      minutesRemaining: 60,
    });
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(13, 0, 16))).toEqual({
      open: false,
    });
  });

  it("stays correct across a DST transition (Berlin, 2026-03-29)", () => {
    // 02:00 CET becomes 03:00 CEST on this date; the wall clock skips an hour.
    const schedule: EfsOpeningSchedule = {
      intervals: [{ days: ["sun"], open: "01:00", close: "04:00" }],
    };
    // 00:30Z = 01:30 CET (before the jump) — open.
    expect(
      efsOpenStatusAt(schedule, "Europe/Berlin", new Date(Date.UTC(2026, 2, 29, 0, 30))).open,
    ).toBe(true);
    // 01:30Z = 03:30 CEST (after the jump) — still open, with the remainder measured in the
    // post-transition wall clock (04:00 - 03:30 = 30 minutes), not in elapsed UTC.
    expect(
      efsOpenStatusAt(schedule, "Europe/Berlin", new Date(Date.UTC(2026, 2, 29, 1, 30))),
    ).toEqual({ open: true, minutesRemaining: 30 });
    // 02:30Z = 04:30 CEST — closed.
    expect(
      efsOpenStatusAt(schedule, "Europe/Berlin", new Date(Date.UTC(2026, 2, 29, 2, 30))).open,
    ).toBe(false);
  });

  it("treats an empty schedule as closed rather than unknown", () => {
    expect(efsOpenStatusAt({ intervals: [] }, "Europe/Berlin", berlinSummer(12))).toEqual({
      open: false,
    });
  });
});

describe("EFS opening schedule — no input, no assertion", () => {
  const entry = (value: unknown, isPublic = true, state = "declared") => ({
    value,
    public: isPublic,
    state,
  });

  function lookup(bag: Record<string, unknown>) {
    return { get: (key: string) => bag[key] as ReturnType<typeof entry> | undefined };
  }

  it("returns nothing when either input is absent", () => {
    expect(publicScheduleInputs(lookup({}))).toBeNull();
    expect(publicScheduleInputs(lookup({ openingSchedule: entry(weekly) }))).toBeNull();
    expect(publicScheduleInputs(lookup({ timezone: entry("Europe/Berlin") }))).toBeNull();
  });

  it("returns the pair when both are declared and public", () => {
    expect(
      publicScheduleInputs(
        lookup({ openingSchedule: entry(weekly), timezone: entry("Europe/Berlin") }),
      ),
    ).toEqual({ schedule: weekly, timeZone: "Europe/Berlin" });
  });

  it("asserts nothing when either input is private or suppressed", () => {
    expect(
      publicScheduleInputs(
        lookup({ openingSchedule: entry(weekly, false), timezone: entry("Europe/Berlin") }),
      ),
    ).toBeNull();
    expect(
      publicScheduleInputs(
        lookup({ openingSchedule: entry(weekly), timezone: entry("Europe/Berlin", false) }),
      ),
    ).toBeNull();
    expect(
      publicScheduleInputs(
        lookup({
          openingSchedule: entry(undefined, false, "suppressed"),
          timezone: entry("Europe/Berlin"),
        }),
      ),
    ).toBeNull();
    expect(
      publicScheduleInputs(
        lookup({ openingSchedule: entry(weekly), timezone: entry(undefined, false, "suppressed") }),
      ),
    ).toBeNull();
  });

  it("asserts nothing rather than guessing when a value is invalid", () => {
    expect(
      publicScheduleInputs(
        lookup({ openingSchedule: entry(weekly), timezone: entry("Mars/Olympus") }),
      ),
    ).toBeNull();
    expect(
      publicScheduleInputs(
        lookup({
          openingSchedule: entry({ intervals: [{ days: ["mon"], open: "9:00", close: "17:00" }] }),
          timezone: entry("Europe/Berlin"),
        }),
      ),
    ).toBeNull();
  });
});


describe("R02-A — overlap is judged on actual wall-clock coverage, not the authored day", () => {
  it("rejects an overnight interval overlapped by the following day (Mon 22:00-02:00 + Tue 01:00-03:00)", () => {
    const issue = efsOpeningScheduleIssue({
      intervals: [
        { days: ["mon"], open: "22:00", close: "02:00" },
        { days: ["tue"], open: "01:00", close: "03:00" },
      ],
    });
    expect(issue).toMatch(/overlaps/);
    expect(issue).toMatch(/wall-clock coverage/);
  });

  it("rejects the Sunday→Monday boundary (Sun 23:00-02:00 + Mon 01:00-04:00)", () => {
    expect(
      efsOpeningScheduleIssue({
        intervals: [
          { days: ["sun"], open: "23:00", close: "02:00" },
          { days: ["mon"], open: "01:00", close: "04:00" },
        ],
      }),
    ).toMatch(/overlaps/);
  });

  it("rejects the wrap-around overlap declared in the other order", () => {
    expect(
      efsOpeningScheduleIssue({
        intervals: [
          { days: ["mon"], open: "01:00", close: "04:00" },
          { days: ["sun"], open: "23:00", close: "02:00" },
        ],
      }),
    ).toMatch(/overlaps/);
  });

  it("keeps legitimate adjacent intervals valid, same day and across days", () => {
    expect(
      efsOpeningScheduleIssue({
        intervals: [
          { days: ["mon"], open: "09:00", close: "12:00" },
          { days: ["mon"], open: "12:00", close: "17:00" },
        ],
      }),
    ).toBeNull();
    // An overnight interval and the next day's interval that begins exactly when it ends.
    expect(
      efsOpeningScheduleIssue({
        intervals: [
          { days: ["mon"], open: "22:00", close: "02:00" },
          { days: ["tue"], open: "02:00", close: "06:00" },
        ],
      }),
    ).toBeNull();
  });

  it("keeps legitimate non-overlapping overnight intervals valid", () => {
    expect(
      efsOpeningScheduleIssue({
        intervals: [{ days: ["mon", "tue", "wed"], open: "22:00", close: "02:00" }],
      }),
    ).toBeNull();
    // The same overnight window two days running does not collide with itself.
    expect(
      efsOpeningScheduleIssue({
        intervals: [
          { days: ["mon"], open: "22:00", close: "02:00" },
          { days: ["tue"], open: "22:00", close: "02:00" },
        ],
      }),
    ).toBeNull();
    // Early morning on the same day as the evening interval that follows it.
    expect(
      efsOpeningScheduleIssue({
        intervals: [
          { days: ["mon"], open: "03:00", close: "06:00" },
          { days: ["mon"], open: "22:00", close: "02:00" },
        ],
      }),
    ).toBeNull();
  });
});


describe("R02-A(2) — an exception and the overnight interval carried into it", () => {
  it("preserves the released carry-over: an exception replaces its own day only", () => {
    // Monday runs overnight into Tuesday; Tuesday declares its own shorter interval. The carry-over
    // is NOT revoked (released engine behaviour), so 01:00 Tuesday is still open.
    const schedule: EfsOpeningSchedule = {
      intervals: [{ days: ["mon"], open: "22:00", close: "06:00" }],
      exceptions: [{ date: "2026-07-14", open: "10:00", close: "12:00" }],
    };
    expect(efsOpeningScheduleIssue(schedule)).toBeNull();
    // 2026-07-14 is a Tuesday.
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(1, 0, 14))).toEqual({
      open: true,
      minutesRemaining: 300,
    });
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(11, 0, 14))).toEqual({
      open: true,
      minutesRemaining: 60,
    });
    // The exception REPLACED Tuesday's weekly hours, so 13:00 is closed.
    expect(efsOpenStatusAt(schedule, "Europe/Berlin", berlinSummer(13, 0, 14))).toEqual({
      open: false,
    });
  });

  it("rejects a closure on a date the preceding overnight interval keeps open", () => {
    const issue = efsOpeningScheduleIssue({
      intervals: [{ days: ["mon"], open: "22:00", close: "02:00" }],
      exceptions: [{ date: "2026-07-14", closed: true }],
    });
    expect(issue).toMatch(/already open after midnight/);
    expect(issue).toMatch(/2026-07-13/);
  });

  it("rejects a closure carried over from an exceptional overnight interval", () => {
    expect(
      efsOpeningScheduleIssue({
        intervals: [],
        exceptions: [
          { date: "2026-07-13", open: "22:00", close: "02:00" },
          { date: "2026-07-14", closed: true },
        ],
      }),
    ).toMatch(/already open after midnight/);
  });

  it("allows a closure when the preceding day carries nothing past midnight", () => {
    expect(
      efsOpeningScheduleIssue({
        intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
        exceptions: [{ date: "2026-07-14", closed: true }],
      }),
    ).toBeNull();
  });
});

describe("R02-B — exception forms are exact, and contradictions are refused", () => {
  it("rejects a closure that also declares opening times", () => {
    expect(
      efsOpeningScheduleIssue({
        intervals: [],
        exceptions: [{ date: "2026-12-24", closed: true, open: "10:00", close: "14:00" }],
      }),
    ).toMatch(/contradictory/);
  });

  it("rejects a partial interval", () => {
    expect(
      efsOpeningScheduleIssue({ intervals: [], exceptions: [{ date: "2026-12-24", open: "10:00" }] }),
    ).toMatch(/only one of/);
    expect(
      efsOpeningScheduleIssue({
        intervals: [],
        exceptions: [{ date: "2026-12-24", close: "14:00" }],
      }),
    ).toMatch(/only one of/);
  });

  it("rejects closed:false, alone or alongside an interval", () => {
    expect(
      efsOpeningScheduleIssue({
        intervals: [],
        exceptions: [{ date: "2026-12-24", closed: false }],
      }),
    ).toMatch(/read as a closure/);
    expect(
      efsOpeningScheduleIssue({
        intervals: [],
        exceptions: [{ date: "2026-12-24", closed: false, open: "10:00", close: "14:00" }],
      }),
    ).toMatch(/redundant/);
  });

  it("rejects a bare date that states neither form", () => {
    expect(
      efsOpeningScheduleIssue({ intervals: [], exceptions: [{ date: "2026-12-24" }] }),
    ).toMatch(/neither a closure nor a complete interval/);
  });

  it("refuses unexpected members instead of silently ignoring them", () => {
    expect(efsOpeningScheduleIssue({ intervals: [], notes: "x" })).toMatch(
      /not part of the accepted shape/,
    );
    expect(
      efsOpeningScheduleIssue({
        intervals: [{ days: ["mon"], open: "09:00", close: "17:00", zone: "X" }],
      }),
    ).toMatch(/not part of the accepted shape/);
    expect(
      efsOpeningScheduleIssue({
        intervals: [],
        exceptions: [{ date: "2026-12-24", closed: true, note: "x" }],
      }),
    ).toMatch(/not part of the accepted shape/);
  });

  it("accepts exactly the two declared forms", () => {
    expect(
      efsOpeningScheduleIssue({
        intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
        exceptions: [
          { date: "2026-12-25", closed: true },
          { date: "2026-12-24", open: "10:00", close: "14:00" },
        ],
      }),
    ).toBeNull();
  });
});
