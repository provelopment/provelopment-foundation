import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hostRoutingForInstallation } from "@/config/spoke-host-routing.mjs";
import { installationRuntimeIndex } from "@/config/installation-runtime";
import { loadSpokeDictionaryRegistry } from "@/config/spoke-dictionaries";
import { runtimeSegmentForIdentifiedSpokeRef } from "@/config/spoke-runtime-segment.mjs";
import { resolveInstallationSpokeRoots } from "@/config/spoke-roots";
import { buildPlan, runtimeNamespaces } from "../../scripts/sync-runtime-assets.mjs";

/**
 * TWO IDENTIFIED SPOKE HUBS, ONE INSTALLATION (FOUNDATION-ID-M3-P3 §10)
 * ====================================================================
 *
 * ONE disposable Installation authored in the NESTED form, with TWO identified Spoke Hubs — and a REPEATED
 * local Spoke id across them, which is the whole point: `docs` exists in BOTH Hubs, so no consumer may
 * address either member by its local id alone.
 *
 *   Spoke Hub "one"   docs   https://hub-one-docs.localhost   (+ a Hub-scoped switcher to its sibling)
 *                     news   https://hub-one-news.localhost
 *   Spoke Hub "two"   docs   https://hub-two-docs.localhost   ← the SAME local id, a DIFFERENT Spoke
 *
 * Every member authors its own configuration, dictionary wording, pages and artwork, and the members
 * deliberately SHARE logical coordinates (`ww` / `en` / `about`) so an isolation defect cannot hide behind
 * differing paths. The proofs below travel the REAL path — the declaration seam, the build's producer, the
 * request boundary's decision, the runtime context, the asset plan — because that is where isolation either
 * holds or does not.
 */

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

/** The committed synthetic deployment: the SOURCE of this Installation's dictionaries and artwork. */
const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

/** The two Spoke Hubs, in MANIFEST order, with their members. */
const HUBS = [
  {
    id: "one",
    spokeSwitcher: {
      options: [
        { spokeId: "docs", label: "Hub One Docs", href: "https://hub-one-docs.localhost" },
        { spokeId: "news", label: "Hub One News", href: "https://hub-one-news.localhost" },
      ],
    },
    spokes: [
      {
        id: "docs",
        directory: "spokes/hub-one-docs",
        hostname: "hub-one-docs.localhost",
        siteName: "Hub One Docs Site",
        tagline: "Hub One owns this hostname",
        homeLabel: "One Docs Home",
        aboutLabel: "One Docs About",
        aboutBody: "Hub One's docs Spoke wrote this paragraph.",
        onlyRoute: "one-docs-only",
      },
      {
        id: "news",
        directory: "spokes/hub-one-news",
        hostname: "hub-one-news.localhost",
        siteName: "Hub One News Site",
        tagline: "Hub One's second member owns this hostname",
        homeLabel: "One News Home",
        aboutLabel: "One News About",
        aboutBody: "Hub One's news Spoke wrote a different paragraph.",
        onlyRoute: "one-news-only",
      },
    ],
  },
  {
    id: "two",
    spokes: [
      {
        // THE SAME LOCAL ID AS HUB ONE'S FIRST MEMBER — a different Spoke.
        id: "docs",
        directory: "spokes/hub-two-docs",
        hostname: "hub-two-docs.localhost",
        siteName: "Hub Two Docs Site",
        tagline: "Hub Two owns its OWN docs hostname",
        homeLabel: "Two Docs Home",
        aboutLabel: "Two Docs About",
        aboutBody: "Hub Two's docs Spoke wrote the third paragraph.",
        onlyRoute: "two-docs-only",
      },
    ],
  },
];

/** ONE member of the fixture, as the helpers below consume it. */
type Member = {
  readonly id: string;
  readonly directory: string;
  readonly hostname: string;
  readonly siteName: string;
  readonly tagline: string;
  readonly homeLabel: string;
  readonly aboutLabel: string;
  readonly aboutBody: string;
  readonly onlyRoute: string;
};

/** EVERY member, each with its OWNING Hub. */
const MEMBERS: readonly { readonly hubId: string; readonly spoke: Member }[] = HUBS.flatMap((hub) =>
  hub.spokes.map((spoke) => ({ hubId: hub.id, spoke })),
);

