import { describe, expect, it } from "vitest";

import {
  resolveEfsShellInternalDestination,
  type EfsShellDestinationSource,
} from "@/app/[[...segments]]/efs-shell-destinations";
import type { EfsNavigationItem } from "@/app/[[...segments]]/efs-request";
import type {
  EfsFacetDeclaration,
  EfsPageDeclaration,
  EfsSiteDeclaration,
} from "@/config/efs/manifest";
import { canonicalUrl, contentSegments, type EfsBinding } from "@/core/efs/publication";

/**
 * These tests exercise the PURE authored-internal-destination policy.
 *
 * Every expected address is produced by the SAME authority the request boundary uses — `contentSegments`
 * for hrefs — and every input is an explicitly **SIMULATED ALREADY-VALIDATED view**: the fields a real
 * `EfsView` would carry for that request. This is not a stand-in for runtime owner resolution, host
 * matching or visibility filtering, and it claims nothing about live header/footer/CTA rendering.
 */

/** The public href for a declared Page route, built by the one address authority. */
function href(
  binding: EfsBinding,
  siteId: string,
  localeKey: string,
  pageRoute: readonly string[],
): string {
  return `/${contentSegments(binding, {
    siteId,
    locale: localeKey,
    localeKey,
    pageRoute,
  }).join("/")}`;
}

/** One published Page declaration with a single representation. */
function page(
  id: string,
  route: readonly string[],
  locale = "de-DE",
  fallbackLocaleKey?: string,
): EfsPageDeclaration {
  return {
    id,
    route,
    representations: [
      {
        locale,
        ...(fallbackLocaleKey === undefined ? {} : { fallbackLocaleKey }),
      },
    ],
  };
}

/** A verified navigation entry, addressed exactly as the request boundary addresses it. */
function nav(
  binding: EfsBinding,
  siteId: string,
  localeKey: string,
  pageId: string,
  label: string,
  pageRoute: readonly string[],
  current = false,
): EfsNavigationItem {
  return { pageId, label, href: href(binding, siteId, localeKey, pageRoute), current };
}

/** A dedicated-root, closed-Site binding: no prefix, the Site selector is not part of the URL. */
const ROOT_BINDING: EfsBinding = {
  id: "north-root",
  host: "north.example",
  prefix: [],
  entityId: "e_00000000000000000000000003",
  facetId: "north",
  siteIds: ["berlin"],
  siteMode: "closed",
  defaultSiteId: "berlin",
  locales: ["de-DE", "en-001", "fr-FR"],
  defaultLocale: "de-DE",
  canonical: true,
};

/** A prefix-scoped, open-Site binding: `/<prefix>/<site>/<locale>/...`. */
function sharedBinding(prefix: string): EfsBinding {
  return {
    id: `${prefix}-hub`,
    host: "hub.example",
    prefix: [prefix],
    entityId: "e_00000000000000000000000007",
    facetId: "alpha",
    siteIds: ["berlin", "munich"],
    siteMode: "open",
    defaultSiteId: "berlin",
    locales: ["en-001"],
    defaultLocale: "en-001",
    canonical: true,
  };
}

const ALPHA = sharedBinding("alpha");
const BETA = sharedBinding("beta");

const ROOT_PAGES: readonly EfsPageDeclaration[] = [
  page("home", ["home"]),
  page("about", ["About-Us"]),
  page("team", ["Team", "Page"]),
];

function site(id: string, pages: readonly EfsPageDeclaration[]): EfsSiteDeclaration {
  return { id, pages };
}

