import { afterAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ headers: state.headers, get: (key: string) => state.headers.get(key) ?? null }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { installationRuntimeIndex } from "@/config/installation-runtime";
import { runtimeContextForRequestHost } from "@/config/spoke-request";

import { selectEfsInstallation } from "../support/efs-installation";
import {
  SHARED_HOST,
  SHARED_HOST_MEMBERS,
  materializeSharedHostInstallation,
} from "../support/shared-host-installation.mjs";

/**
 * ONE HOSTNAME, FIVE PUBLISHING SPOKES, TWO IDENTIFIED SPOKE HUBS (FOUNDATION-EFS-SHARED-HOST-REMEDIATION-A1)
 * ==========================================================================================================
 *
 * The accepted contract (`D31`) says a public request resolves from `host + pathname + explicit validated
 * binding`, and that a binding declares its own host/path claim and selects its own Entity/Facet/Site and
 * owning publication. A hostname is therefore NOT an exclusive Spoke property: it can carry several
 * prefix-scoped publication claims belonging to several Spokes.
 *
 * This suite proves that contract end to end on the ONE hostname `shared.example.test`, where two Spoke Hubs
 * publish five Entities at five disjoint prefixes, and proves the fail-closed negatives that must survive the
 * correction (an unknown prefix, a near-miss prefix, a foreign owner's asset, an exclusive host claimed by
 * another Spoke, and the absent root entry).
 */
const installation = materializeSharedHostInstallation();
selectEfsInstallation(installation.root);
process.env.FOUNDATION_EFS_MANIFEST = installation.efsManifestFile;
process.env.FOUNDATION_EFS_CAPSULE = installation.capsule;
vi.resetModules();

const efs = await import("@/app/[[...segments]]/efs-request");
const page = await import("@/app/[[...segments]]/page");
const sitemap = (await import("@/app/sitemap")).default;
const robots = (await import("@/app/robots")).default;
const { serveOwnerAsset } = await import("@/app/efs-asset-response");

afterAll(() => installation.cleanup());

function at(host: string): void {
  state.headers.set("host", host);
}

/** The publication path of one member's `about` page. */
function aboutSegments(prefix: string): string[] {
  return [prefix, "en-001", "about"];
}

describe("one hostname serving several prefix-scoped publications (D31)", () => {
  it("composes five Spokes across two identified Spoke Hubs that share one public hostname", () => {
    expect(() => installationRuntimeIndex(installation.root)).not.toThrow();

    const index = installationRuntimeIndex(installation.root);
    expect(index.mode).toBe("hubs");
    expect(index.spokes).toHaveLength(SHARED_HOST_MEMBERS.length);
    // Composite identity: two Hubs, no local id ambiguity, five distinct runtime contexts.
    expect(new Set(index.spokes.map((spoke) => spoke.runtimeSegment)).size).toBe(
      SHARED_HOST_MEMBERS.length,
    );
  });

  it.each(SHARED_HOST_MEMBERS)(
    "resolves $spokeHubId/$spokeId at /$prefix to its own Entity",
    async (member) => {
      at(SHARED_HOST);
      const view = await efs.efsViewForCurrentRequest(aboutSegments(member.prefix));
      expect(view).not.toBeNull();
      expect(view?.publication.spokeId).toBe(member.spokeId);
      expect(view?.publication.spokeHubId).toBe(member.spokeHubId);
      expect(view?.context.id).toBe(member.spokeId);
      expect(view?.context.spokeHubId).toBe(member.spokeHubId);
      expect(view?.entity.id).toBe(member.entityId);
      expect(view?.binding.prefix).toEqual([member.prefix]);
      expect(view?.canonical).toBe(`https://${SHARED_HOST}/${member.prefix}/en-001/about`);
    },
  );

  it("serves each member its own content, never a neighbour's", async () => {
    at(SHARED_HOST);
    for (const member of SHARED_HOST_MEMBERS) {
      const view = await efs.efsViewForCurrentRequest(aboutSegments(member.prefix));
      expect(view?.source.body ?? "").toContain(member.marker);
      const metadata = await page.generateMetadata({
        params: Promise.resolve({ segments: aboutSegments(member.prefix) }),
      });
      expect(String(metadata.alternates?.canonical)).toBe(
        `https://${SHARED_HOST}/${member.prefix}/en-001/about`,
      );
    }
  });

  it("answers each member's owner asset from its own capsule tree", async () => {
    at(SHARED_HOST);
    for (const member of SHARED_HOST_MEMBERS) {
      const response = await serveOwnerAsset([member.prefix], ["brand", "logo.svg"]);
      expect(response.status, member.prefix).toBe(200);
      expect(await response.text()).toContain(member.marker);
    }
  });

  it("publishes ONE sitemap and ONE robots origin for the shared host, covering every prefix", async () => {
    at(SHARED_HOST);
    const entries = await sitemap();
    for (const member of SHARED_HOST_MEMBERS) {
      expect(
        entries.some((entry) => String(entry.url).includes(`/${member.prefix}/en-001/`)),
        member.prefix,
      ).toBe(true);
    }
    expect((await robots()).sitemap).toBe(`https://${SHARED_HOST}/sitemap.xml`);
  });
});

describe("the shared host names NO owner — the binding does (D31)", () => {
  it("selects nothing by hostname on a host several Spokes publish on", () => {
    // Hostname dispatch is not the authority here, and it must say so rather than hand the host to whichever
    // Spoke the manifest declared first.
    expect(runtimeContextForRequestHost(SHARED_HOST)).toBeNull();
  });

  it("refuses a near-miss prefix — /alphax is not /alpha", async () => {
    at(SHARED_HOST);
    await expect(efs.efsViewForCurrentRequest(["alphax", "en-001", "about"])).rejects.toThrow("NOT_FOUND");
    expect(await serveOwnerAsset(["alphax"], ["brand", "logo.svg"])).toHaveProperty("status", 404);
  });

  it("refuses an unknown prefix and an unknown host", async () => {
    at(SHARED_HOST);
    await expect(efs.efsViewForCurrentRequest(["unknown", "en-001", "about"])).rejects.toThrow(
      "NOT_FOUND",
    );
    at("not-this-host.example.test");
    await expect(efs.efsViewForCurrentRequest(aboutSegments("ww"))).rejects.toThrow("NOT_FOUND");
    // A host no publication claims advertises no sitemap and no sitemap origin.
    expect(await sitemap()).toEqual([]);
    expect((await robots()).sitemap).toBeUndefined();
  });

  it("refuses a foreign owner's asset, and any prefix escape from an owner's tree", async () => {
    at(SHARED_HOST);
    // The path names ONE publication; a file that publication does not own is not reachable through it.
    expect(await serveOwnerAsset(["alpha"], ["brand", "logo.svg"])).toHaveProperty("status", 200);
    expect(await serveOwnerAsset(["alpha"], ["..", "beta", "brand", "logo.svg"])).toHaveProperty(
      "status",
      404,
    );
    expect(await serveOwnerAsset(["alpha"], ["brand", "absent.svg"])).toHaveProperty("status", 404);
  });

  it("does NOT invent a homepage for a host whose publications are all prefix-scoped", async () => {
    // THE ROOT-ENTRY GATE. With five prefix-scoped bindings and no dedicated-root binding, `GET /` names no
    // publication, and choosing "whichever one comes first" would be a fabricated homepage. The accepted
    // behaviour is therefore a refusal; a deterministic root entry needs an explicit, authored policy.
    at(SHARED_HOST);
    await expect(efs.efsViewForCurrentRequest([])).rejects.toThrow("NOT_FOUND");
  });
});
