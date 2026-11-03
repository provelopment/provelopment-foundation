import { describe, expect, it } from "vitest";

import {
  shellAddressesForEfsView,
  type EfsShellAddressProjection,
  type EfsShellAddressSource,
} from "@/app/[[...segments]]/efs-shell-addresses";
import { canonicalUrl, contentSegments, type EfsBinding } from "@/core/efs/publication";

/**
 * These tests exercise the PURE shell-address projection. Every address they assert is produced by the SAME
 * authority the production request boundary uses — `contentSegments` for hrefs, `canonicalUrl` for the
 * canonical absolute URL — so a change to the public-address grammar fails here, not only at runtime.
 *
 * Each input is an explicitly SIMULATED ALREADY-VALIDATED view (`EfsShellAddressSource`): the fields a real
 * `EfsView` would carry for that request. This is not a stand-in for runtime owner resolution, host matching or
 * visibility filtering, and nothing here is claimed about live header/footer/CTA/switcher/Connect/404 behaviour —
 * those belong to the later live cutover.
 */

/** The public href for a route, built by the one address authority. */
function href(binding: EfsBinding, siteId: string, locale: string, pageRoute: readonly string[]): string {
  return `/${contentSegments(binding, {
    siteId,
    locale,
    localeKey: locale,
    pageRoute,
  }).join("/")}`;
}

