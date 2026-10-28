/** Wall-clock access is a port so that domain/application code stays deterministic (M1 §A.2). */
export interface ClockPort {
  /** Epoch milliseconds. No other time source is permitted in inner layers. */
  nowEpochMs(): number;
}
