// tests/browser/ports.mjs
// THE HARNESS'S PORT ALLOCATION CONTRACT (FOUNDATION-CONTROLLED-INTEGRATION-R3)
// ===========================================================================
//
// WHY THIS FILE EXISTS. The harness used to pick a random base port and let every scenario add its own
// offset:
//
//     const BASE_PORT = 3800 + (Math.floor(Math.random() * 900) % 900);
//
// That is sound arithmetic and unsound allocation. Next.js refuses a documented list of browser-unsafe
// ports, and the matrix's real offset inventory reaches +613 — so a draw could put a scenario on 5060
// ("reserved for sip"), where its dev server could not start at all. That is exactly what failed the
// first required-main gate at fe6276aa: `Bad port: "5060" is reserved for sip`, 12480/12481 rows passed,
// one scenario never ran. A re-run only proved the draw could be lucky.
//
// THE CONTRACT, stated once, here:
//
//   1. A port is USABLE only if it is not in RESTRICTED_PORTS and nothing is already listening on it.
//   2. Every port the harness hands out is resolved through ONE allocator, by logical offset.
//   3. Resolution NEVER loops on randomness: a candidate advances by one, deterministically, past a
//      restricted port or a port already taken within this run.
//   4. Offsets are distinct, so ports are distinct: two scenarios can never be handed the same port.
//   5. The offset space is DECLARED (PORT_OFFSET_CAPACITY). Asking for an offset beyond it throws instead
//      of inventing a port, so a new scenario's offset is a visible, testable decision rather than a
//      silent draw that might land on a forbidden port.
//
// The point is not to make 5060 less likely. It is to make a restricted port unreachable.
import { createServer } from "node:net";

/**
 * Ports a browser/Next.js will refuse or reserve. Next.js refuses these outright ("reserved for …"),
 * and the ones inside this harness's operating range are 4045, 4190, 5060 and 5061 — 5060 being the
 * coordinate that actually failed. The rest are carried so this is the list, not a slice of it that
 * happens to matter today.
 */
export const RESTRICTED_PORTS = Object.freeze([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104,
  109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514,
  515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

const RESTRICTED = new Set(RESTRICTED_PORTS);

/** The base draw keeps its historical distribution; only what is derived from it changed. */
export const BASE_PORT_SPAN = Object.freeze({ start: 3800, size: 900 });

/**
 * The largest logical offset the harness may ask for, and therefore the size of the window that must be
 * allocatable above any base. It is the highest REAL offset (613, `header-identity`) plus slack, and the
 * matrix's own source is asserted against it by `tests/unit/browser-port-allocation.test.ts`.
 */
export const PORT_OFFSET_CAPACITY = 640;

/** True when `port` must never be handed to a dev server. */
export function isRestrictedPort(port) {
  return !Number.isInteger(port) || port <= 0 || port > 65535 || RESTRICTED.has(port);
}

/** The next port at or above `candidate` that is not restricted. Deterministic: always advances by 1. */
export function nextUsablePort(candidate) {
  let port = candidate;
  while (isRestrictedPort(port)) port += 1;
  return port;
}

/** Binds 127.0.0.1:port briefly. `true` means the port is free to hand out. */
export function canBind(port) {
  return new Promise((resolve) => {
    const server = createServer();
    const done = (result) => {
      server.removeAllListeners();
      server.close(() => resolve(result));
    };
    server.once("error", () => done(false));
    server.once("listening", () => done(true));
    server.listen({ port, host: "127.0.0.1", exclusive: true });
  });
}

/**
 * Probes `count` consecutive ports from `start` and reports which ones nothing is listening on.
 *
 * A one-off sweep, not a retry loop: the harness learns the shape of its window ONCE, then allocates from
 * what it learned. `probe` is injectable so a test can describe an occupied window without opening sockets.
 */
export async function probePortWindow({ start, count, probe = (port) => canBind(port) } = {}) {
  if (!Number.isInteger(start) || !Number.isInteger(count) || count <= 0) {
    throw new Error(`probePortWindow: invalid window start=${start} count=${count}`);
  }
  const free = new Set();
  for (let step = 0; step < count; step += 1) {
    const port = start + step;
    if (isRestrictedPort(port)) continue;
    if (await probe(port)) free.add(port);
  }
  return free;
}

/**
 * Builds the one allocator the whole browser matrix uses.
 *
 * `port(offset)` is synchronous and total for every offset in `0 … capacity-1`: the window was probed and
 * resolved before the first server started, so no scenario can be handed a restricted port or one already
 * in use, and no resolution path depends on luck. `base` is the port `port(0)` resolves to, which is what
 * the harness exposes as `basePort` — so `basePort` is always a real, usable port, never a raw draw.
 */
export async function createPortAllocator({
  random = Math.random,
  probe,
  span = BASE_PORT_SPAN,
  capacity = PORT_OFFSET_CAPACITY,
} = {}) {
  const drawn = span.start + (Math.floor(random() * span.size) % span.size);
  const free = await probePortWindow({ start: drawn, count: capacity * 2, probe });

  const taken = new Set();
  const byOffset = new Map();

  const resolve = (offset) => {
    if (!Number.isInteger(offset) || offset < 0 || offset >= capacity) {
      throw new Error(
        `port offset ${offset} is outside the harness's declared allocation capacity 0…${capacity - 1}; ` +
          "declare the offset in tests/browser/ports.mjs instead of letting a scenario invent one",
      );
    }
    const existing = byOffset.get(offset);
    if (existing !== undefined) return existing;

    let candidate = drawn + offset;
    const limit = drawn + capacity * 2;
    while (candidate < limit) {
      if (!taken.has(candidate) && free.has(candidate)) {
        taken.add(candidate);
        byOffset.set(offset, candidate);
        return candidate;
      }
      candidate += 1;
    }
    throw new Error(
      `no usable port for offset ${offset} within ${capacity * 2} candidates from ${drawn}; ` +
        "the machine has too few free ports in this window (nothing is retried randomly — widen the window)",
    );
  };

  const base = resolve(0);
  return {
    drawn,
    base,
    capacity,
    port: (offset) => resolve(offset),
    /** The ports handed out so far, for transparent reporting. */
    allocations: () =>
      [...byOffset.entries()].sort((a, b) => a[0] - b[0]).map(([offset, port]) => ({ offset, port })),
  };
}