/** Build a simulated validated view over a binding, Site and locale. */
function view(input: {
  readonly binding: EfsBinding;
  readonly site: EfsSiteDeclaration;
  readonly facet: EfsFacetDeclaration;
  readonly locale: string;
  readonly localeKey: string;
  readonly pageRoute: readonly string[];
  readonly navigation: readonly EfsNavigationItem[];
  readonly xDefault?: string;
}): EfsShellDestinationSource {
  return {
    binding: input.binding,
    site: input.site,
    facet: input.facet,
    locale: input.locale,
    localeKey: input.localeKey,
    canonical: canonicalUrl(input.binding, {
      siteId: input.site.id,
      locale: input.locale,
      localeKey: input.localeKey,
      pageRoute: input.pageRoute,
    }),
    navigation: input.navigation,
    alternates: [],
    ...(input.xDefault === undefined ? {} : { xDefault: input.xDefault }),
  };
}

/** The dedicated-root view: berlin/de-DE with Home, About and a nested Team Page published. */
const ROOT_VIEW = view({
  binding: ROOT_BINDING,
  site: site("berlin", ROOT_PAGES),
  facet: { id: "north", sites: [site("berlin", ROOT_PAGES)] },
  locale: "de-DE",
  localeKey: "de-de",
  pageRoute: ["Team", "Page"],
  navigation: [
    nav(ROOT_BINDING, "berlin", "de-de", "home", "Start", []),
    nav(ROOT_BINDING, "berlin", "de-de", "about", "Über uns", ["About-Us"]),
    nav(ROOT_BINDING, "berlin", "de-de", "team", "Team", ["Team", "Page"], true),
  ],
});

/** Berlin's `About-Us` Page under an `en-001`-only binding, shared by the prefix-scoped cases. */
const SHARED_BERLIN_ABOUT = page("about", ["About"], "en-001");

/** Munich declares the SAME public route, so a Berlin view must never reach it. */
const SHARED_MUNICH_PAGES: readonly EfsPageDeclaration[] = [page("about", ["About"], "en-001")];

/** A prefix-scoped, Site-open view on `binding`: Home + About published for Berlin only. */
function sharedView(binding: EfsBinding): EfsShellDestinationSource {
  return view({
    binding,
    site: site("berlin", [page("home", ["home"], "en-001"), SHARED_BERLIN_ABOUT]),
    facet: {
      id: "alpha",
      sites: [
        site("berlin", [page("home", ["home"], "en-001"), SHARED_BERLIN_ABOUT]),
        site("munich", SHARED_MUNICH_PAGES),
      ],
    },
    locale: "en-001",
    localeKey: "en-001",
    pageRoute: ["About-Us"],
    navigation: [
      nav(binding, "berlin", "en-001", "home", "Home", []),
      nav(binding, "berlin", "en-001", "about", "About", ["About"], true),
    ],
  });
}

const ALPHA_VIEW = sharedView(ALPHA);

/** Resolve one authored href against a view. */
function resolve(
  authoredHref: string,
  source: EfsShellDestinationSource = ROOT_VIEW,
) {
  return resolveEfsShellInternalDestination({ view: source, authoredHref });
}

describe("authored destinations — dedicated root, Site-closed", () => {
  it("resolves a configured `/` to the published Home entry", () => {
    expect(resolve("/")).toEqual({
      kind: "published",
      href: href(ROOT_BINDING, "berlin", "de-de", []),
      pageId: "home",
    });
  });

  it("resolves a nested Page to its own binding-owned published href", () => {
    expect(resolve("/team/page")).toEqual({
      kind: "published",
      href: href(ROOT_BINDING, "berlin", "de-de", ["Team", "Page"]),
      pageId: "team",
    });
  });

  it("publishes the D43 lowercase Page route at the current locale path", () => {
    const result = resolve("/about-us");
    if (result.kind !== "published") throw new Error(`expected published, got ${result.kind}`);
    // Declared as `About-Us`; the public spelling is the lowercase form, under THIS binding and locale.
    expect(result.href).toBe(href(ROOT_BINDING, "berlin", "de-de", ["About-Us"]));
    expect(result.href).toContain("/de-de/");
    expect(result.href.endsWith("/about-us")).toBe(true);
    expect(result.pageId).toBe("about");
  });

  it("carries no prefix for a dedicated-root binding", () => {
    const result = resolve("/about-us");
    if (result.kind !== "published") throw new Error("expected published");
    expect(result.href.startsWith("/de-de/")).toBe(true);
  });
});