/** The COMPOSITE inspection nomination (M3-P2 §8.4) — Hub `two`'s `docs`, deliberately NOT the first Hub. */
const INSPECTION = {
  spokeHubId: "two",
  spokeId: "docs",
  hostnames: ["inspect.localhost"],
};

/** The COMPOSITE runtime segment of one member — the ONE identity its namespace and context derive from. */
function segmentOf(hubId: string, spokeId: string): string {
  return runtimeSegmentForIdentifiedSpokeRef({ spokeHubId: hubId, spokeId });
}

/**
 * The basename of ONE member's own brand mark, in the spelling the configuration schema accepts.
 *
 * It is deliberately NOT the runtime segment: a composite segment carries the `+` separator, and an accepted
 * `site.assets`/navigation icon basename may not. The author names their own file, and the plan mirrors it
 * into the member's OWN namespace under that name.
 */
function memberFile(spoke: Member): string {
  return `${spoke.onlyRoute}.svg`;
}

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/** A member's own configuration, authored as the schema expects it. */
function memberConfig(segment: string, spoke: Member): string {
  const source = JSON.parse(readFileSync(path.join(FIXTURES, "site.config.json"), "utf8"));

  return `${JSON.stringify(
    {
      ...source,
      site: {
        ...source.site,
        url: `https://${spoke.hostname}`,
        name: spoke.siteName,
        tagline: spoke.tagline,
        assets: { favicon: `https://${spoke.hostname}/spokes/${segment}/assets/favicon.svg` },
      },
      i18n: {
        defaultLocale: "en",
        locales: [{ code: "en", label: "English", englishLabel: "English" }],
      },
      sites: [{ code: "ww", label: "Global" }],
      defaultSite: "ww",
      navigation: [
        { label: "Home", href: "/", iconOpen: "icon-home.svg", iconClosed: "icon-home.svg" },
        { label: "About", href: "/about", iconOpen: "icon-about.svg", iconClosed: "icon-about.svg" },
        {
          label: "Member",
          href: `/${spoke.onlyRoute}`,
          // The icon basename the schema accepts (letters, digits, `.`, `_`, `-`): a COMPOSITE segment
          // contains the `+` separator, which is not such a basename — so an author names their own mark
          // with their own spelling, exactly as the role artwork is addressed by basename.
          iconOpen: memberFile(spoke),
          iconClosed: memberFile(spoke),
        },
      ],
      business: { regions: {} },
      socialLinks: [],
      features: {
        analytics: { provider: "none" },
        maps: { provider: "none" },
        booking: { provider: "none" },
        contact: { provider: "stub" },
      },
    },
    null,
    2,
  )}\n`;
}

/** A member's dictionary: the fixture's own, with the wording THIS member differs in. */
function memberDictionary(spoke: Member): string {
  const source = JSON.parse(readFileSync(path.join(FIXTURES, "config", "i18n", "en.json"), "utf8"));

  return `${JSON.stringify(
    {
      ...source,
      home: { ...source.home, tagline: spoke.tagline },
      navigation: {
        ...source.navigation,
        items: { "/": spoke.homeLabel, "/about": spoke.aboutLabel },
      },
    },
    null,
    2,
  )}\n`;
}

/** Writes ONE member's authored tree beneath the Installation root. */
function authorMember(root: string, segment: string, spoke: Member): void {
  const spokeRoot = path.join(root, ...spoke.directory.split("/"));
  write(path.join(spokeRoot, "site.config.json"), memberConfig(segment, spoke));
  write(path.join(spokeRoot, "config", "i18n", "en.json"), memberDictionary(spoke));

  // The SHARED public coordinates, with THIS member's own content — plus a route only it authors.
  write(
    path.join(spokeRoot, "content", "pages", "markdown", "ww", "en", "about.md"),
    `---\ntitle: ${spoke.siteName} About\ndescription: ${spoke.aboutBody}\n---\n\n${spoke.aboutBody}\n`,
  );
  write(
    path.join(spokeRoot, "content", "pages", "markdown", "ww", "en", `${spoke.onlyRoute}.md`),
    `---\ntitle: ${spoke.onlyRoute}\ndescription: ${spoke.siteName} authors it\n---\n\n` +
      `${spoke.siteName} authors ${spoke.onlyRoute} and no other Spoke does.\n`,
  );

  // The authored artwork SOURCES, copied from the accepted fixture so the asset installer accepts them
  // unchanged — plus THIS member's own mark, in a location the canonical plan mirrors into its OWN namespace
  // (`content/assets/branding/**`).
  cpSync(path.join(FIXTURES, "content", "assets"), path.join(spokeRoot, "content", "assets"), {
    recursive: true,
  });
  write(
    path.join(spokeRoot, "content", "assets", "branding", memberFile(spoke)),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${spoke.siteName}</title></svg>\n`,
  );
}

/** The nested manifest, exactly as an author would write it. */
function manifest(): string {
  return `${JSON.stringify(
    {
      spokeHubs: HUBS.map((hub) => ({
        id: hub.id,
        spokes: hub.spokes.map((spoke) => ({ id: spoke.id, root: spoke.directory })),
        ...("spokeSwitcher" in hub ? { spokeSwitcher: hub.spokeSwitcher } : {}),
      })),
      inspectionSpoke: { spokeHubId: INSPECTION.spokeHubId, spokeId: INSPECTION.spokeId },
      inspectionHosts: INSPECTION.hostnames,
    },
    null,
    2,
  )}\n`;
}

