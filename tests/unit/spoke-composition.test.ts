import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { parseSiteConfig } from "@/config";
import { DEPLOYMENT_CONFIG_FILE_NAME } from "@/config/deployment-root";
import { readSpokeSiteConfig, spokeConfigFilePath } from "@/config/spoke-config";
import { canonicalHostnameForSpoke, composeInstallationSpokeHub, configureSpoke } from "@/config/spoke-composition";
import {
  INSTALLATION_SPOKE_COLLECTION_FILE_NAME,
  SPOKE_ROOTS_DIRECTORY_NAME,
  resolveInstallationSpokeRoots,
} from "@/config/spoke-roots";
import { IMPLICIT_HUB_ID, IMPLICIT_SPOKE_ID, resolveSpokeFromHost, sharedHostnames, spokeHubIssues } from "@/core/spoke";

/**
 * PER-SPOKE CONFIGURATION -> DOMAIN SPOKE COMPOSITION (FOUNDATION-MULTISITE-S3D1A)
 * ==========================================================================
 *
 * Proves that several INDEPENDENTLY CONFIGURED Spokes can coexist coherently: each declared Spoke root is
 * read through its own `site.config.json` and resolved by the EXISTING `parseSiteConfig` (so `resolveSites`
 * runs exactly once per Spoke), its canonical hostname comes from its own `site.url`, its Hubs are the ones
 * its own configuration produced, and the pure `spokeHubIssues` contract decides every cross-Spoke rule.
 *
 * Every fixture is a SYNTHETIC Installation root in OS temp, created and removed by this file; the canonical
 * deployment is never involved. The slice is UNWIRED, so these tests are its only consumers.
 */

const trees: string[] = [];

function syntheticTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

/** A LOCATOR is POSIX-style authored data, so it is joined with "/" (never with `path.join`). */
const spokeLocator = (...parts: string[]): string => [SPOKE_ROOTS_DIRECTORY_NAME, ...parts].join("/");

/** Absolute path under a tree, from a POSIX-style locator (fixtures only). */
const at = (root: string, locator: string): string => path.join(root, ...locator.split("/"));

/** The ONE relative path a failure message may name. */
const relative = (file: string): string => path.relative(process.cwd(), file).split(path.sep).join("/");

/** A minimal VALID `site.config.json` for ONE Spoke. */
function siteConfigJson(options: {
  readonly url: string;
  readonly sites?: readonly Record<string, unknown>[] | undefined;
  readonly localeCodes?: readonly string[] | undefined;
}): Record<string, unknown> {
  const localeCodes = options.localeCodes ?? ["en"];
  return {
    site: {
      url: options.url,
      name: "Example",
      tagline: "Example tagline",
      description: "Example description",
    },
    i18n: {
      defaultLocale: localeCodes[0],
      locales: localeCodes.map((code) => ({ code, label: code })),
    },
    ...(options.sites === undefined ? {} : { sites: options.sites }),
    contact: {},
    socialLinks: [],
    navigation: [{ label: "Home", href: "/" }],
  };
}

function writeConfig(directory: string, config: unknown): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, DEPLOYMENT_CONFIG_FILE_NAME),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

/** A LEGACY installation: the Installation root IS the implicit Spoke root. */
function legacyInstallation(
  config: unknown = siteConfigJson({ url: "https://legacy.example.com" }),
): string {
  const root = syntheticTree("foundation-s3d1a-legacy-");
  writeConfig(root, config);
  return root;
}

/** An EXPLICIT installation: `<root>/spokes.json` plus one authored Spoke root per entry. */
function explicitInstallation(
  spokes: readonly {
    readonly id: string;
    readonly locator: string;
    readonly config?: unknown | undefined;
  }[],
): string {
  const root = syntheticTree("foundation-s3d1a-explicit-");
  for (const spoke of spokes) {
    writeConfig(
      at(root, spoke.locator),
      spoke.config ?? siteConfigJson({ url: `https://${spoke.id}.example.com` }),
    );
  }
  writeFileSync(
    path.join(root, INSTALLATION_SPOKE_COLLECTION_FILE_NAME),
    `${JSON.stringify(
      { spokes: spokes.map(({ id, locator }) => ({ id, root: locator })) },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return root;
}

/** The failure message of an action that must fail, or a thrown error when it does not. */
function captureFailure(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the action to fail, but it succeeded");
}

/** Every executable source file under `src/**` (the surface a production importer would appear in). */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mjs)$/.test(full)) found.push(full);
  }
  return found;
}

/**
 * Two Spokes that deliberately repeat the SAME Site codes AND the same Hub id — both valid, because Hub ids
 * and Site codes are scoped to a Spoke. `demo` declares its sites in reverse order, so its default Site is
 * `de` while `foundation`'s is `ww`.
 */
