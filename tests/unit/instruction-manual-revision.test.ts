import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ONE TRUTHFUL MANUAL-SET REVISION (FOUNDATION-R8-DOC-01)
 * ======================================================
 *
 * The distributed manuals describe themselves with ONE number: "the version of this manual **set**",
 * surfaced "in the header of every manual" (`instruction-manuals/README.md`). The published release
 * contradicted that: `README.md` declared `2026-10-28.1` while nine manuals still carried `2026-10-22.1`,
 * and `content-management.md` — the manual that had actually changed — never moved. An adopter could not
 * tell "my copy is current" from "my copy is stale", because one number denoted two contents.
 *
 * This suite is the missing guard. It asserts the property, not the number: whatever revision the set
 * declares, EVERY manual wears it, exactly once, and the version table records it. A future set that
 * updates one file and forgets the others fails here instead of reaching an adopter.
 *
 * It also protects two distinctions the manuals depend on: a manual revision is NOT a Foundation
 * Release, and the set is not the adopter's adoption baseline (the record whose revision an installed
 * Foundation carries lives in that installation, never here).
 */
const ROOT = process.cwd();
const MANUALS = path.join(ROOT, "instruction-manuals");
const HEADER = /^> \*\*Manual revision:\*\* `([^`]+)`$/m;

/** Every distributed manual, with its declared revision (or `null` when it declares none). */
function manuals(): { name: string; text: string; revision: string | null }[] {
  return readdirSync(MANUALS)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const text = readFileSync(path.join(MANUALS, name), "utf8");
      const match = HEADER.exec(text);
      return { name, text, revision: match === null ? null : match[1] };
    });
}

describe("the distributed manual set declares ONE revision", () => {
  it("carries the ten distributed manuals", () => {
    expect(manuals().map((manual) => manual.name)).toEqual([
      "README.md",
      "adoption.md",
      "agent-operating-rules.md",
      "branding-and-assets.md",
      "content-management.md",
      "deployment.md",
      "foundation-upgrade.md",
      "site-customization.md",
      "troubleshooting.md",
      "validation.md",
    ]);
  });

  it("gives every manual exactly one header, naming the same revision", () => {
    const set = manuals();
    for (const manual of set) {
      const headers = manual.text.match(new RegExp(HEADER.source, "gm")) ?? [];
      expect(headers.length, `${manual.name} must declare its revision exactly once`).toBe(1);
      expect(manual.revision, `${manual.name} must declare a revision`).not.toBeNull();
    }
    const distinct = [...new Set(set.map((manual) => manual.revision))];
    expect(
      distinct,
      "every manual must wear the SAME set revision — a manual that lags makes one number mean two contents",
    ).toHaveLength(1);
    // The README states the set revision; it is the reference the others must match.
    const readme = set.find((manual) => manual.name === "README.md")!;
    for (const manual of set) {
      expect(manual.revision, `${manual.name} must match the set revision in README.md`).toBe(
        readme.revision,
      );
    }
  });

  it("records that revision in the version table with a truthful note", () => {
    const readme = manuals().find((manual) => manual.name === "README.md")!;
    const revision = readme.revision!;
    const row = new RegExp(
      `^\\| \`${revision.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\` \\| (.+?) \\| (.+?) \\| (.+?) \\|$`,
      "m",
    ).exec(readme.text);
    expect(row, `README.md's version table must record ${revision}`).not.toBeNull();
    // A revision that changed no procedure says so; inventing a procedure-validation result is the
    // failure this asserts against.
    expect(row![1].length, "the version table row must explain the revision").toBeGreaterThan(40);
    expect(row![2].length, "the version table row must state the validation basis").toBeGreaterThan(3);
  });

  it("keeps a manual revision distinct from a Foundation Release and from an adoption baseline", () => {
    const readme = manuals().find((manual) => manual.name === "README.md")!;
    const revision = readme.revision!;
    // A manual revision is a date-stamped SET revision, never a release identity (`v2026…`,
    // `provelopment-foundation-v…`), so the two can never be mistaken for one another in a record.
    expect(revision).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(revision).not.toMatch(/^v\d|foundation-v/i);
    // …and the set says so in its own words, where an adopter will look.
    expect(readme.text).toMatch(/Not a Foundation release/);
    expect(readme.text).toMatch(/adoption record|foundation-baseline\.json/);
  });
});