describe("authored destinations — shared host, prefix-scoped Site-open", () => {
  const alphaView = ALPHA_VIEW;

  it("resolves a current-Site Page inside that Site's binding prefix", () => {
    expect(resolve("/about", alphaView)).toEqual({
      kind: "published",
      href: href(ALPHA, "berlin", "en-001", ["About"]),
      pageId: "about",
    });
  });

  it("never duplicates the prefix and never falls back to another Site", () => {
    const result = resolve("/about", alphaView);
    if (result.kind !== "published") throw new Error("expected published");
    expect(result.href).not.toContain("/alpha/alpha");
    expect(result.href).not.toContain("/munich");
    expect(result.href.startsWith("/alpha/berlin/en-001")).toBe(true);
  });

  it("refuses a sibling Site's equally named Page rather than selecting it", () => {
    // `berlin` and `munich` both declare the route `About-Us`; a Munich-scoped address must not resolve
    // Munich's Page through Berlin's view.
    expect(SHARED_MUNICH_PAGES[0]?.route).toEqual(["About"]);
    expect(resolve("/munich/about", alphaView)).toEqual({
      kind: "unavailable",
      reason: "site-scoped-authored-route",
    });
  });

  it("refuses the current Site's own fully-Site-scoped form", () => {
    expect(resolve("/berlin/about", alphaView)).toEqual({
      kind: "unavailable",
      reason: "site-scoped-authored-route",
    });
  });

  it("is adversarially distinct on the SAME host across two prefixes", () => {
    const betaView = sharedView(BETA);
    const alpha = resolve("/about", alphaView);
    const beta = resolve("/about", betaView);
    if (alpha.kind !== "published" || beta.kind !== "published") {
      throw new Error("expected both published");
    }
    expect(ALPHA.host).toBe(BETA.host);
    expect(alpha.href).not.toBe(beta.href);
    expect(alpha.href.startsWith("/alpha/")).toBe(true);
    expect(beta.href.startsWith("/beta/")).toBe(true);
  });
});

describe("authored destinations — visibility and unpublished states", () => {
  const pricing = page("pricing", ["Pricing"]);
  // Declared by the Site, but the verified navigation has NO entry for it: it is not servable here.
  const declaredNotPublished: EfsShellDestinationSource = {
    ...ROOT_VIEW,
    site: site("berlin", [...ROOT_PAGES, pricing]),
  };

  it("does not advertise a declared Page that the navigation did not admit", () => {
    expect(resolve("/pricing", declaredNotPublished)).toEqual({
      kind: "unavailable",
      reason: "not-published",
    });
  });

  it("does not advertise a Page this Site never declared", () => {
    expect(resolve("/careers")).toEqual({ kind: "unavailable", reason: "no-declared-page" });
  });

  it("never resolves the retired `/ww/en/...` grammar", () => {
    const result = resolve("/ww/en/about");
    expect(result.kind).not.toBe("published");
    expect(result).toEqual({ kind: "unavailable", reason: "no-declared-page" });
    expect(JSON.stringify(result)).not.toContain("/ww/");
  });

  it("refuses the reserved internal Home name", () => {
    // `/home` is an internal authoring name, NOT an alias for the published root.
    expect(resolve("/home")).toEqual({ kind: "unavailable", reason: "reserved-home-route" });
  });

  it("refuses `/` when this Site publishes no Home entry", () => {
    const noHome: EfsShellDestinationSource = {
      ...ROOT_VIEW,
      navigation: ROOT_VIEW.navigation.filter((item) => item.pageId !== "home"),
    };
    expect(resolve("/", noHome)).toEqual({ kind: "unavailable", reason: "no-published-home" });
  });

  it("never creates a destination from `binding.locales` alone", () => {
    // `fr-FR` IS declared by the binding, and a French representation IS declared by the Page — but the
    // verified navigation admitted nothing, so there is no destination to hand back.
    const frenchPage = page("mentions", ["Mentions"], "fr-FR");
    expect(ROOT_BINDING.locales).toContain("fr-FR");
    const onlyDeclared: EfsShellDestinationSource = {
      ...ROOT_VIEW,
      site: site("berlin", [...ROOT_PAGES, frenchPage]),
    };
    expect(resolve("/mentions", onlyDeclared)).toEqual({
      kind: "unavailable",
      reason: "not-published",
    });
  });
});