/**
 * A disposable TWO-HUB Installation, and the routing description the BUILD would inline for it.
 *
 * The description comes from the producer itself (`hostRoutingForInstallation`) rather than being composed
 * here: what the request boundary and the runtime index consume must be what the build actually emits.
 */
function twoHubInstallation(): { readonly root: string; readonly routing: unknown } {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-m3p3-two-hubs-"));
  trees.push(root);

  for (const member of MEMBERS) authorMember(root, segmentOf(member.hubId, member.spoke.id), member.spoke);
  write(path.join(root, "spokes.json"), manifest());

  return { root, routing: hostRoutingForInstallation(root) };
}

// ── THE REQUEST BOUNDARY, THE RUNTIME CONTEXT AND THE ASSET PLAN, ON THE SAME INSTALLATION ───────────────

describe("the same Installation, through the request boundary and the runtime index", () => {
  const built = twoHubInstallation();
  const savedRoot = process.env.FOUNDATION_DEPLOYMENT_ROOT;

  beforeEach(() => {
    vi.resetModules();
    // The build's OWN selection, published exactly as `deploymentEnvironment` publishes it: an identified
    // Installation inlines NO configuration and NO single resource root, and the routing description is the
    // producer's own output.
    vi.stubEnv("FOUNDATION_DEPLOYMENT_ROOT", built.root);
    vi.stubEnv("FOUNDATION_DEPLOYMENT_MODE", "hubs");
    vi.stubEnv("FOUNDATION_DEPLOYMENT_HOST_ROUTING", JSON.stringify(built.routing));
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    void savedRoot;
  });

  it("resolves each hostname to the member that CLAIMS it, Hub included", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    for (const member of MEMBERS) {
      const context = runtimeContextForRequestHost(member.spoke.hostname);
      expect(context?.id, member.spoke.hostname).toBe(member.spoke.id);
      expect(context?.spokeHubId, member.spoke.hostname).toBe(member.hubId);
      expect(context?.runtimeSegment).toBe(segmentOf(member.hubId, member.spoke.id));
      expect(context?.canonicalHostname).toBe(member.spoke.hostname);
      // …and the identity is COMPOSITE, so a caller holding the context can never lose which Hub it came from.
      expect(context?.spokeRef).toEqual({ spokeHubId: member.hubId, spokeId: member.spoke.id });
    }
  });

  it("keeps the REPEATED local id `docs` two INDEPENDENT Spokes, in every observable fact", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    const oneDocs = runtimeContextForRequestHost("hub-one-docs.localhost");
    const twoDocs = runtimeContextForRequestHost("hub-two-docs.localhost");

    expect(oneDocs?.id).toBe("docs");
    expect(twoDocs?.id).toBe("docs");
    // SAME LOCAL ID, DIFFERENT SPOKE — the four facts that must differ:
    expect(oneDocs?.spokeHubId).toBe("one");
    expect(twoDocs?.spokeHubId).toBe("two");
    expect(oneDocs?.runtimeSegment).toBe("hub+one+docs");
    expect(twoDocs?.runtimeSegment).toBe("hub+two+docs");
    expect(oneDocs?.siteConfig.name).toBe("Hub One Docs Site");
    expect(twoDocs?.siteConfig.name).toBe("Hub Two Docs Site");

    // Their CONFIGURATIONS, page sources, dictionaries and artwork namespaces are separate:
    expect(oneDocs?.siteConfig.url).not.toBe(twoDocs?.siteConfig.url);
    expect(oneDocs?.resources.spokeRoot).not.toBe(twoDocs?.resources.spokeRoot);
    expect(oneDocs?.resources.dictionaryRoot).not.toBe(twoDocs?.resources.dictionaryRoot);
    expect(oneDocs?.resources.markdownPagesRoot).not.toBe(twoDocs?.resources.markdownPagesRoot);
    expect(oneDocs?.runtimeAssetNamespaces.map((namespace) => namespace.urlBase)).toEqual([
      "/assets",
      "/spokes/hub+one+docs/assets",
    ]);
    expect(twoDocs?.runtimeAssetNamespaces.map((namespace) => namespace.urlBase)).toEqual([
      "/assets",
      "/spokes/hub+two+docs/assets",
    ]);
    // The DICTIONARIES and the PAGE SOURCES are their own too — read through the accepted authority for each
    // (`loadSpokeDictionaryRegistry`), so "each renders only its own wording and content" is measured rather
    // than assumed.
    const oneDictionary = loadSpokeDictionaryRegistry(oneDocs!.resources, oneDocs!.siteConfig).get("en");
    const twoDictionary = loadSpokeDictionaryRegistry(twoDocs!.resources, twoDocs!.siteConfig).get("en");
    expect(oneDictionary.navigation.items["/about"]).toBe("One Docs About");
    expect(twoDictionary.navigation.items["/about"]).toBe("Two Docs About");
    expect(
      readFileSync(path.join(oneDocs!.resources.markdownPagesRoot, "ww", "en", "about.md"), "utf8"),
    ).toContain("Hub One's docs Spoke wrote this paragraph.");
    expect(
      readFileSync(path.join(twoDocs!.resources.markdownPagesRoot, "ww", "en", "about.md"), "utf8"),
    ).toContain("Hub Two's docs Spoke wrote the third paragraph.");
    // The route only ONE of them authors is absent from the other's tree, so their inventories differ too.
    expect(existsSync(path.join(oneDocs!.resources.markdownPagesRoot, "ww", "en", "two-docs-only.md"))).toBe(
      false,
    );
  });

  it("answers a bare local id with NOTHING, and never with whichever Hub came first", async () => {
    const { runtimeContextForSegment, installationRuntimeIndexForBuild } = await import(
      "@/config/spoke-request"
    );
    const { runtimeContextForIdentifiedSpoke } = await import("@/config/installation-runtime");

    // A local id is NOT an address in this form: `docs` names a Spoke in either Hub.
    expect(runtimeContextForSegment("docs")).toBeNull();
    expect(runtimeContextForSegment("one")).toBeNull();

    // …and the composite reference is the ONE way to name either of them.
    const index = installationRuntimeIndexForBuild();
    expect(runtimeContextForIdentifiedSpoke(index, { spokeHubId: "two", spokeId: "docs" })?.id).toBe(
      "docs",
    );
    expect(
      runtimeContextForIdentifiedSpoke(index, { spokeHubId: "two", spokeId: "docs" })?.spokeHubId,
    ).toBe("two");
    // An undeclared Hub, or an undeclared id inside a declared Hub, answers NOTHING.
    expect(runtimeContextForIdentifiedSpoke(index, { spokeHubId: "three", spokeId: "docs" })).toBeNull();
    expect(runtimeContextForIdentifiedSpoke(index, { spokeHubId: "one", spokeId: "absent" })).toBeNull();
  });

  it("resolves an inspection hostname to the COMPOSITE nomination — the second Hub's Spoke", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    const inspected = runtimeContextForRequestHost("inspect.localhost");
    expect(inspected?.id).toBe("docs");
    expect(inspected?.spokeHubId).toBe("two");
    expect(inspected?.runtimeSegment).toBe("hub+two+docs");
  });

  it("answers an UNCLAIMED host with NOTHING — never another Hub's Spoke", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    expect(runtimeContextForRequestHost("unknown.localhost")).toBeNull();
    expect(runtimeContextForRequestHost("localhost:3000")).toBeNull();
    expect(runtimeContextForRequestHost(null)).toBeNull();
    // A hostname that merely LOOKS adjacent to a claim is not a claim: recognition is exact.
    expect(runtimeContextForRequestHost("sub.hub-one-docs.localhost")).toBeNull();
    expect(runtimeContextForRequestHost("hub-one-docs.localhost.evil.test")).toBeNull();
  });
});

