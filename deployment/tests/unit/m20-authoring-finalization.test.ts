/**
 * THE AUTHORING SURFACE THIS DEPLOYMENT ACTUALLY SHIPS (FOUNDATION-MULTISITE-M20)
 * =============================================================================
 *
 * M20 finishes what an author meets when they open this repository's authored material: documentation at
 * every intermediate authoring root, empty-locale behaviour proved (in `tests/unit/page-authoring-
 * directory-contract.test.ts`, on a disposable tree), the Foundation-owned English About in place, and the
 * retired Site-control copy reconciled.
 *
 * This is DEPLOYMENT scope: it asserts the REAL capsule, through the accepted authorities, so a future
 * authoring change cannot quietly undo the contract — a missing `README.md`, a rewritten About page, or a
 * page that starts advertising a Site control again all fail here, by name.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createPageSources } from "@/adapters/content/page-sources";
import { hostRoutingForInstallation } from "@/config/spoke-host-routing.mjs";
import { foundationSpoke, germanySpoke, type DeploymentSpoke } from "../support/spoke-contexts";

/** The intermediate authoring roots EVERY real Spoke must explain, per page mode and per Site. */
const AUTHORING_DOCS = [
  "content/pages/README.md",
  "content/pages/json/README.md",
  "content/pages/markdown/README.md",
] as const;

/** Each Spoke's Site code, and the intermediates BELOW it that M20 added. */
const SPOKE_DOCS: Record<string, readonly string[]> = {
  foundation: [
    "content/pages/json/main/README.md",
    "content/pages/markdown/main/README.md",
  ],
  germany: ["content/pages/json/main/README.md", "content/pages/markdown/main/README.md"],
};

/**
 * THE AUTHORED PAGE MATERIAL IS FOUNDATION'S OWN (M20, final).
 *
 * An authored page in this capsule is one of the platform's two authoring modes and nothing else: a
 * declarative JSON document (`{ schemaVersion, title, sections[] }`) or safe Markdown whose front matter
 * is at most `title`/`description`. No page here is imported from, derived from, transformed from or
 * verified against any other project's page tree: Foundation has NO page-content relationship with
 * anything outside this repository, and the English About is Foundation-owned copy.
 */

/** The retired-control wording no authored page may offer any more (M20 §30). */
const RETIRED_CLAIMS = [
  "- **Site**",
  "**Site** chooses",
  "**Site** wählt",
  "four visitor controls",
  "all four visitor controls",
  "four visitor dimensions",
  "alle vier Besucher-Bedienelemente",
  "four different aspects",
  "vier verschiedene Aspekte",
  "**Site** wählt einen eigenständigen",
] as const;

function pageFiles(spoke: DeploymentSpoke): string[] {
  return [spoke.markdownPagesRoot, spoke.jsonPagesRoot].filter((root) => existsSync(root));
}

/** Every authored page/document file beneath a Spoke's `content/pages`, at any depth. */
function authoredContentFiles(spoke: DeploymentSpoke): string[] {
  const pagesRoot = path.join(spoke.spokeRoot, "content", "pages");
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(absolute) : [absolute];
    });
  return existsSync(pagesRoot) ? walk(pagesRoot) : [];
}

describe("M20 — the real authoring tree is self-explanatory", () => {
  for (const spoke of [foundationSpoke, germanySpoke]) {
    it(`${spoke.id}: documents every intermediate authoring root`, () => {
      for (const relative of AUTHORING_DOCS) {
        expect(existsSync(path.join(spoke.spokeRoot, relative)), `${spoke.id} ${relative}`).toBe(true);
      }
      for (const relative of SPOKE_DOCS[spoke.id] ?? []) {
        expect(existsSync(path.join(spoke.spokeRoot, relative)), `${spoke.id} ${relative}`).toBe(true);
      }
    });

    it(`${spoke.id}: its authoring documentation is NOT a page or a route`, async () => {
      const pages = createPageSources({ sites: spoke.config.sites, roots: spoke.resources });
      for (const site of spoke.config.sites) {
        for (const locale of site.locales) {
          const routes = await pages.listRoutes(site.code, locale.path);
          expect(routes.some((route) => /readme|how-to/i.test(route)), `${spoke.id} ${site.code}/${locale.path}`).toBe(false);
        }
      }
      expect(pageFiles(spoke).length).toBeGreaterThan(0);
    });
  }
});