describe("authored destinations — deliberate representation fallback", () => {
  // The Page has ONE published representation, `en-001`, while this request is served at `de-de`.
  const contact = page("contact", ["Contact"], "en-001");
  const fallbackView: EfsShellDestinationSource = {
    ...ROOT_VIEW,
    site: site("berlin", [...ROOT_PAGES, contact]),
    navigation: [
      ...ROOT_VIEW.navigation,
      // Exactly what the request boundary produces: the FALLBACK's own locale key in the address.
      nav(ROOT_BINDING, "berlin", "en-001", "contact", "Kontakt", ["Contact"]),
    ],
  };

  it("resolves through the entry the navigation actually admitted", () => {
    expect(fallbackView.localeKey).toBe("de-de");
    expect(resolve("/contact", fallbackView)).toEqual({
      kind: "published",
      href: href(ROOT_BINDING, "berlin", "en-001", ["Contact"]),
      pageId: "contact",
    });
  });

  it("returns that entry's own address rather than re-deriving one at the request locale", () => {
    const result = resolve("/contact", fallbackView);
    if (result.kind !== "published") throw new Error("expected published");
    expect(result.href).toContain("/en-001/");
    expect(result.href).not.toContain("/de-de/");
  });
});

describe("authored destinations — D43 Page casing", () => {
  it("resolves authored `Team/Page` and `team/page` to the same published href", () => {
    const declared = resolve("/Team/Page");
    const folded = resolve("/team/page");
    if (declared.kind !== "published" || folded.kind !== "published") {
      throw new Error("expected both published");
    }
    expect(declared.href).toBe(folded.href);
    expect(declared.pageId).toBe(folded.pageId);
  });

  it("folds any casing of the same declared route", () => {
    const upper = resolve("/TEAM/PAGE");
    if (upper.kind !== "published") throw new Error("expected published");
    expect(upper.href).toBe(href(ROOT_BINDING, "berlin", "de-de", ["Team", "Page"]));
  });

  it("never reinterprets the binding prefix as Page casing", () => {
    // `Alpha` is this binding's PREFIX, not a Page. A prefix segment must never be folded into a Page route.
    expect(resolve("/Alpha/About", ALPHA_VIEW)).toEqual({
      kind: "unavailable",
      reason: "no-declared-page",
    });
  });

  it("never reinterprets the locale key as Page casing", () => {
    expect(resolve("/en-001/about", ALPHA_VIEW)).toEqual({
      kind: "unavailable",
      reason: "no-declared-page",
    });
  });
});

describe("authored destinations — external actions are never rewritten", () => {
  it.each([
    "https://example.com/contact",
    "http://example.com",
    "mailto:hello@example.com",
    "tel:+15551234567",
    "#section",
    "about",
  ])("classifies %s as external and leaves it untouched", (authored) => {
    // These are existing, approved capabilities with their own validation. This resolver must neither
    // rewrite them into a relative Page nor drop them: the caller keeps rendering them unchanged.
    expect(resolve(authored)).toEqual({ kind: "external" });
  });

  it("never turns an external URL into a relative Page", () => {
    for (const authored of ["https://example.com/about", "mailto:team@example.com"]) {
      const result = resolve(authored);
      expect(result.kind).toBe("external");
      expect(JSON.stringify(result)).not.toContain("de-de");
    }
  });
});

