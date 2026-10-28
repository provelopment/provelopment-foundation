/**
 * Types for the harness port-allocation contract (`tests/browser/ports.mjs`).
 *
 * The module is plain ESM because the browser harness runs it with `node` directly; these declarations
 * exist so the regression test in `tests/unit` can import it under `tsc --noEmit` and type-check the
 * contract it relies on.
 */
export declare const RESTRICTED_PORTS: readonly number[];
export declare const BASE_PORT_SPAN: Readonly<{ start: number; size: number }>;
export declare const PORT_OFFSET_CAPACITY: number;

export declare function isRestrictedPort(port: number): boolean;
export declare function nextUsablePort(candidate: number): number;
export declare function canBind(port: number): Promise<boolean>;

export declare function probePortWindow(options?: {
  start: number;
  count: number;
  probe?: (port: number) => boolean | Promise<boolean>;
}): Promise<Set<number>>;

export declare function createPortAllocator(options?: {
  random?: () => number;
  probe?: (port: number) => boolean | Promise<boolean>;
  span?: Readonly<{ start: number; size: number }>;
  capacity?: number;
}): Promise<{
  readonly drawn: number;
  readonly base: number;
  readonly capacity: number;
  port(offset: number): number;
  allocations(): Array<{ offset: number; port: number }>;
}>;
