import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
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
 * W10 development-toolchain security regression.
 *
 * These assertions encode the minimum patched versions accepted after the October 2026 advisory
 * review. They are deliberately lockfile/specifier contracts: a future dependency refresh that
 * reintroduces a vulnerable resolution fails here even if the network audit is unavailable.
 *
 * `braces@3.0.3` is not asserted as vulnerable: GHSA-vfj7-8cjw-p6xm was withdrawn on 2026-10-23 as
 * not practically exploitable. The package remains in the lint toolchain through `fast-glob`, and
 * this test neither suppresses it nor treats the withdrawn advisory as a finding.
 */
describe("W10 — development-toolchain security floor", () => {
  it("keeps the patched direct test toolchain", () => {
    expect(packageJson.devDependencies.vitest).toBe("^4.1.12");
    expect(packageJson.devDependencies.vite).toBe("8.2.4");
  });

  it("resolves only patched Vitest, Vite, and mocker versions", () => {
    expect(lockVersions("vitest")).toEqual(["4.1.12"]);
    expect(lockVersions("vite")).toEqual(["8.2.4"]);
    expect(lockVersions("@vitest/mocker")).toEqual(["4.1.12"]);
  });

  it("resolves both patched brace-expansion lines and no vulnerable predecessor", () => {
    const versions = lockVersions("brace-expansion");
    expect(versions).toContain("1.1.21");
    expect(versions).toContain("5.0.12");
    expect(versions).not.toContain("1.1.18");
    expect(versions).not.toContain("5.0.9");
  });

  it("keeps the targeted transitive overrides explicit", () => {
    expect(workspace).toContain('"minimatch@3.1.5>brace-expansion": "1.1.21"');
    expect(workspace).toContain('"minimatch@10.2.6>brace-expansion": "5.0.12"');
  });

  it("does not regress the already-patched production graph", () => {
    expect(packageJson.dependencies.next).toBe("16.4.2");
    expect(packageJson.dependencies.react).toBe("19.2.9");
    expect(packageJson.dependencies["react-dom"]).toBe("19.2.9");
    expect(packageJson.dependencies["sanitize-html"]).toBe("^2.18.1");
    expect(lockVersions("next")).toEqual(["16.4.2"]);
    expect(lockVersions("sanitize-html")).toEqual(["2.18.1"]);
    expect(lock).not.toContain("next@16.3.8");
    expect(lock).not.toContain("react-dom@19.2.8");
    expect(lock).not.toContain("sanitize-html@2.17.7");
    expect(lock).not.toContain("react-server-dom");
  });
});