// ── ARTWORK: EVERY MEMBER MIRRORS INTO ITS OWN NAMESPACE, AND NOTHING CROSSES ─────────────────────────────

describe("the asset plan of the same Installation", () => {
  const built = twoHubInstallation();

  it("gives every member its OWN namespace, keyed by the COMPOSITE segment", () => {
    const namespaces = runtimeNamespaces(built.root);

    expect(namespaces.map((namespace) => namespace.key)).toEqual([
      "platform",
      "spoke:hub+one+docs",
      "spoke:hub+one+news",
      "spoke:hub+two+docs",
    ]);
    // The two Spokes called `docs` occupy two DIRECTORIES — the isolation is structural, not conventional.
    const directories = namespaces.map((namespace) => namespace.directory);
    expect(new Set(directories).size).toBe(directories.length);
    expect(namespaces[1].urlBase).toBe("/spokes/hub+one+docs/assets");
    expect(namespaces[3].urlBase).toBe("/spokes/hub+two+docs/assets");
  });

  it("installs each member's own artwork into ITS namespace, and never into another's", () => {
    const rows = buildPlan(built.root);

    for (const member of MEMBERS) {
      const own = rows.filter((row) => row.namespace === `spoke:${segmentOf(member.hubId, member.spoke.id)}`);

      // Its replaceable ROLE artwork, and its own brand mark — both in its own namespace.
      expect(own.some((row) => row.to === "favicon.svg")).toBe(true);
      expect(own.some((row) => row.to === memberFile(member.spoke))).toBe(true);
      // …and every row of that namespace reads from THIS member's own authored tree.
      expect(own.every((row) => row.from.startsWith(`${member.spoke.directory}/`))).toBe(true);
    }

    // The platform namespace stays SHARED and unshadowable: no member's own mark lands there.
    const platform = rows.filter((row) => row.namespace === "platform");
    expect(platform.length).toBeGreaterThan(0);
    expect(
      platform.every((row) => !MEMBERS.some((member) => row.to === memberFile(member.spoke))),
    ).toBe(true);
  });
});
// ── COLLISIONS: WHAT IS STILL REFUSED, AND WHAT IS NOT ───────────────────────────────────────────────────