/** One published navigation entry, addressed exactly as `navigationFor` addresses it. */
function navItem(
  binding: EfsBinding,
  siteId: string,
  locale: string,
  pageId: string,
  label: string,
  pageRoute: readonly string[],
  current = false,
): EfsShellAddressSource["navigation"][number] {
  return { pageId, label, href: href(binding, siteId, locale, pageRoute), current };
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

/** A prefix-scoped, open-Site binding: `/alpha/<site>/<locale>/...`. */
const PREFIX_BINDING: EfsBinding = {
  id: "alpha-hub",
  host: "hub.example",
  prefix: ["alpha"],
  entityId: "e_00000000000000000000000007",
  facetId: "alpha",
  siteIds: ["berlin", "munich"],
  siteMode: "open",
  defaultSiteId: "berlin",
  locales: ["en-001"],
  defaultLocale: "en-001",
  canonical: true,
};

/** Build a simulated validated view over a binding for one Site/locale and Page route. */
function view(input: {
  readonly binding: EfsBinding;
  readonly siteId: string;
  readonly locale: string;
  readonly localeKey: string;
  readonly pageRoute: readonly string[];
  readonly navigation: EfsShellAddressSource["navigation"];
  readonly alternates?: EfsShellAddressSource["alternates"];
  readonly xDefault?: string;
}): EfsShellAddressSource {
  return {
    binding: input.binding,
    // The projection reads only `site.id`; `pages` is empty because navigation is supplied explicitly.
    site: { id: input.siteId, pages: [] },
    locale: input.locale,
    localeKey: input.localeKey,
    canonical: canonicalUrl(input.binding, {
      siteId: input.siteId,
      locale: input.locale,
      localeKey: input.localeKey,
      pageRoute: input.pageRoute,
    }),
    navigation: input.navigation,
    alternates: input.alternates ?? [],
    ...(input.xDefault === undefined ? {} : { xDefault: input.xDefault }),
  };
}

describe("EFS shell address projection — dedicated root, Site-closed", () => {
  const navigation = [
    navItem(ROOT_BINDING, "berlin", "de-de", "home", "Start", []),
    navItem(ROOT_BINDING, "berlin", "de-de", "about", "Über uns", ["About-Us"], true),
    navItem(ROOT_BINDING, "berlin", "de-de", "contact", "Kontakt", ["Contact"]),
  ];
  const projection = shellAddressesForEfsView(
    view({
      binding: ROOT_BINDING,
      siteId: "berlin",
      locale: "de-DE",
      localeKey: "de-de",
      pageRoute: ["About-Us"],
      navigation,
    }),
  );

  it("uses the binding-owned canonical URL of the current Page", () => {
    expect(projection.canonical).toBe("https://north.example/de-de/about-us");
  });

  it("preserves published order, real page ids, published labels and the current marker", () => {
    expect(projection.navigation.map((item) => item.pageId)).toEqual(["home", "about", "contact"]);
    expect(projection.navigation.map((item) => item.label)).toEqual([
      "Start",
      "Über uns",
      "Kontakt",
    ]);
    expect(projection.navigation.map((item) => item.current)).toEqual([false, true, false]);
  });

  it("addresses each destination inside its own binding", () => {
    expect(projection.navigation.map((item) => item.href)).toEqual([
      "/de-de",
      "/de-de/about-us",
      "/de-de/contact",
    ]);
  });

  it("derives homeHref from the published Home entry, not from a synthesised root", () => {
    expect(projection.homeHref).toBe("/de-de");
  });

  it("keeps the qualified locale tag and its lowercase path key distinct", () => {
    expect(projection.locale).toBe("de-DE");
    expect(projection.localeKey).toBe("de-de");
  });

  it("carries no Site-selector or legacy routing field", () => {
    expect(Object.keys(projection).sort()).toEqual([
      "canonical",
      "homeHref",
      "languageAlternates",
      "locale",
      "localeKey",
      "navigation",
    ]);
  });
});

describe("EFS shell address projection — prefix-scoped, Site-open", () => {
  const navigation = [
    navItem(PREFIX_BINDING, "berlin", "en-001", "home", "Home", []),
    navItem(PREFIX_BINDING, "berlin", "en-001", "team", "Team", ["Team", "Page"], true),
  ];
  const projection = shellAddressesForEfsView(
    view({
      binding: PREFIX_BINDING,
      siteId: "berlin",
      locale: "en-001",
      localeKey: "en-001",
      pageRoute: ["Team", "Page"],
      navigation,
    }),
  );

  it("keeps every destination inside the current Site's binding prefix", () => {
    expect(projection.navigation.map((item) => item.href)).toEqual([
      "/alpha/berlin/en-001",
      "/alpha/berlin/en-001/team/page",
    ]);
    expect(projection.homeHref).toBe("/alpha/berlin/en-001");
    expect(projection.canonical).toBe("https://hub.example/alpha/berlin/en-001/team/page");
  });

  it("applies the D43 lowercase Page-route spelling without folding prefix, Site or locale", () => {
    // The declared route `Team/Page` publishes as `team/page`; `alpha`, `berlin`, `en-001` keep their spelling.
    expect(projection.navigation[1]?.href).toBe("/alpha/berlin/en-001/team/page");
  });

  it("never duplicates the prefix and never advertises the sibling Site", () => {
    for (const item of projection.navigation) {
      expect(item.href).not.toContain("/alpha/alpha");
      expect(item.href).not.toContain("/munich");
      expect(item.href.startsWith("/alpha/berlin/en-001")).toBe(true);
    }
  });

  it("reports the published locale path key, not a country or bare language code", () => {
    expect(projection.localeKey).toBe("en-001");
    expect(projection.navigation.every((item) => item.href.includes("/en-001"))).toBe(true);
  });
});

describe("EFS shell address projection — published locale representations only", () => {
  const samePageHrefs = (localeKey: string): string =>
    href(ROOT_BINDING, "berlin", localeKey, ["About-Us"]);

  const projection = shellAddressesForEfsView(
    view({
      binding: ROOT_BINDING,
      siteId: "berlin",
      locale: "de-DE",
      localeKey: "de-de",
      pageRoute: ["About-Us"],
      navigation: [
        navItem(ROOT_BINDING, "berlin", "de-de", "home", "Start", []),
        navItem(ROOT_BINDING, "berlin", "de-de", "about", "Über uns", ["About-Us"], true),
      ],
      alternates: [
        { hreflang: "de-DE", href: samePageHrefs("de-de") },
        { hreflang: "en-001", href: samePageHrefs("en-001") },
      ],
      xDefault: samePageHrefs("de-de"),
    }),
  );

  it("projects exactly the prevalidated alternates of the same Page", () => {
    expect(projection.languageAlternates).toEqual([
      { hreflang: "de-DE", href: "/de-de/about-us" },
      { hreflang: "en-001", href: "/en-001/about-us" },
    ]);
  });

  it("does NOT invent an option for a declared locale with no public representation", () => {
    // `ROOT_BINDING.locales` also declares `fr-FR`; there is no published `fr-FR` representation of this Page.
    expect(ROOT_BINDING.locales).toContain("fr-FR");
    expect(projection.languageAlternates.map((entry) => entry.hreflang)).not.toContain("fr-FR");
    expect(JSON.stringify(projection)).not.toContain("fr");
  });

  it("preserves qualification and publishes no bare language or country alias", () => {
    const tags = projection.languageAlternates.map((entry) => entry.hreflang);
    expect(tags).toEqual(["de-DE", "en-001"]);
    expect(tags).not.toContain("de");
    expect(tags).not.toContain("en");
    expect(tags).not.toContain("de-DE-DE");
  });

  it("passes the truthful x-default through unchanged", () => {
    expect(projection.xDefault).toBe("/de-de/about-us");
  });

  it("omits x-default entirely when the view supplied none", () => {
    const withoutDefault = shellAddressesForEfsView(
      view({
        binding: ROOT_BINDING,
        siteId: "berlin",
        locale: "de-DE",
        localeKey: "de-de",
        pageRoute: ["About-Us"],
        navigation: [],
      }),
    );
    expect("xDefault" in withoutDefault).toBe(false);
  });
});

describe("EFS shell address projection — absent and unpublished destinations", () => {
  it("returns null homeHref when the validated navigation publishes no Home entry", () => {
    const projection = shellAddressesForEfsView(
      view({
        binding: ROOT_BINDING,
        siteId: "berlin",
        locale: "de-DE",
        localeKey: "de-de",
        pageRoute: ["Contact"],
        navigation: [
          navItem(ROOT_BINDING, "berlin", "de-de", "about", "Über uns", ["About-Us"]),
          navItem(ROOT_BINDING, "berlin", "de-de", "contact", "Kontakt", ["Contact"], true),
        ],
      }),
    );

    // The Site+locale root exists as a URL, but it is NOT a published destination here.
    expect(projection.homeHref).toBeNull();
    expect(projection.navigation.map((item) => item.pageId)).toEqual(["about", "contact"]);
  });

  it("advertises nothing and still refuses to fabricate Home for an empty navigation", () => {
    const projection = shellAddressesForEfsView(
      view({
        binding: PREFIX_BINDING,
        siteId: "berlin",
        locale: "en-001",
        localeKey: "en-001",
        pageRoute: ["Contact"],
        navigation: [],
      }),
    );

    expect(projection.navigation).toEqual([]);
    expect(projection.homeHref).toBeNull();
    // Canonical is still the validated address of the Page actually being served.
    expect(projection.canonical).toBe("https://hub.example/alpha/berlin/en-001/contact");
  });

  it("does not substitute a default Site or a guessed locale for a missing Home", () => {
    const projection = shellAddressesForEfsView(
      view({
        binding: PREFIX_BINDING,
        siteId: "munich",
        locale: "en-001",
        localeKey: "en-001",
        pageRoute: ["Team"],
        // A Home entry belonging to the SIBLING Site is not this Site's Home.
        navigation: [navItem(PREFIX_BINDING, "berlin", "en-001", "home", "Home", [])],
      }),
    );

    expect(projection.homeHref).toBeNull();
    expect(projection.homeHref).not.toBe("/alpha/berlin/en-001");
    expect(projection.homeHref).not.toBe("/alpha/munich/en-001");
  });
});

describe("EFS shell address projection — owner isolation and data minimization", () => {
  const projectionFor = (prefix: string): EfsShellAddressProjection => {
    const binding: EfsBinding = { ...PREFIX_BINDING, id: `hub-${prefix}`, prefix: [prefix] };
    return shellAddressesForEfsView(
      view({
        binding,
        siteId: "berlin",
        locale: "en-001",
        localeKey: "en-001",
        pageRoute: ["Team"],
        navigation: [
          navItem(binding, "berlin", "en-001", "home", "Home", []),
          navItem(binding, "berlin", "en-001", "team", "Team", ["Team"], true),
        ],
      }),
    );
  };
  const sharedHostLeft = projectionFor("alpha");
  const sharedHostRight = projectionFor("beta");

  it("keeps two publications on the SAME Host distinct", () => {
    expect(sharedHostLeft.canonical).toBe("https://hub.example/alpha/berlin/en-001/team");
    expect(sharedHostRight.canonical).toBe("https://hub.example/beta/berlin/en-001/team");
    expect(sharedHostLeft.canonical).not.toBe(sharedHostRight.canonical);
    expect(sharedHostLeft.homeHref).toBe("/alpha/berlin/en-001");
    expect(sharedHostRight.homeHref).toBe("/beta/berlin/en-001");
    expect(sharedHostLeft.navigation).not.toEqual(sharedHostRight.navigation);
  });

  it("contains no publication, Spoke, manifest, capsule, property or context fact", () => {
    const sentinelBound: EfsShellAddressSource = {
      ...view({
        binding: {
          ...ROOT_BINDING,
          id: "SENTINEL_BINDING_ID",
          entityId: "SENTINEL_ENTITY_ID",
          facetId: "SENTINEL_FACET_ID",
        },
        siteId: "berlin",
        locale: "de-DE",
        localeKey: "de-de",
        pageRoute: ["Contact"],
        navigation: [navItem(ROOT_BINDING, "berlin", "de-de", "contact", "Kontakt", ["Contact"], true)],
      }),
      site: {
        id: "berlin",
        pages: [],
        properties: { "site.secret": { value: "SENTINEL_PRIVATE", public: false } },
      },
    };

    const serialized = JSON.stringify(shellAddressesForEfsView(sentinelBound));
    for (const forbidden of [
      "SENTINEL_BINDING_ID",
      "SENTINEL_ENTITY_ID",
      "SENTINEL_FACET_ID",
      "SENTINEL_PRIVATE",
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

  it("is plain serializable data — JSON round-trip is lossless", () => {
    const projection: EfsShellAddressProjection = sharedHostLeft;
    expect(JSON.parse(JSON.stringify(projection))).toEqual(projection);
    expect(projection instanceof Map).toBe(false);
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

describe("EFS shell address projection — stable ordering and purity", () => {
  it("preserves authored order and keeps duplicate destinations", () => {
    const navigation = [
      navItem(ROOT_BINDING, "berlin", "de-de", "about", "Über uns", ["About-Us"]),
      navItem(ROOT_BINDING, "berlin", "de-de", "home", "Start", []),
      navItem(ROOT_BINDING, "berlin", "de-de", "about-again", "Über uns", ["About-Us"]),
    ];
    const projection = shellAddressesForEfsView(
      view({
        binding: ROOT_BINDING,
        siteId: "berlin",
        locale: "de-DE",
        localeKey: "de-de",
        pageRoute: ["Contact"],
        navigation,
      }),
    );

    expect(projection.navigation.map((item) => item.pageId)).toEqual([
      "about",
      "home",
      "about-again",
    ]);
    expect(projection.navigation.map((item) => item.href)).toEqual([
      "/de-de/about-us",
      "/de-de",
      "/de-de/about-us",
    ]);
    // Two distinct Pages deliberately publish the same destination: NOT collapsed or de-duplicated.
    expect(new Set(projection.navigation.map((item) => item.href)).size).toBe(2);
  });

  it("does not mutate its input, even when the whole input is frozen", () => {
    const source = deepFreeze(
      view({
        binding: ROOT_BINDING,
        siteId: "berlin",
        locale: "de-DE",
        localeKey: "de-de",
        pageRoute: ["About-Us"],
        navigation: [navItem(ROOT_BINDING, "berlin", "de-de", "about", "Über uns", ["About-Us"], true)],
        alternates: [{ hreflang: "de-DE", href: href(ROOT_BINDING, "berlin", "de-de", ["About-Us"]) }],
      }),
    );
    const before = JSON.stringify(source);

    const projection = shellAddressesForEfsView(source);

    expect(JSON.stringify(source)).toBe(before);
    // Copies, not the caller's own objects.
    expect(projection.navigation[0]).not.toBe(source.navigation[0]);
    expect(projection.languageAlternates[0]).not.toBe(source.alternates[0]);
  });

  it("is deterministic and holds no cross-request cache", () => {
    const source = view({
      binding: PREFIX_BINDING,
      siteId: "berlin",
      locale: "en-001",
      localeKey: "en-001",
      pageRoute: ["Team"],
      navigation: [navItem(PREFIX_BINDING, "berlin", "en-001", "team", "Team", ["Team"], true)],
    });

    const first = shellAddressesForEfsView(source);
    const second = shellAddressesForEfsView(source);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.navigation).not.toBe(second.navigation);
  });
});
