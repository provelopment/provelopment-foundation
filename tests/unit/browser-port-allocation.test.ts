// tests/unit/browser-port-allocation.test.ts
// THE PORT CONTRACT, PROVEN RATHER THAN SAMPLED (FOUNDATION-CONTROLLED-INTEGRATION-R3)
// =================================================================================
//
// The harness's first required-main gate failed because a random base port plus a real offset landed on
// 5060, which Next.js refuses ("reserved for sip"). Making that less likely is not a fix; the contract has
// to make it unreachable, and it has to stay unreachable when a later scenario adds a bigger offset.
//
// So this test does three things, in increasing order of usefulness:
//   · it reads the matrix's OWN source to learn the real offset inventory, so a new offset cannot silently
//     exceed the declared capacity;
//   · it proves the forbidden coordinate — every base in the draw's span × every offset in that capacity —
//     can never resolve onto a restricted port, including the coordinates that actually failed;
//   · it proves the allocator's other promises: distinct ports, a bounded refusal when the machine has no
//     room, and a deterministic result for a given draw.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BASE_PORT_SPAN,
  PORT_OFFSET_CAPACITY,
  RESTRICTED_PORTS,
  createPortAllocator,
  isRestrictedPort,
  nextUsablePort,
} from "../browser/ports.mjs";

const BROWSER_DIR = fileURLToPath(new URL("../browser/", import.meta.url));
const read = (file: string) => readFileSync(join(BROWSER_DIR, file), "utf8");

/** Every browser module the harness runs, discovered rather than listed. */
const browserModules = readdirSync(BROWSER_DIR).filter((name) => name.endsWith(".mjs"));
const matrixSource = read("matrix.mjs");

/** The base the allocator draws when the injected `random` reports `value`. */
const drawOf = (base: number) => () => (base - BASE_PORT_SPAN.start + 0.5) / BASE_PORT_SPAN.size;

describe("the restricted-port authority", () => {
  it("contains the ports that actually matter here, and does not refuse ordinary ones", () => {
    for (const port of [4045, 4190, 5060, 5061, 6000, 10080]) {
      expect(isRestrictedPort(port)).toBe(true);
    }
    // 5060's neighbours are what a one-off "+1" fix would have handed out; they are legitimately free.
    for (const port of [3800, 4044, 4046, 5059, 5062, 5063, 5312]) {
      expect(isRestrictedPort(port)).toBe(false);
    }
  });

  it("refuses nonsense instead of guessing", () => {
    for (const port of [0, -1, 1.5, 70_000]) expect(isRestrictedPort(port)).toBe(true);
  });

  it("declares the whole Next.js list, not the slice that failed", () => {
    expect(new Set(RESTRICTED_PORTS).size).toBe(RESTRICTED_PORTS.length);
    for (const port of RESTRICTED_PORTS) expect(Number.isInteger(port) && port > 0).toBe(true);
  });
});