describe("M20 — the authoring copy offers no retired control", () => {
  it("has no authored page offering the retired Site control", () => {
    for (const spoke of [foundationSpoke, germanySpoke]) {
      for (const file of authoredContentFiles(spoke)) {
        if (file.endsWith("README.md")) continue;
        const text = readFileSync(file, "utf8");
        for (const claim of RETIRED_CLAIMS) {
          expect(text.includes(claim), `${file.replace(spoke.spokeRoot, "")} claims: ${claim}`).toBe(false);
        }
      }
    }
  });

/**
 * M20 Part B — THIS INSTALLATION'S EXPLICIT INSPECTION POLICY.
 *
 * The three-class hostname policy (`deployment/README.md`) is a real property of this capsule, so it is
 * asserted here on the shipped declaration: exactly one Spoke is nominated for a hostname the hosting
 * platform reports for the build it is running, the nomination is NOT read out of manifest order, and the
 * build's own description is what the request boundary consumes.
 */
/**
 * M20 — FOUNDATION OWNS ITS PAGE MATERIAL.
 *
 * Every authored page in this capsule is one of the platform's two authoring modes and nobody else's copy:
 * a `.md` (safe Markdown, front matter at most `title`/`description`) or a `.json` (a declarative document).
 * No page file names another workspace project, and none of them is derived from, transformed from or
 * verified against another project's page tree. The match is against the workspace's sibling-project naming
 * convention, so no other project is named here either.
 */
describe("M20 — the authored page material is Foundation's own", () => {
  it("holds only this repository's own page files, in the two authoring modes", () => {
    const siblingProject = /\b0[0-9]\.[a-z][a-z-]*/;
    const offenders: string[] = [];

    for (const spoke of [foundationSpoke, germanySpoke]) {
      for (const file of authoredContentFiles(spoke)) {
        const relative = file.slice(spoke.spokeRoot.length + 1).split(path.sep).join("/");
        if (!/\.(?:md|json)$/.test(file)) offenders.push(`${relative}: not a page file`);
        if (siblingProject.test(readFileSync(file, "utf8"))) offenders.push(`${relative}: names another project`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("M20/M22 — this Installation's inspection policy", () => {
  /** The PERMANENT Vercel project alias the owner reported as returning "Not Found" before M22. */
  const PROJECT_ALIAS = "provelopment-foundation.vercel.app";

  it("names `foundation` beside the declaration, and the platform's own hostnames select it", () => {
    const capsule = path.join(process.cwd(), "deployment");
    const manifest = JSON.parse(readFileSync(path.join(capsule, "spokes.json"), "utf8")) as {
      spokes: { id: string }[];
      inspectionSpoke?: string;
      inspectionHosts?: string[];
    };

    // The declaration keeps its authored order, and the policy is stated BESIDE it — never derived from it.
    expect(manifest.spokes.map((spoke) => spoke.id)).toEqual(["foundation", "germany"]);
    expect(manifest.inspectionSpoke).toBe("foundation");
    // …and the PERMANENT project alias is authored here, because NO build variable reliably carries it.
    expect(manifest.inspectionHosts).toEqual([PROJECT_ALIAS]);

    const before = { url: process.env["VERCEL_URL"], branch: process.env["VERCEL_BRANCH_URL"] };
    process.env["VERCEL_URL"] = "provelopment-foundation-raoo2g20f-provelopment.vercel.app";
    process.env["VERCEL_BRANCH_URL"] = "provelopment-foundation-git-main-provelopment.vercel.app";
    try {
      const routing = hostRoutingForInstallation(capsule);
      expect(routing.mode).toBe("multi");
      expect(routing.inspection).toEqual({
        spokeId: "foundation",
        hostnames: [
          "provelopment-foundation-raoo2g20f-provelopment.vercel.app",
          "provelopment-foundation-git-main-provelopment.vercel.app",
          PROJECT_ALIAS,
        ],
        platformHostnames: [
          "provelopment-foundation-raoo2g20f-provelopment.vercel.app",
          "provelopment-foundation-git-main-provelopment.vercel.app",
        ],
        authoredHostnames: [PROJECT_ALIAS],
      });
    } finally {
      if (before.url === undefined) delete process.env["VERCEL_URL"];
      else process.env["VERCEL_URL"] = before.url;
      if (before.branch === undefined) delete process.env["VERCEL_BRANCH_URL"];
      else process.env["VERCEL_BRANCH_URL"] = before.branch;
    }
  });

  it("answers the PERMANENT project alias with no platform variable involved at all", () => {
    // THE DEFECT (M22). `provelopment-foundation.vercel.app` is the project's permanent alias: Vercel's
    // build variables carry the deployment- and branch-specific URLs, and NOT reliably this one — so a
    // build that reports none of them still has to answer it. Declared in the capsule, matched by EXACT
    // equality, and independent of every VERCEL_* value.
    const capsule = path.join(process.cwd(), "deployment");
    const before = {
      url: process.env["VERCEL_URL"],
      branch: process.env["VERCEL_BRANCH_URL"],
      production: process.env["VERCEL_PROJECT_PRODUCTION_URL"],
    };
    delete process.env["VERCEL_URL"];
    delete process.env["VERCEL_BRANCH_URL"];
    delete process.env["VERCEL_PROJECT_PRODUCTION_URL"];
    try {
      const routing = hostRoutingForInstallation(capsule);

      expect(routing.mode).toBe("multi");
      expect(routing.inspection).toEqual({
        spokeId: "foundation",
        hostnames: [PROJECT_ALIAS],
        platformHostnames: [],
        authoredHostnames: [PROJECT_ALIAS],
      });
    } finally {
      if (before.url === undefined) delete process.env["VERCEL_URL"];
      else process.env["VERCEL_URL"] = before.url;
      if (before.branch === undefined) delete process.env["VERCEL_BRANCH_URL"];
      else process.env["VERCEL_BRANCH_URL"] = before.branch;
      if (before.production === undefined) delete process.env["VERCEL_PROJECT_PRODUCTION_URL"];
      else process.env["VERCEL_PROJECT_PRODUCTION_URL"] = before.production;
    }
  });
});

});