describe("authored destinations — malformed internal routes are refused", () => {
  it.each([
    ["/team/", "trailing separator"],
    ["/team//page", "empty segment"],
    ["/../etc", "traversal"],
    ["/team\\page", "backslash is never a separator"],
    ["//cdn.example/x", "protocol-relative address"],
    ["/a/b/c/d/e", "beyond the documented depth cap"],
  ])("refuses %s (%s)", (authored) => {
    const result = resolve(authored);
    expect(result).toEqual({ kind: "unavailable", reason: "unusable-authored-route" });
  });

  it("refuses an empty authored value as external rather than inventing Home", () => {
    // Only the explicit configured `/` means Home; an empty string is not that.
    expect(resolve("")).toEqual({ kind: "external" });
  });
});

/** Freeze a value and everything under it, so any write throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

describe("authored destinations — purity and data minimisation", () => {
  it("does not mutate a frozen view and is deterministic", () => {
    const frozen = deepFreeze(structuredClone(ROOT_VIEW));
    const before = JSON.stringify(frozen);

    const first = resolveEfsShellInternalDestination({ view: frozen, authoredHref: "/about" });
    const second = resolveEfsShellInternalDestination({ view: frozen, authoredHref: "/about" });

    expect(JSON.stringify(frozen)).toBe(before);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("serialises losslessly and carries no internal fact", () => {
    const result = resolve("/about-us");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "north-root",
      "north.example",
      "e_00000000000000000000000003",
      "spokeId",
      "publication",
      "manifest",
      "capsule",
      "properties",
      "context",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("holds no cross-request cache: a DIFFERENT view never inherits a previous answer", () => {
    const root = resolve("/about-us", ROOT_VIEW);
    const alpha = resolve("/about", ALPHA_VIEW);
    if (root.kind !== "published" || alpha.kind !== "published") {
      throw new Error("expected both published");
    }
    expect(root.href).not.toBe(alpha.href);
    // Resolving the first view again still answers for the first view.
    expect(resolve("/about-us", ROOT_VIEW)).toEqual(root);
  });
});

describe("authored destinations — contradictory input fails closed", () => {
  it("refuses two declared Pages claiming the same public route", () => {
    const conflicting: EfsShellDestinationSource = {
      ...ROOT_VIEW,
      site: site("berlin", [page("about", ["About-Us"]), page("about-alias", ["About-Us"])]),
    };
    expect(resolve("/about-us", conflicting)).toEqual({
      kind: "unavailable",
      reason: "conflicting-page-identity",
    });
  });

  it("refuses one Page carrying two different addresses", () => {
    const twoAddresses: EfsShellDestinationSource = {
      ...ROOT_VIEW,
      navigation: [
        nav(ROOT_BINDING, "berlin", "de-de", "about", "Über uns", ["About-Us"], true),
        {
          pageId: "about",
          label: "Über uns (alt)",
          href: href(ROOT_BINDING, "berlin", "de-de", ["Contact"]),
          current: false,
        },
      ],
    };
    expect(resolve("/about-us", twoAddresses)).toEqual({
      kind: "unavailable",
      reason: "conflicting-page-identity",
    });
  });

  it("refuses a navigation href belonging to ANOTHER binding on the same host", () => {
    const foreign: EfsShellDestinationSource = {
      ...ALPHA_VIEW,
      navigation: [
        {
          pageId: "about",
          label: "About",
          href: href(BETA, "berlin", "en-001", ["About"]),
          current: true,
        },
      ],
    };
    // `beta` is the same host, a different prefix: the entry is not this binding's address.
    expect(resolve("/about", foreign)).toEqual({
      kind: "unavailable",
      reason: "not-this-binding",
    });
  });

  it("refuses a navigation href that does not end at the Page's own route", () => {
    const wrongTail: EfsShellDestinationSource = {
      ...ALPHA_VIEW,
      navigation: [
        {
          pageId: "about",
          label: "About",
          href: "/alpha/berlin/en-001/elsewhere",
          current: true,
        },
      ],
    };
    expect(resolve("/about", wrongTail)).toEqual({
      kind: "unavailable",
      reason: "not-this-binding",
    });
  });
});