describe("collisions across Hubs", () => {
  it("refuses ONE exact hostname claimed in TWO Hubs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "foundation-m3p3-collide-host-"));
    trees.push(root);
    // The SAME hostname in both Hubs: a request carries one host, so it must select exactly one Spoke in
    // exactly one Hub across the whole Installation.
    for (const member of MEMBERS) {
      authorMember(root, segmentOf(member.hubId, member.spoke.id), {
        ...member.spoke,
        hostname: "shared.localhost",
      });
    }
    write(
      path.join(root, "spokes.json"),
      `${JSON.stringify(
        {
          spokeHubs: HUBS.map((hub) => ({
            id: hub.id,
            spokes: hub.spokes.map((spoke) => ({ id: spoke.id, root: spoke.directory })),
          })),
        },
        null,
        2,
      )}\n`,
    );

    expect(() => installationRuntimeIndex(root)).toThrow(/claimed in more than one Spoke Hub/);
  });

  it("refuses TWO Hubs that share ONE physical Spoke root", () => {
    const root = mkdtempSync(path.join(tmpdir(), "foundation-m3p3-collide-root-"));
    trees.push(root);
    authorMember(root, segmentOf("one", "docs"), HUBS[0].spokes[0]);
    write(
      path.join(root, "spokes.json"),
      `${JSON.stringify(
        {
          spokeHubs: [
            { id: "one", spokes: [{ id: "docs", root: "spokes/hub-one-docs" }] },
            { id: "two", spokes: [{ id: "docs", root: "spokes/hub-one-docs" }] },
          ],
        },
        null,
        2,
      )}\n`,
    );

    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/two Spokes cannot share one authored root/);
  });

  it("ACCEPTS the same local id in two Hubs — the fixture's own shape is not a collision", () => {
    const built = twoHubInstallation();
    const roots = resolveInstallationSpokeRoots(built.root);

    expect(roots.mode).toBe("hubs");
    expect(roots.hubs.map((hub) => hub.id)).toEqual(["one", "two"]);
    expect(roots.descriptors.map((descriptor) => descriptor.id)).toEqual(["docs", "news", "docs"]);
    expect(roots.descriptors.map((descriptor) => descriptor.spokeHubId)).toEqual(["one", "one", "two"]);
  });
});

