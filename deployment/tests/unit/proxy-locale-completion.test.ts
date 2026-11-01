import { describe, expect, it } from "vitest";

// DEPLOYMENT SCOPE — this test asserts THIS deployment's own configuration, content and assets, so
// it lives in the deployment capsule (`deployment/tests/**`, FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in
// the `deployment` Vitest project, whose setup selects the REAL installed deployment
// (`tests/setup/real-deployment.ts`, ISO-H2). Its subject is the real capsule, never a fixture.
import { join } from "node:path";

import { NextRequest } from "next/server";

import { loadEfsManifest } from "@/config/efs/manifest";
import { SPOKE_SELECTION_HEADER } from "@/config/spoke-selection";
import {
  canonicalUrl,
  contentSegments,
  entryRedirectPath,
  matchBinding,
  parseContentRoute,
  type EfsBinding,
} from "@/core/efs/publication";
import { foundationConfig as siteConfig } from "../support/spoke-contexts";
import { proxy } from "@/proxy";

/**
 * R04-C13 §3 — the authority for language and route completion is the EFS PUBLICATION, not the retired
 * geographic completer. `completePublicPath` and the legacy Page resolver answer for a Site-and-country
 * deployment that no longer exists here; asking them to define migrated behavior would be asking the
 * reference to pretend to be geographic. These helpers read the deployment's REAL manifest instead, so
 * every expectation below is measured against the binding this host actually declares.
 */
const DEPLOYMENT_MANIFEST = join(process.cwd(), "deployment", "efs", "manifest.json");
const BINDINGS: EfsBinding[] = loadEfsManifest(DEPLOYMENT_MANIFEST).manifest!.publications.flatMap(
  (publication) => publication.bindings,
);
const FOUNDATION_HOST = "foundation-template.provelopment.com";
const GERMANY_HOST = "foundation-template-germany.provelopment.com";
const foundationWeb = BINDINGS.find((binding) => binding.id === "foundation-web")!;
const germanyWeb = BINDINGS.find((binding) => binding.id === "germany-web")!;

/** The binding a host selects and the route its remaining segments parse to, or `null` when unclaimed. */
function resolve(host: string, path: string) {
  const matched = matchBinding(host, path, BINDINGS);
  if (matched === null) return null;
  return { matched, parsed: parseContentRoute(matched.binding, matched.remaining) };
}

/**
 * The Spoke the boundary selected for a public path, as the App Router tree reads it.
 *
 * M17 — the boundary no longer encodes the Spoke into the pathname: it passes the request through with the
 * selection on a private upstream header, so a client-side transition can commit against the public route.
 */
function selectionFor(path: string, host = "foundation-template.provelopment.com"): string | null {
  const response = proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));
  return response.headers.get(`x-middleware-request-${SPOKE_SELECTION_HEADER}`);
}

/** The pathname the boundary rewrote the request to — which must now ALWAYS be `null` (M17). */
function rewriteFor(path: string, host = "foundation-template.provelopment.com"): string | null {
  const response = proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));
  const rewritten = response.headers.get("x-middleware-rewrite");
  return rewritten === null ? null : new URL(rewritten).pathname;
}

/** The status the boundary answers when it refuses. */
function statusFor(path: string, host = "foundation-template.provelopment.com"): number {
  return proxy(new NextRequest(`https://${host}${path}`, { headers: { host } })).status;
}

/**
 * FOUNDATION-R1B / GEO-03 R04-C13 — THE LANGUAGE A PUBLISHED URL NAMES, AND THE ONE IT NEGOTIATES
 * ==============================================================================================
 *
 * Both publications declare a Site-CLOSED binding with an EMPTY prefix, so the public shape is
 * `/<locale>/<route>`: `/en-001/about`, `/de-de/about`. There is no Site segment to emit — `main` is the
 * Site's identity, not a public path — and no country is a language.
 *
 * R04-C13 retired the geographic spellings from THIS suite. `completePublicPath` still exists and is still
 * exercised directly by `tests/unit/location-selection.test.ts`; what changed is that this deployment file
 * no longer asks the retired completer to define migrated behavior. Everything below goes through the EFS
 * binding, route parse, canonical destination and entry redirect that actually serve the reference.
 */
