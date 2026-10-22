import { NextRequest, NextResponse } from "next/server";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SPOKE_SELECTION_HEADER } from "@/config/spoke-selection";
import { EFS_REQUEST_PATH_HEADER } from "@/config/efs/request-path";
import { normalizeHostname } from "@/core/spoke";

/**
 * HOSTNAME DISPATCH, PROVED AGAINST THE ACCEPTED AUTHORITIES (FOUNDATION-MULTISITE-M16/M17)
 * =======================================================================================
 *
 * The build inlines ONE routing description; the request boundary turns it into a decision. These tests drive
 * that description and the boundary itself with a SYNTHETIC two-Spoke table, so the semantics the milestone
 * requires are provable without a browser:
 *
 *   claimed host                    → that Spoke's runtime segment, declared on a PRIVATE upstream header
 *   differently-cased / ported host → the SAME claim (the domain's normalization, reused)
 *   unclaimed host                  → NOTHING (fail closed, no default, no redirect)
 *   subdomain of a claimed host     → NOTHING (exact claims only — no wildcard, no suffix rule)
 *   a SPOOFED selection header      → OVERWRITTEN by the boundary's own decision (a client cannot choose)
 *   a Spoke with no canonical origin → refused LOUDLY in a multi-Spoke Installation
 *
 * M17 — WHAT THE BOUNDARY MUST NOT DO. It no longer encodes the Spoke into the pathname: the public path IS
 * the page identity, so a soft client navigation can commit. Every case below therefore asserts BOTH that the
 * right Spoke was selected AND that the boundary produced no rewrite at all.
 *
 * The normalization itself is NEVER re-implemented here: the expectations are built with `normalizeHostname`
 * and the claim derivation is the domain's `hostnameFromOrigin`.
 */
const ENV = "FOUNDATION_DEPLOYMENT_HOST_ROUTING";

const TABLE = {
  mode: "multi",
  spokes: [
    { id: "alpha", segment: "alpha", canonicalOrigin: "https://alpha.localhost" },
    { id: "beta", segment: "beta", canonicalOrigin: "https://beta.example.com" },
  ],
};

/** A FRESH module graph per case: the routing table is a per-build value, cached by design. */
async function withTable(table: unknown) {
  vi.resetModules();
  if (table === undefined) delete process.env[ENV];
  else process.env[ENV] = typeof table === "string" ? table : JSON.stringify(table);
  const routing = await import("@/config/spoke-routing");
  const proxy = await import("@/proxy");
  return { ...routing, proxy: proxy.proxy };
}

const request = (pathname: string, host: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://${host}${pathname}`, { headers: { host, ...headers } });

/**
 * The Spoke the boundary selected, as the App Router tree sees it: Next carries request-header overrides as
 * `x-middleware-request-<name>` next to the `x-middleware-override-headers` list.
 */
const selectedFor = (response: NextResponse): string | null =>
  response.headers.get(`x-middleware-request-${SPOKE_SELECTION_HEADER}`);

/** The trusted request pathname the edge boundary stamps upstream for the Server Action. */
const stampedPathFor = (response: NextResponse): string | null =>
  response.headers.get(`x-middleware-request-${EFS_REQUEST_PATH_HEADER}`);

/** The pathname the boundary rewrote the request to — which must now ALWAYS be `null`. */
const rewrittenTo = (response: NextResponse): string | null => {
  const target = response.headers.get("x-middleware-rewrite");
  return target === null ? null : new URL(target).pathname;
};

const savedEnv = process.env[ENV];

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV];
  else process.env[ENV] = savedEnv;
  vi.resetModules();
});

describe("a claimed hostname selects exactly one Spoke", () => {
  it("declares that Spoke's runtime segment upstream, and rewrites nothing", async () => {
    const { proxy } = await withTable(TABLE);

    const alpha = proxy(request("/ww/en/about", "alpha.localhost"));
    expect(selectedFor(alpha)).toBe("alpha");
    expect(stampedPathFor(alpha)).toBe("/ww/en/about");
    expect(rewrittenTo(alpha)).toBeNull();

    const beta = proxy(request("/ww/en/about", "beta.example.com"));
    expect(selectedFor(beta)).toBe("beta");
    // The SAME public pathname, a DIFFERENT Spoke: the selection is the only difference.
    expect(selectedFor(alpha)).not.toBe(selectedFor(beta));
    // …and nothing is redirected either: the visitor keeps the URL they asked for.
    expect(alpha.headers.get("location")).toBeNull();
  });

  it("resolves the bare root of a claimed host too", async () => {
    const { proxy } = await withTable(TABLE);
    expect(selectedFor(proxy(request("/", "beta.example.com")))).toBe("beta");
  });

  it("normalizes case and port through the DOMAIN's own rule, never a second one", async () => {
    const { proxy } = await withTable(TABLE);
    for (const host of ["Alpha.LocalHost", "alpha.localhost:3000", "ALPHA.LOCALHOST:8443"]) {
      const response = proxy(request("/ww/en", host));
      expect(selectedFor(response), host).toBe("alpha");
      expect(response.status, host).toBe(200);
    }
    expect(normalizeHostname("ALPHA.LOCALHOST:8443")).toBe("alpha.localhost");
  });
});

