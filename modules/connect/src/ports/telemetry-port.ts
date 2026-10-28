import {
  createDiagnosticEvent,
  type DiagnosticEvent,
  type DiagnosticEventName,
} from '../domain/diagnostics.js';

/** The telemetry schema is the allowlisted diagnostic schema (M5 release gate, §3C). */
export type TelemetryEventName = DiagnosticEventName;
export type TelemetryEvent = DiagnosticEvent;

/**
 * Structured operational signal. This port accepts **only** `DiagnosticEvent`, which has no free-text field:
 * visitor content, recipient addresses and provider error strings cannot be represented. Applications must
 * emit through `emitDiagnostic`, which builds the event with `createDiagnosticEvent`.
 */
export interface TelemetryPort {
  /** Must never throw into the acceptance path; a failing sink must not change an outcome. */
  record(event: DiagnosticEvent): void;
}

/**
 * The **only** telemetry emission boundary (0.1.0 release gate, §3C).
 *
 * Every application event passes through the allowlisted schema before it reaches the sink. An unknown event
 * name, an unknown code or a malformed identifier is dropped rather than forwarded, so no use case can send
 * arbitrary visitor content, a recipient address or a provider error string to telemetry. A sink failure is
 * swallowed because telemetry must never change an outcome.
 */
export function emitDiagnostic(telemetry: TelemetryPort, candidate: unknown): void {
  const event = createDiagnosticEvent(candidate);
  if (event === undefined) return;
  try {
    telemetry.record(event);
  } catch {
    // A failing telemetry sink must never change an outcome or lose an acceptance.
  }
}