const REFERENCE = siteConfig.defaultSite.code;
/**
 * M18 — `de` is neither a Site of this publication nor one of its locales: the qualified identity is
 * `de-DE` and the public path key is `de-de`. What remains true is that a German SITE belongs to the
 * Germany publication, while this host serves German as one of ITS OWN locales.
 */
const GERMANY = "de";

describe("an explicit locale in the path is authoritative", () => {
  it("keeps English when the visitor's cookie says German", () => {
    // A published URL names its own representation, and negotiation is an ENTRY decision: it happens at the
    // binding root and never to a URL that already names a locale. So the URL's language wins over the
    // stored preference, and the request stays inside its own Page and Entity.
    const named = resolve(FOUNDATION_HOST, "/en-001/about");
    expect(named?.parsed).toEqual({
      kind: "route",
      route: { siteId: "main", locale: "en-001", localeKey: "en-001", pageRoute: ["about"] },
    });
    if (named?.parsed.kind === "route") {
      expect(canonicalUrl(named.matched.canonicalBinding, named.parsed.route)).toBe(
        `https://${FOUNDATION_HOST}/en-001/about`,
      );
    }
    // The SAME preferences, consulted where they belong — at entry — would select German.
    expect(entryRedirectPath(foundationWeb, { cookie: "de-DE", acceptLanguage: "de-DE,de" })).toBe("/de-de/");
  });

  it("completes a bare locale path to that locale's root", () => {
    // The Site is closed and the prefix empty, so `/en-001` IS the locale root: already complete, and it
    // needs no Site segment. The entry address is what completes INTO it.
    const root = resolve(FOUNDATION_HOST, "/en-001");
    expect(root?.parsed).toEqual({
      kind: "route",
      route: { siteId: "main", locale: "en-001", localeKey: "en-001", pageRoute: [] },
    });
    if (root?.parsed.kind === "route") {
      expect(contentSegments(root.matched.binding, root.parsed.route)).toEqual(["en-001"]);
      expect(canonicalUrl(root.matched.canonicalBinding, root.parsed.route)).toBe(
        `https://${FOUNDATION_HOST}/en-001`,
      );
    }
    expect(entryRedirectPath(foundationWeb, { acceptLanguage: "de-DE,de" })).toBe("/de-de/");
  });

  it("treats `de-DE` as THIS publication's LOCALE, never as a site it does not own (M18 §22)", () => {
    // `de-DE` is the canonical identity and `de-de` its public path key — a LOCALE of this binding, served
    // from this host's own Site. Nothing about it reaches the Germany publication's origin.
    const german = resolve(FOUNDATION_HOST, "/de-de/about");
    expect(german?.parsed).toEqual({
      kind: "route",
      route: { siteId: "main", locale: "de-DE", localeKey: "de-de", pageRoute: ["about"] },
    });
    if (german?.parsed.kind === "route") {
      expect(canonicalUrl(german.matched.canonicalBinding, german.parsed.route)).toBe(
        `https://${FOUNDATION_HOST}/de-de/about`,
      );
    }
    // A retired geographic alias is NOT revived as a compatibility route: bare `de` is not a locale here.
    expect(resolve(FOUNDATION_HOST, "/de")?.parsed).toEqual({
      kind: "rejected",
      reason: 'Unsupported locale "de".',
    });
  });
});