function twoSpokeInstallation(): string {
  return explicitInstallation([
    {
      id: "foundation",
      locator: spokeLocator("foundation"),
      config: siteConfigJson({
        url: "https://foundation.example.com",
        localeCodes: ["en", "de"],
        sites: [
          { code: "ww", hub: "europe" },
          { code: "de", hub: "europe" },
        ],
      }),
    },
    {
      id: "demo",
      locator: spokeLocator("demo"),
      config: siteConfigJson({
        url: "https://demo.example.com",
        localeCodes: ["en", "de"],
        sites: [
          { code: "de", hub: "europe" },
          { code: "ww", hub: "north" },
        ],
      }),
    },
  ]);
}

const compose = (root: string) => composeInstallationSpokeHub(resolveInstallationSpokeRoots(root));

const siteCodesOf = (spoke: { readonly hubs: readonly { readonly sites: readonly { readonly code: string }[] }[] }): string[] =>
  spoke.hubs.flatMap((hub) => hub.sites.map((site) => site.code)).sort();

const defaultSitesOf = (spoke: {
  readonly hubs: readonly { readonly sites: readonly { readonly code: string; readonly isDefault: boolean }[] }[];
}): string[] =>
  spoke.hubs
    .flatMap((hub) => hub.sites)
    .filter((site) => site.isDefault)
    .map((site) => site.code);

describe("legacy implicit composition", () => {
  it("composes ONE Spoke: the reserved id, the canonical host from the existing origin, today's Hubs", () => {
    const spokeHub = compose(legacyInstallation());

    expect(spokeHub.spokes).toHaveLength(1);
    const spoke = spokeHub.spokes[0];
    expect(spoke.identity.id).toBe(IMPLICIT_SPOKE_ID);
    expect(spoke.identity.id).toBe("implicit");
    expect(spoke.identity.canonicalHostname).toBe("legacy.example.com");
    expect(spoke.identity.hostnameClaims).toEqual(["legacy.example.com"]);
    expect(spoke.hubs.map((hub) => hub.identity.id)).toEqual([IMPLICIT_HUB_ID]);
  });

  it("carries the configuration's Hubs BY IDENTITY (no clone, no re-partition)", () => {
    const root = legacyInstallation();
    const config = readSpokeSiteConfig({ id: IMPLICIT_SPOKE_ID, root });

    expect(configureSpoke({ id: IMPLICIT_SPOKE_ID, root }, config).hubs).toBe(config.hubs);
  });

  it("is coherent by the pure contract, with no authored migration", () => {
    expect(spokeHubIssues(compose(legacyInstallation()))).toEqual([]);
  });
});

describe("explicit one-Spoke composition", () => {
  it("takes the id from the MANIFEST and the canonical host from that Spoke's site.url", () => {
    const root = explicitInstallation([
      {
        id: "foundation",
        locator: spokeLocator("foundation"),
        config: siteConfigJson({ url: "https://foundation.example.com" }),
      },
    ]);

    const spokeHub = compose(root);
    expect(spokeHub.spokes).toHaveLength(1);
    expect(spokeHub.spokes[0].identity.id).toBe("foundation");
    expect(spokeHub.spokes[0].identity.canonicalHostname).toBe("foundation.example.com");
    expect(spokeHubIssues(spokeHub)).toEqual([]);
  });

  it("keeps identity independent of the directory name and of the hostname", () => {
    const root = explicitInstallation([
      {
        id: "one",
        locator: spokeLocator("site-one"),
        config: siteConfigJson({ url: "https://elsewhere.example.com" }),
      },
    ]);

    const spoke = compose(root).spokes[0];
    expect(spoke.identity.id).toBe("one");
    expect(spoke.identity.canonicalHostname).toBe("elsewhere.example.com");
  });
});