describe("the harness's real offset inventory", () => {
  it("never asks for an offset outside the declared capacity", () => {
    const offsets: number[] = [];
    for (const file of browserModules) {
      const source = read(file);
      // Offset arrays the scenarios iterate (`PORT_OFFSETS`, `SOLO_PORT_OFFSETS`, …).
      for (const match of source.matchAll(/const\s+[A-Z_]*(?:OFFSETS)\s*=\s*\[([^\]]*)\]/g)) {
        for (const value of match[1].split(",")) {
          const parsed = Number(value.trim());
          if (!Number.isNaN(parsed)) offsets.push(parsed);
        }
      }
      // Direct arithmetic on the harness's own base port.
      for (const match of source.matchAll(/(?:BASE_PORT|harness\.basePort)\s*\+\s*(\d+)/g)) {
        offsets.push(Number(match[1]));
      }
    }
    expect(offsets.length).toBeGreaterThan(30);
    for (const offset of offsets) {
      expect(offset, `offset ${offset} exceeds the declared capacity`).toBeLessThan(PORT_OFFSET_CAPACITY);
      expect(offset).toBeGreaterThanOrEqual(0);
    }
    // The highest REAL offset (header-identity's 611/612/613) must be inside the capacity, not at its edge.
    expect(Math.max(...offsets)).toBeGreaterThanOrEqual(613);
    expect(PORT_OFFSET_CAPACITY - Math.max(...offsets)).toBeGreaterThan(0);
  });

  it("no longer draws a base port that nothing then validates", () => {
    // The historical defect, stated as a source assertion: a raw random base with no allocator.
    expect(matrixSource).not.toMatch(/const\s+BASE_PORT\s*=\s*\d+\s*\+\s*\(Math\.random/);
    expect(matrixSource).toContain('from "./ports.mjs"');
    expect(matrixSource).toMatch(/createPortAllocator\(/);
  });
});

describe("a restricted port is unreachable, not unlikely", () => {
  it("holds for every draw and every offset in the capacity", () => {
    const { start, size } = BASE_PORT_SPAN;
    const relevant = new Set<number>();
    // Every coordinate whose raw arithmetic could land on, or just past, a restricted port in range.
    for (const port of RESTRICTED_PORTS) {
      for (let delta = -2; delta <= 2; delta += 1) {
        const coordinate = port + delta;
        if (coordinate < start || coordinate >= start + size + PORT_OFFSET_CAPACITY) continue;
        relevant.add(coordinate);
      }
    }
    for (let base = start; base < start + size; base += 1) {
      for (const coordinate of relevant) {
        const offset = coordinate - base;
        if (offset < 0 || offset >= PORT_OFFSET_CAPACITY) continue;
        const resolved = nextUsablePort(base + offset);
        expect(isRestrictedPort(resolved), `base ${base} + offset ${offset} → ${resolved}`).toBe(false);
      }
    }
    expect(relevant.size).toBeGreaterThan(0);
  });

  it("covers the coordinates that actually failed, including the highest real offsets", async () => {
    const historical: Array<[base: number, offset: number, raw: number]> = [
      [4660, 400, 5060], // header rows: the coordinate the failing run drew
      [4460, 600, 5060], // surfacePort
      [4459, 601, 5060], // configuredPort
      [4449, 611, 5060], // header-identity — the highest offsets the matrix really uses
      [4448, 612, 5060],
      [4447, 613, 5060],
      [4045, 0, 4045], // a restricted base itself
      [4190, 0, 4190],
      [5061, 0, 5061],
    ];
    for (const [base, offset, raw] of historical) {
      // Pin the draw to the coordinate under test — including coordinates outside the production span,
      // because a restricted port must be refused as a base as well as as a derived port.
      const allocator = await createPortAllocator({
        random: () => 0,
        span: { start: base, size: 1 },
        probe: () => true,
      });
      expect(allocator.drawn).toBe(base);
      const port = allocator.port(offset);
      expect(isRestrictedPort(port), `base ${base} offset ${offset} raw ${raw} → ${port}`).toBe(false);
      expect(port).not.toBe(raw);
      expect(port).toBeGreaterThan(raw);
    }
  });

  it("hands out distinct ports for distinct offsets", async () => {
    const allocator = await createPortAllocator({ random: () => 0.5, probe: () => true });
    const ports = Array.from({ length: PORT_OFFSET_CAPACITY }, (_, offset) => allocator.port(offset));
    expect(new Set(ports).size).toBe(ports.length);
    for (const port of ports) expect(isRestrictedPort(port)).toBe(false);
    // Stable identity: asking twice must not move a scenario's server.
    expect(allocator.port(400)).toBe(allocator.port(400));
    expect(allocator.allocations().length).toBe(PORT_OFFSET_CAPACITY);
  });
});

describe("occupancy is bounded and transparent", () => {
  it("steps past a port that is already in use and reports what it allocated", async () => {
    const busy = new Set<number>();
    for (let port = 4000; port <= 4010; port += 1) busy.add(port);
    const allocator = await createPortAllocator({ random: drawOf(4000), probe: (port) => !busy.has(port) });
    expect(allocator.drawn).toBe(4000);
    expect(busy.has(allocator.port(0))).toBe(false);
    expect(allocator.port(0)).toBeGreaterThan(4010);
    const allocations = allocator.allocations();
    expect(allocations.some((entry) => entry.offset === 0)).toBe(true);
    for (const entry of allocations) {
      expect(isRestrictedPort(entry.port)).toBe(false);
      expect(busy.has(entry.port)).toBe(false);
    }
  });

  it("refuses loudly when the window has no room, instead of retrying at random", async () => {
    await expect(createPortAllocator({ random: () => 0, probe: () => false, capacity: 4 })).rejects.toThrow(
      /no usable port/,
    );
  });

  it("refuses an offset it never declared", async () => {
    const allocator = await createPortAllocator({ random: () => 0, probe: () => true });
    expect(() => allocator.port(PORT_OFFSET_CAPACITY)).toThrow(/declared allocation capacity/);
    expect(() => allocator.port(-1)).toThrow(/declared allocation capacity/);
  });

  it("is deterministic for a given draw", async () => {
    const first = await createPortAllocator({ random: () => 0.25, probe: () => true });
    const second = await createPortAllocator({ random: () => 0.25, probe: () => true });
    expect(first.drawn).toBe(second.drawn);
    for (const offset of [0, 21, 150, 400, 600, 601, 613]) {
      expect(first.port(offset)).toBe(second.port(offset));
    }
  });
});