describe("an entry address negotiates the language it does not name", () => {
  it("uses the declared default when the visitor expresses no preference", () => {
    expect(entryRedirectPath(foundationWeb, {})).toBe("/en-001/");
  });

  it("honours the cookie, then Accept-Language, then the declared default", () => {
    expect(entryRedirectPath(foundationWeb, { cookie: "de-DE" })).toBe("/de-de/");
    expect(entryRedirectPath(foundationWeb, { acceptLanguage: "de-DE,de;q=0.9" })).toBe("/de-de/");
    // A preference the binding does not declare is not approximated, aliased, or guessed from a country.
    expect(entryRedirectPath(foundationWeb, { acceptLanguage: "fr-FR,fr;q=0.9" })).toBe("/en-001/");
    expect(entryRedirectPath(foundationWeb, { cookie: "fr" })).toBe("/en-001/");
  });

  it("negotiates each publication against ITS OWN declaration", () => {
    expect(entryRedirectPath(germanyWeb, {})).toBe("/de-de/");
    expect(entryRedirectPath(germanyWeb, { cookie: "en-001" })).toBe("/en-001/");
  });
});

describe("a Site-closed binding publishes no Site segment", () => {
  it("serves the locale root and the Page route at their own URLs", () => {
    const served = [
      ["/en-001", []],
      ["/de-de", []],
      ["/en-001/about", ["about"]],
      ["/de-de/about", ["about"]],
    ] as const;
    for (const [path, pageRoute] of served) {
      const resolved = resolve(FOUNDATION_HOST, path);
      expect(resolved?.parsed.kind, path).toBe("route");
      if (resolved?.parsed.kind === "route") {
        expect(resolved.parsed.route.pageRoute, path).toEqual(pageRoute);
        expect(canonicalUrl(resolved.matched.canonicalBinding, resolved.parsed.route), path).toBe(
          `https://${FOUNDATION_HOST}${path}`,
        );
      }
    }
  });

  it("refuses the retired Site prefixes instead of keeping them alive as routes", () => {
    // `main` is the Site's IDENTITY and `ww` was an older geographic Site. Neither is a public segment: an
    // empty-prefix binding has no Site segment to accept, and no alias is added for an obsolete URL.
    for (const retired of ["/main/en-001", "/main/de-de-de/about", "/ww/de/about"]) {
      expect(resolve(FOUNDATION_HOST, retired)?.parsed.kind, retired).toBe("rejected");
    }
  });
});

describe("a host resolves only the publication it claims", () => {
  it("selects the binding that belongs to the request host", () => {
    expect(resolve(FOUNDATION_HOST, "/en-001/about")?.matched.binding.id).toBe("foundation-web");
    expect(resolve(GERMANY_HOST, "/en-001/about")?.matched.binding.id).toBe("germany-web");
  });

  it("gives an unclaimed host no public EFS Page at all", () => {
    expect(resolve("unclaimed.example", "/en-001/about")).toBeNull();
    expect(resolve("unclaimed.example", "/")).toBeNull();
  });
});

describe("the retired geographic configuration is not revived", () => {
  it("declares no `de` SITE on the Foundation Spoke at all (M18 §22)", () => {
    // The legacy installation stays a ONE-Site configuration until GEO-04 retires it: the Germany Site
    // belongs to the Germany publication, so `/de/de…` cannot complete into a Site on this host. This is
    // also the guard that stops the legacy config from quietly re-acquiring a geographic Site.
    expect(siteConfig.sites.map((site) => site.code)).toEqual([REFERENCE]);
    expect(siteConfig.sites.map((site) => site.code)).not.toContain(GERMANY);
  });
});

describe("the boundary selects the host's Spoke without touching the pathname (M17)", () => {
  const segment = "foundation";

  it("declares the claimed Spoke upstream and passes the PUBLIC path through unchanged", () => {
    for (const path of ["/main/en-001", "/main/en-001/about", "/", "/about"]) {
      expect(selectionFor(path), path).toBe(segment);
      expect(rewriteFor(path), path).toBeNull();
    }
  });

  it("never answers a DIRECT internal request: the namespace is retired, not a route", () => {
    expect(statusFor(`/~spoke/${segment}/main/en-001`)).toBe(404);
    expect(statusFor("/~spoke")).toBe(404);
  });

  it("binds a Spoke's own asset namespace to the host that owns it", () => {
    expect(statusFor(`/spokes/${segment}/assets/sidebar-open.svg`)).toBe(200);
    expect(statusFor("/spokes/other/assets/sidebar-open.svg")).toBe(404);
  });
});
