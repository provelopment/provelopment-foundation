import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE RUNTIME-CUT EFS SUBJECT IS A REAL DECLARATION (`C07`)
 * ========================================================
 *
 * Before any legacy request path is retired, the replacement subject must be proved on its own terms:
 * the fixture declares an Entity → Facet → Sites → Pages chain, an owned capsule, an explicit Spoke in
 * an Installation and binding hosts with a prefix. A request either resolves inside those claims or it
 * is refused — existence on disk is never a publication claim, and an unclaimed host is never served.
 */

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => state.headers.get(key) ?? null }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (pathname: string) => {
    throw new Error(`REDIRECT:${pathname}`);
  },
  permanentRedirect: (pathname: string) => {
    throw new Error(`PERMANENT_REDIRECT:${pathname}`);
  },
}));

import {
  materializeRuntimeCutFixture,
  materializeRuntimeCutInstallation,
  RUNTIME_CUT_HOST,
  RUNTIME_CUT_UNCLAIMED_HOST,
  selectRuntimeCutFixture,
} from "../support/efs-runtime-cut";
import { selectEfsInstallation } from "../support/efs-installation";

const installation = materializeRuntimeCutInstallation();
selectEfsInstallation(installation.root);

const fixture = materializeRuntimeCutFixture();
const restoreDeclaration = selectRuntimeCutFixture(fixture);

vi.resetModules();
const { efsViewForCurrentRequest } = await import("@/app/[[...segments]]/efs-request");

afterAll(() => {
  restoreDeclaration();
  fixture.cleanup();
  installation.cleanup();
});

function request(host: string, pathname: string) {
  state.headers.set("host", host);
  return efsViewForCurrentRequest(pathname.split("/").filter(Boolean));
}

describe("the runtime-cut EFS fixture is a validated, published subject", () => {
  beforeEach(() => state.headers.clear());

  it("resolves a declared Page through the dedicated-root binding", async () => {
    const view = await request(RUNTIME_CUT_HOST, "/en-001/about");
    expect(view).not.toBeNull();
    expect(view?.entity.id).toBe("e_00000000000000000000000001");
    expect(view?.facet.id).toBe("runtime");
    expect(view?.site.id).toBe("main");
    expect(view?.page.id).toBe("about");
    expect(view?.locale).toBe("en-001");
    expect(view?.canonical).toBe(`https://${RUNTIME_CUT_HOST}/en-001/about`);
    expect(view?.source.format).toBe("markdown");
  });

  it("resolves the same Page under the declared single prefix on its own host", async () => {
    const view = await request("managed.runtime-cut.test", "/managed/en-001/about");
    expect(view?.page.id).toBe("about");
    expect(view?.canonical).toBe("https://managed.runtime-cut.test/managed/en-001/about");
  });

  it("resolves a declared multi-segment prefix on its own host", async () => {
    const view = await request("deep.runtime-cut.test", "/managed/deep/en-001/about");
    expect(view?.page.id).toBe("about");
    expect(view?.canonical).toBe("https://deep.runtime-cut.test/managed/deep/en-001/about");
  });

  it("keeps a declared unlisted representation out of navigation", async () => {
    const view = await request(RUNTIME_CUT_HOST, "/en-001/preview");
    expect(view?.page.id).toBe("preview");
    expect(view?.visibility).toBe("unlisted");
    expect(view?.navigation.some((item) => item.pageId === "preview")).toBe(false);
  });

  it("prefers the JSON representation over the Markdown file beside it", async () => {
    const view = await request(RUNTIME_CUT_HOST, "/en-001/catalogue");
    expect(view?.source.format).toBe("json");
    expect(JSON.stringify(view?.source.document ?? view?.source.data)).toContain("JSON WINS");
  });

  it("falls back within the SAME Page when a declared locale has no representation", async () => {
    // A declared locale with no authored representation redirects to the SAME Page's own fallback
    // representation — never to another Site, another locale's Site or a legacy lookup.
    await expect(request(RUNTIME_CUT_HOST, "/de-de/about")).rejects.toThrow(
      "REDIRECT:/en-001/about/",
    );
    const fallback = await request(RUNTIME_CUT_HOST, "/en-001/about/");
    expect(fallback?.page.id).toBe("about");
    expect(fallback?.site.id).toBe("main");
    expect(fallback?.entity.id).toBe("e_00000000000000000000000001");
  });

  it("selects a declared second Site explicitly, never from the host", async () => {
    const view = await request("open.runtime-cut.test", "/outlet/en-001/");
    expect(view?.site.id).toBe("outlet");
    expect(view?.page.id).toBe("home");
    expect(view?.canonical).toBe("https://open.runtime-cut.test/outlet/en-001");
  });

  it("refuses an undeclared source that merely exists in the capsule", async () => {
    await expect(request(RUNTIME_CUT_HOST, "/en-001/notes")).rejects.toThrow("NOT_FOUND");
  });

  it("refuses a host no binding claims", async () => {
    await expect(request(RUNTIME_CUT_UNCLAIMED_HOST, "/en-001/about")).rejects.toThrow("NOT_FOUND");
  });

  it("refuses an undeclared Page inside a claimed host", async () => {
    await expect(request(RUNTIME_CUT_HOST, "/en-001/undeclared-page")).rejects.toThrow("NOT_FOUND");
  });

  it("refuses a locale the binding does not declare", async () => {
    await expect(request(RUNTIME_CUT_HOST, "/fr-fr/about")).rejects.toThrow("NOT_FOUND");
  });
});