describe("an unclaimed hostname answers nothing at all", () => {
  it("refuses rather than choosing a default or first Spoke", async () => {
    const { proxy } = await withTable(TABLE);
    for (const host of ["unknown.localhost", "localhost", "gamma.example.com", ""]) {
      const response = proxy(request("/ww/en/about", host));
      // The boundary no longer holds configuration: it forwards without a selection, and the
      // App Router request context refuses an unclaimed host with 404.
      expect(response.status, host).toBe(200);
      expect(response.headers.get("location"), host).toBeNull();
      expect(selectedFor(response), host).toBeNull();
      expect(rewrittenTo(response), host).toBeNull();
    }
  });

  it("refuses a SUBDOMAIN of a claimed host (exact claims only, no wildcard)", async () => {
    const { proxy } = await withTable(TABLE);
    for (const host of ["sub.alpha.localhost", "alpha.localhost.attacker.test", "alpha.localhostX"]) {
      const response = proxy(request("/ww/en/about", host));
      expect(response.status, host).toBe(200);
      expect(selectedFor(response), host).toBeNull();
    }
  });

  it("refuses an absent Host header entirely", async () => {
    const { hostRoutingForBuild, spokeSelectionForHost } = await withTable(TABLE);
    expect(spokeSelectionForHost(hostRoutingForBuild(), null)).toBeNull();
    expect(spokeSelectionForHost(hostRoutingForBuild(), "")).toBeNull();
    expect(spokeSelectionForHost(hostRoutingForBuild(), "   ")).toBeNull();
  });
});

describe("a client can never select its own Spoke", () => {
  it("OVERWRITES a spoofed selection header with the host's own answer", async () => {
    const { proxy } = await withTable(TABLE);

    // Alpha's host, but the request claims Beta and forges the EFS path.
    const spoofedOnClaimedHost = proxy(
      request("/ww/en/about", "alpha.localhost", {
        [SPOKE_SELECTION_HEADER]: "beta",
        [EFS_REQUEST_PATH_HEADER]: "/beta/forged",
      }),
    );
    expect(selectedFor(spoofedOnClaimedHost)).toBe("alpha");
    expect(stampedPathFor(spoofedOnClaimedHost)).toBe("/ww/en/about");

    // An UNCLAIMED host stays refused NO MATTER what it claims: the header cannot create a claim.
    const spoofedOnUnknownHost = proxy(
      request("/ww/en/about", "unknown.localhost", { [SPOKE_SELECTION_HEADER]: "alpha" }),
    );
    expect(spoofedOnUnknownHost.status).toBe(200);
    expect(selectedFor(spoofedOnUnknownHost)).toBeNull();
    expect(stampedPathFor(spoofedOnUnknownHost)).toBe("/ww/en/about");
  });

  it("does not send the selection or trusted path to the client", async () => {
    const { proxy } = await withTable(TABLE);
    const response = proxy(request("/ww/en", "alpha.localhost"));
    expect(response.headers.get(SPOKE_SELECTION_HEADER)).toBeNull();
    expect(response.headers.get(EFS_REQUEST_PATH_HEADER)).toBeNull();
  });
});

describe("the retired internal namespace and Spoke assets belong to the boundary", () => {
  it("refuses a DIRECT internal request on a valid host", async () => {
    const { proxy } = await withTable(TABLE);
    for (const pathname of ["/~spoke", "/~spoke/alpha", "/~spoke/alpha/ww/en/about", "/~spoke/beta/ww/en"]) {
      const response = proxy(request(pathname, "alpha.localhost"));
      expect(response.status, pathname).toBe(404);
      expect(rewrittenTo(response), pathname).toBeNull();
      expect(selectedFor(response), pathname).toBeNull();
    }
  });

  it("serves a Spoke's own artwork only on a host that Spoke answers for", async () => {
    const { proxy } = await withTable(TABLE);
    expect(proxy(request("/spokes/alpha/assets/sidebar-open.svg", "alpha.localhost")).status).toBe(200);
    expect(proxy(request("/spokes/beta/assets/sidebar-open.svg", "beta.example.com")).status).toBe(200);
    expect(proxy(request("/spokes/beta/assets/sidebar-open.svg", "alpha.localhost")).status).toBe(404);
    expect(proxy(request("/spokes/alpha/assets/sidebar-open.svg", "beta.example.com")).status).toBe(404);
  });
});

describe("the routing description itself is refused when it cannot route", () => {
  it("refuses a malformed description loudly", async () => {
    const { hostRoutingForBuild } = await withTable("{not json");
    expect(() => hostRoutingForBuild()).toThrow(/not valid JSON/);
  });

  it("refuses a multi-Spoke Spoke that declares no canonical origin, naming it", async () => {
    const { hostRoutingForBuild } = await withTable({
      mode: "multi",
      spokes: [
        { id: "alpha", segment: "alpha", canonicalOrigin: "https://alpha.localhost" },
        { id: "beta", segment: "beta", canonicalOrigin: "" },
      ],
    });
    expect(() => hostRoutingForBuild()).toThrow(/Spoke "beta" declares no canonical origin/);
  });

  it("tolerates a Spoke with no canonical origin in a ONE-Spoke Installation (a hostname is never consulted)", async () => {
    const { proxy } = await withTable({
      mode: "single",
      spokes: [{ id: "only", segment: "only", canonicalOrigin: "" }],
    });
    // ANY host answers, and the only entry is the Installation's sole Spoke — never a "first".
    const response = proxy(request("/ww/en", "whatever.localhost"));
    expect(response.status).toBe(200);
    expect(selectedFor(response)).toBe("only");
    expect(rewrittenTo(response)).toBeNull();
  });

  it("answers nothing when no routing description was inlined at all", async () => {
    const { proxy, hostRoutingForBuild } = await withTable(undefined);
    expect(hostRoutingForBuild().spokes).toHaveLength(0);
    expect(proxy(request("/ww/en", "alpha.localhost")).status).toBe(200);
  });
});
