import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  PAGE_DOCUMENT_SCHEMA_VERSION,
  PAGE_MAX_SECTIONS,
  pageDocumentSchema,
} from "@/core/page-document";
import { contactInquirySchema } from "@/core/contact-inquiry";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};
const lock = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");

function lockVersions(name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const versions = [...lock.matchAll(new RegExp(`^  '?${escaped}@([^\\s(:']+)`, "gm"))].map(
    (match) => match[1],
  );
  return [...new Set(versions)];
}

/**
 * FOUNDATION-SEC-ZOD-A1 — GHSA-mrhx-c7xc-m3w5.
 *
 * Zod 4.6.7 is the single resolved version. The application-level review found one reachable
 * untrusted schema (contact FormData, scalar fields only) and bounded page-document collections;
 * unbounded config/i18n collections are read from owner-controlled local files. The tests below
 * exercise only those bounded inputs — never an uncontrolled memory-exhaustion workload.
 */
describe("FOUNDATION-SEC-ZOD-A1 — patched Zod and bounded collection paths", () => {
  it("pins the patched runtime and removes the vulnerable predecessor", () => {
    expect(packageJson.dependencies.zod).toBe("4.6.7");
    expect(lockVersions("zod")).toEqual(["4.6.7"]);
    expect(lock).not.toContain("zod@4.4.3");
    expect(lock).not.toContain("zod: 4.4.3");
  });

  it("keeps the one-resolution override alongside the accepted brace-expansion overrides", () => {
    expect(workspace).toContain('"zod": "4.6.7"');
    expect(workspace).toContain('"minimatch@3.1.5>brace-expansion": "1.1.21"');
    expect(workspace).toContain('"minimatch@10.2.6>brace-expansion": "5.0.12"');
  });

  it("rejects an oversized bounded array before parsing invalid elements", () => {
    const result = z
      .array(z.string())
      .max(2)
      .safeParse([1, 2, 3, 4]);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.code).toBe("too_big");
    expect(result.error.issues.some((issue) => issue.code === "invalid_type")).toBe(false);
  });

  it("does not invoke element checks when the size gate rejects", () => {
    let elementChecks = 0;
    const element = z.custom<number>((value) => {
      elementChecks += 1;
      return typeof value === "number";
    });

    const result = z
      .array(element)
      .max(2)
      .safeParse(["not-a-number", "not-a-number", "not-a-number", "not-a-number"]);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.code).toBe("too_big");
    expect(elementChecks).toBe(0);
  });

  it("applies the page-document cap before parsing invalid sections", () => {
    const result = pageDocumentSchema.safeParse({
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
      title: "Bounded page",
      sections: Array.from({ length: PAGE_MAX_SECTIONS + 2 }, () => ({
        type: "not-a-section",
      })),
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.code).toBe("too_big");
    expect(result.error.issues[0]?.path).toEqual(["sections"]);
    expect(result.error.issues.some((issue) => issue.code === "invalid_union")).toBe(false);
  });

  it("keeps the request-driven contact schema scalar-only and length-bounded", () => {
    const result = contactInquirySchema.safeParse({
      name: [],
      email: "visitor@example.com",
      message: "Hello",
      locale: "en",
    });

    expect(result.success).toBe(false);
  });
});