describe("explicit multi-Spoke composition", () => {
  it("composes two Spokes that REPEAT the same Site codes, each with its OWN Sites and its OWN default", () => {
    const spokeHub = compose(twoSpokeInstallation());

    expect(spokeHub.spokes.map((spoke) => spoke.identity.id)).toEqual(["foundation", "demo"]);
    expect(spokeHub.spokes.map((spoke) => spoke.identity.canonicalHostname)).toEqual([
      "foundation.example.com",
      "demo.example.com",
    ]);
    expect(spokeHubIssues(spokeHub)).toEqual([]);

    // TWO populations, never one: the same codes appear in BOTH Spokes, and each Spoke keeps its own default.
    for (const spoke of spokeHub.spokes) expect(siteCodesOf(spoke)).toEqual(["de", "ww"]);
    expect(defaultSitesOf(spokeHub.spokes[0])).toEqual(["ww"]);
    expect(defaultSitesOf(spokeHub.spokes[1])).toEqual(["de"]);
  });

  it("lets one Hub id belong to two Spokes, with a DIFFERENT partition in each", () => {
    const spokeHub = compose(twoSpokeInstallation());

    expect(spokeHub.spokes[0].hubs.map((hub) => hub.identity.id)).toEqual(["europe"]);
    expect(spokeHub.spokes[1].hubs.map((hub) => hub.identity.id)).toEqual(["europe", "north"]);
  });

  it("preserves AUTHORED manifest order (never sorted)", () => {
    const root = explicitInstallation([
      {
        id: "zeta",
        locator: spokeLocator("zeta"),
        config: siteConfigJson({ url: "https://zeta.example.com" }),
      },
      {
        id: "alpha",
        locator: spokeLocator("alpha"),
        config: siteConfigJson({ url: "https://alpha.example.com" }),
      },
    ]);

    expect(compose(root).spokes.map((spoke) => spoke.identity.id)).toEqual(["zeta", "alpha"]);
  });
});

describe("canonical hostname derivation", () => {
  it("normalizes case, a port and a DNS-root trailing dot to ONE value", () => {
    const config = (url: string) => parseSiteConfig(siteConfigJson({ url }));

    expect(canonicalHostnameForSpoke(config("https://Example.COM:8443"), "test")).toBe("example.com");
    expect(canonicalHostnameForSpoke(config("https://example.com."), "test")).toBe("example.com");
    expect(canonicalHostnameForSpoke(config("https://foundation.example.com"), "test")).toBe(
      "foundation.example.com",
    );
  });

  it("claims exactly the canonical hostname, and nothing else", () => {
    const spoke = compose(twoSpokeInstallation()).spokes[0];
    expect(spoke.identity.hostnameClaims).toEqual([spoke.identity.canonicalHostname]);
  });
});

describe("cross-Spoke coherence belongs to the PURE contract, never to the loader", () => {
  it("COMPOSES two Spokes whose derived canonical hostname is the SAME — a SHARED host", () => {
    const root = explicitInstallation([
      {
        id: "foundation",
        locator: spokeLocator("foundation"),
        config: siteConfigJson({ url: "https://example.com" }),
      },
      { id: "demo", locator: spokeLocator("demo"), config: siteConfigJson({ url: "https://example.com" }) },
    ]);

    // The loader reads, derives and composes; it does not invent an ownership rule of its own. Two Spokes
    // authoring one public origin is a legitimate SHARED host under `D31`, so composition SUCCEEDS.
    const spokeHub = compose(root);
    expect(spokeHub.spokes.map((spoke) => spoke.identity.id)).toEqual(["foundation", "demo"]);
    expect(spokeHub.spokes.map((spoke) => spoke.identity.canonicalHostname)).toEqual([
      "example.com",
      "example.com",
    ]);
  });

  it("states that classification in the PURE contract, not in the loader", () => {
    const config = parseSiteConfig(siteConfigJson({ url: "https://example.com" }));
    const a = configureSpoke({ id: "foundation", root: "a" }, config);
    const b = configureSpoke({ id: "demo", root: "b" }, config);
    const spokeHub = { spokes: [a, b] };

    // No declaration defect: the hostname is shared, not ambiguous-by-mistake.
    expect(spokeHubIssues(spokeHub)).toEqual([]);
    expect([...sharedHostnames(spokeHub.spokes)]).toEqual(["example.com"]);
    // And the consequence is dispatch's, stated once: a shared host names no owner.
    expect(resolveSpokeFromHost(spokeHub, "example.com")).toBeNull();
  });
});

