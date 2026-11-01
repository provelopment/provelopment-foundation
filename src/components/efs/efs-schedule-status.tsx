"use client";

import { useSyncExternalStore } from "react";

import { efsOpenStatusAt, type EfsOpeningSchedule } from "@/core/efs/opening-schedule";

export interface EfsScheduleStatusLabels {
  /** The section heading, from `dictionary.business.hoursLabel` — never "Open now". */
  readonly hoursLabel: string;
  /** "Open" — from `dictionary.business.open`. */
  readonly open: string;
  /** "Closed" — from `dictionary.business.closed`. */
  readonly closed: string;
}

interface EfsScheduleStatusProps {
  /** The effective, PUBLICLY AUTHORIZED authored schedule. */
  readonly schedule: EfsOpeningSchedule;
  /** The effective, PUBLICLY AUTHORIZED authored IANA timezone. Never inferred. */
  readonly timeZone: string;
  readonly labels: EfsScheduleStatusLabels;
}

/** Refresh cadence for the "now" value (minute-grained, matching the released status component). */
const TICK_MS = 60_000;

/** Cached current time; invalidated by the subscription so the snapshot is stable between ticks. */
let cachedNow: Date | null = null;

function getSnapshot(): Date {
  if (cachedNow === null) cachedNow = new Date();
  return cachedNow;
}

function subscribe(callback: () => void): () => void {
  const id = window.setInterval(() => {
    cachedNow = new Date();
    callback();
  }, TICK_MS);
  return () => window.clearInterval(id);
}

/** During SSR/hydration render nothing; the live status appears post-hydration. */
function getServerSnapshot(): null {
  return null;
}

/**
 * Live open/closed indicator for an authored EFS opening schedule.
 *
 * `useSyncExternalStore` treats the visitor's clock as the external system: the server — and the
 * first hydrated paint — renders nothing, so a statically generated Page never bakes a build-time
 * open/closed result into its HTML. The answer is computed client-side from the AUTHORED schedule
 * in the AUTHORED timezone (see `efsOpenStatusAt`), which is why it is correct across DST changes.
 *
 * This component asserts a status only for an input pair the caller has already proved effective
 * and public. It never supplies a default zone.
 */
export function EfsScheduleStatus({ schedule, timeZone, labels }: EfsScheduleStatusProps) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (now === null) return null;

  const status = efsOpenStatusAt(schedule, timeZone, now);

  return (
    <p className="text-sm" data-efs-open={status.open ? "true" : "false"} data-efs-timezone={timeZone}>
      <span className={status.open ? "font-medium text-success" : "text-muted-foreground"}>
        {status.open ? labels.open : labels.closed}
      </span>
    </p>
  );
}