// ── §6 — AN IDENTIFIED INSTALLATION OF ONE HUB AND ONE SPOKE IS STILL FAIL-CLOSED ────────────────────────

describe("an identified Installation with exactly ONE Hub and ONE Spoke", () => {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-m3p3-one-identified-"));
  trees.push(root);
  authorMember(root, segmentOf("solo", "docs"), {
    ...HUBS[0].spokes[0],
    directory: "spokes/solo-docs",
    hostname: "solo-docs.localhost",
  });
  write(
    path.join(root, "spokes.json"),
    `${JSON.stringify(
      { spokeHubs: [{ id: "solo", spokes: [{ id: "docs", root: "spokes/solo-docs" }] }] },
      null,
      2,
    )}\n`,
  );
  const routing = hostRoutingForInstallation(root);

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("FOUNDATION_DEPLOYMENT_ROOT", root);
    vi.stubEnv("FOUNDATION_DEPLOYMENT_MODE", "hubs");
    vi.stubEnv("FOUNDATION_DEPLOYMENT_HOST_ROUTING", JSON.stringify(routing));
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("dispatches by EXACT hostname — never the permissive one-Spoke rule (§6)", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    // ITS OWN hostname answers …
    const own = runtimeContextForRequestHost("solo-docs.localhost");
    expect(own?.id).toBe("docs");
    expect(own?.spokeHubId).toBe("solo");
    expect(own?.runtimeSegment).toBe("hub+solo+docs");

    // …and NOTHING ELSE does, even though this Installation declares exactly ONE Spoke. A LEGACY/FLAT
    // one-Spoke Installation answers every host; an IDENTIFIED one never does.
    for (const host of ["unknown.localhost", "localhost:3000", "www.example.com", null]) {
      expect(runtimeContextForRequestHost(host), String(host)).toBeNull();
    }
  });

  it("is NOT a deployment the build compatibility seam activates a Spoke for", async () => {
    const { currentBuildRuntimeContext } = await import("@/config/installation-runtime");

    expect(() => currentBuildRuntimeContext()).toThrow(/IDENTIFIED SPOKE HUBS/);
  });
});


describe("an Installation authored with TWO identified Spoke Hubs", () => {
  const routing = hostRoutingForInstallation(twoHubInstallation().root);

  it("produces a description whose every entry is COMPOSITE, in identified mode", () => {
    expect(routing.mode).toBe("identified");
    expect(routing.spokes.map((spoke) => [spoke.spokeHubId, spoke.id])).toEqual([
      ["one", "docs"],
      ["one", "news"],
      ["two", "docs"],
    ]);
    // ONE IDENTITY PER ENTRY, derived from BOTH halves — so Hub two's `docs` and Hub one's `docs` are two.
    expect(routing.spokes.map((spoke) => spoke.segment)).toEqual([
      "hub+one+docs",
      "hub+one+news",
      "hub+two+docs",
    ]);
    expect(new Set(routing.spokes.map((spoke) => spoke.segment)).size).toBe(3);
  });

  it("carries the COMPOSITE inspection nomination, and only its own Hub's switcher per Hub", () => {
    expect(routing.inspection?.spokeHubId).toBe("two");
    expect(routing.inspection?.spokeId).toBe("docs");
    expect(routing.inspection?.hostnames).toContain("inspect.localhost");
    // NO Installation-wide switcher exists in this form: the lists are per Hub.
    expect(routing.spokeSwitcher).toBeNull();
    expect(routing.spokeHubSwitchers?.map((hub) => hub.spokeHubId)).toEqual(["one"]);
    expect(routing.spokeHubSwitchers?.[0].options.map((option) => option.spokeId)).toEqual([
      "docs",
      "news",
    ]);
  });
});