describe("failure aggregation", () => {
  it("names the owning Spoke for an invalid SiteConfig", () => {
    const root = explicitInstallation([
      {
        id: "foundation",
        locator: spokeLocator("foundation"),
        config: siteConfigJson({ url: "https://foundation.example.com" }),
      },
      {
        id: "demo",
        locator: spokeLocator("demo"),
        config: siteConfigJson({ url: "https://demo.example.com", sites: [{ code: "Canada" }] }),
      },
    ]);

    const message = captureFailure(() => compose(root));
    expect(message).toMatch(/Invalid Installation Spoke configuration/);
    expect(message).toMatch(/Spoke "demo"/);
    expect(message).toMatch(/site\.config\.json/);
    expect(message).toMatch(/Invalid site configuration/);
    expect(message).not.toMatch(/Spoke "foundation"/);
  });

  it("names the owning Spoke for an invalid Hub membership", () => {
    const root = explicitInstallation([
      {
        id: "foundation",
        locator: spokeLocator("foundation"),
        config: siteConfigJson({
          url: "https://foundation.example.com",
          sites: [{ code: "ww", hub: "europe" }, { code: "de" }],
        }),
      },
    ]);

    const message = captureFailure(() => compose(root));
    expect(message).toMatch(/Spoke "foundation"/);
    expect(message).toMatch(/has no Hub assignment/);
  });

  it("reports EVERY failing Spoke together, and returns no partial Spoke Hub", () => {
    const root = explicitInstallation([
      {
        id: "foundation",
        locator: spokeLocator("foundation"),
        config: siteConfigJson({ url: "https://foundation.example.com", sites: [{ code: "Canada" }] }),
      },
      // A differently-shaped failure: the origin is not an absolute URL.
      { id: "demo", locator: spokeLocator("demo"), config: siteConfigJson({ url: "www.example.com" }) },
    ]);

    const message = captureFailure(() => compose(root));
    expect(message).toMatch(/Spoke "foundation"/);
    expect(message).toMatch(/Spoke "demo"/);
  });

  it("keeps TODAY's error shape for a legacy failure (no Spoke wrapping)", () => {
    const root = legacyInstallation(
      siteConfigJson({ url: "https://legacy.example.com", sites: [{ code: "Canada" }] }),
    );

    const message = captureFailure(() => compose(root));
    expect(message).toMatch(/^Invalid site configuration:/);
    expect(message).not.toMatch(/Spoke/);
  });
});

describe("the per-Spoke reader", () => {
  it("reads the descriptor's OWN root, which it is given — it discovers nothing", () => {
    const first = legacyInstallation(siteConfigJson({ url: "https://first.example.com" }));
    const second = legacyInstallation(siteConfigJson({ url: "https://second.example.com" }));

    expect(readSpokeSiteConfig({ id: "one", root: first }).url).toBe("https://first.example.com");
    expect(readSpokeSiteConfig({ id: "two", root: second }).url).toBe("https://second.example.com");
  });

  it("names the ONE configuration path it could not read", () => {
    const root = syntheticTree("foundation-s3d1a-missing-");
    const descriptor = { id: "one", root };

    expect(spokeConfigFilePath(descriptor)).toBe(path.join(root, DEPLOYMENT_CONFIG_FILE_NAME));
    expect(captureFailure(() => readSpokeSiteConfig(descriptor))).toMatch(
      /carries no readable "site\.config\.json"/,
    );
  });

  it("refuses a malformed document", () => {
    const root = syntheticTree("foundation-s3d1a-bad-json-");
    writeFileSync(path.join(root, DEPLOYMENT_CONFIG_FILE_NAME), "{ nope\n", "utf8");

    expect(captureFailure(() => readSpokeSiteConfig({ id: "one", root }))).toMatch(
      /is not valid JSON/,
    );
  });
});

describe("S3D1A is UNWIRED and discovers nothing", () => {
  it("no application module imports the per-Spoke reader or the composition seam", () => {
    const importers = (pattern: RegExp): string[] =>
      sourceFiles(path.join(process.cwd(), "src"))
        .filter((file) => pattern.test(readFileSync(file, "utf8")))
        .map(relative);

    // S3F2A — the seams are no longer GLOBALLY unwired: their sanctioned RUNTIME consumer is the immutable
    // Installation/runtime-context composition boundary, and it is the only one. Nothing else changes: the
    // composition seam still has exactly one consumer, and no other module may reach either seam.
    expect(importers(/from\s+["'][^"']*spoke-config["']/)).toEqual([
      "src/config/installation-runtime.ts",
      "src/config/spoke-composition.ts",
    ]);
    expect(importers(/from\s+["'][^"']*spoke-composition["']/)).toEqual([
      "src/config/installation-runtime.ts",
    ]);
  });

  it("is not published by the client-facing config barrel", () => {
    const barrel = readFileSync(path.join(process.cwd(), "src", "config", "index.ts"), "utf8");
    expect(barrel).not.toMatch(/spoke-config|spoke-composition/);
  });

  it("the reader discovers no root of its own: no cwd, no env, no manifest, no layout", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "config", "spoke-config.ts"), "utf8");
    // CODE only: the module's prose legitimately NAMES the things it refuses to do.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, ""))
      .filter((line) => line.trim().length > 0)
      .join("\n");

    for (const forbidden of [/process\.cwd\(\)/, /process\.env/, /spokes\.json/, /deployment-build/]) {
      expect(code, String(forbidden)).not.toMatch(forbidden);
    }
    // The ONE thing it reads is the Spoke's configuration file, spelled through the shared constant.
    expect(code).toMatch(/DEPLOYMENT_CONFIG_FILE_NAME/);
  });
});
