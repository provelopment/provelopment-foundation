import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

/**
 * THE COMPOSER MUST NOT CONSULT CLIENT ROUTING.
 *
 * `next/navigation` is replaced with a `usePathname` that THROWS. The EFS render mode is hook-free by
 * construction, so a correct model plus a correct renderer never reaches this function. It is mocked
 * rather than assumed so that "no client path was read" is a property of the run, not of the prose.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => {
    throw new Error("THE EFS PRIMARY-NAV MODEL MUST NOT READ A CLIENT PATHNAME");
  },
}));

import {
  efsPrimaryNavigationModel,
  type EfsPrimaryNavigationModelInput,
} from "@/app/[[...segments]]/efs-shell-nav-model";
import type { EfsNavigationItem } from "@/app/[[...segments]]/efs-request";
import type { EfsShellDestinationSource } from "@/app/[[...segments]]/efs-shell-destinations";
import type { EfsResolvedNavItem } from "@/components/site/context-nav-links";
import { ContextNavLinks } from "@/components/site/context-nav-links";
import type { NavigationItem } from "@/config/site-config";
import type {
  EfsFacetDeclaration,
  EfsPageDeclaration,
  EfsSiteDeclaration,
} from "@/config/efs/manifest";
import { localePathKey } from "@/core/efs/locales";
import { canonicalUrl, contentSegments, type EfsBinding } from "@/core/efs/publication";
import { AUTHOR_ALLOWED_SCHEMES, classifyAuthorUrl } from "@/core/safe-url";

/**
 * These are UNIT tests of a pure server-side projection, plus a `renderToStaticMarkup` integration with
 * the real R05 renderer. They are NOT served HTTP and NOT a browser run: nothing here performs a request,
 * starts a server or asserts a real page response.
 *
 * Every internal expectation is built by the SAME authority the request boundary uses — `contentSegments`
 * over `localePathKey` — so this suite never restates a binding, prefix or locale path rule of its own.
 * Every view is an explicitly **SIMULATED ALREADY-VALIDATED** one: the fields a real `EfsView` would carry
 * for that request. It stands in for nothing else — not runtime owner resolution, not host matching and
 * not visibility filtering.
 */

/** The public href for a declared Page route, produced by the one address authority. */
function href(
  binding: EfsBinding,
  siteId: string,
  locale: string,
  pageRoute: readonly string[],
): string {
  return `/${contentSegments(binding, {
    siteId,
    locale,
    localeKey: localePathKey(locale),
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
      { locale, ...(fallbackLocaleKey === undefined ? {} : { fallbackLocaleKey }) },
    ],
  };
}

/** A verified navigation entry, addressed exactly as the request boundary addresses it. */
function nav(
  binding: EfsBinding,
  siteId: string,
  locale: string,
  pageId: string,
  label: string,
  pageRoute: readonly string[],
  current = false,
): EfsNavigationItem {
  return { pageId, label, href: href(binding, siteId, locale, pageRoute), current };
}

function site(id: string, pages: readonly EfsPageDeclaration[]): EfsSiteDeclaration {
  return { id, pages };
}

/** Build a simulated validated view over a binding, Site and locale. */
function view(input: {
  readonly binding: EfsBinding;
  readonly site: EfsSiteDeclaration;
  readonly facet: EfsFacetDeclaration;
  readonly locale: string;
  readonly pageRoute: readonly string[];
  readonly navigation: readonly EfsNavigationItem[];
}): EfsShellDestinationSource {
  return {
    binding: input.binding,
    site: input.site,
    facet: input.facet,
    locale: input.locale,
    localeKey: localePathKey(input.locale),
    canonical: canonicalUrl(input.binding, {
      siteId: input.site.id,
      locale: input.locale,
      localeKey: localePathKey(input.locale),
      pageRoute: input.pageRoute,
    }),
    navigation: input.navigation,
    alternates: [],
  };
}

/** OWNER A — a dedicated-root, closed-Site binding: no prefix, the Site selector is not in the URL. */
const NORTH: EfsBinding = {
  id: "north-root",
  host: "north.example",
  prefix: [],
  entityId: "e_00000000000000000000000003",
  facetId: "north",
  siteIds: ["berlin"],
  siteMode: "closed",
  defaultSiteId: "berlin",
  locales: ["de-DE", "en-001"],
  defaultLocale: "de-DE",
  canonical: true,
};

/** OWNER B — a prefix-scoped, Site-open binding: `/alpha/<site>/<locale>/...`. */
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


/* ── OWNER A: the dedicated-root Site ─────────────────────────────────────────────────────────────────── */

const NORTH_PAGES: readonly EfsPageDeclaration[] = [
  page("home", ["home"]),
  page("about", ["About"]),
  page("team", ["Team", "Page"]),
];

const NORTH_SITE = site("berlin", NORTH_PAGES);

const NORTH_VIEW = view({
  binding: NORTH,
  site: NORTH_SITE,
  facet: { id: "north", sites: [NORTH_SITE] },
  locale: "de-DE",
  pageRoute: ["Team", "Page"],
  navigation: [
    nav(NORTH, "berlin", "de-DE", "home", "Start", []),
    nav(NORTH, "berlin", "de-DE", "about", "Über uns", ["About"]),
    nav(NORTH, "berlin", "de-DE", "team", "Team", ["Team", "Page"], true),
  ],
});

/* ── OWNER B: the prefix-scoped, Site-open Site ──────────────────────────────────────────────────────── */

const SHARED_BERLIN_ABOUT = page("about", ["About"], "en-001");
/** Munich declares the SAME public route, so a Berlin view must never reach it. */
const SHARED_MUNICH_PAGES: readonly EfsPageDeclaration[] = [page("about", ["About"], "en-001")];

function sharedView(binding: EfsBinding): EfsShellDestinationSource {
  const berlinPages: readonly EfsPageDeclaration[] = [
    page("home", ["home"], "en-001"),
    SHARED_BERLIN_ABOUT,
  ];
  return view({
    binding,
    site: site("berlin", berlinPages),
    facet: {
      id: "alpha",
      sites: [site("berlin", berlinPages), site("munich", SHARED_MUNICH_PAGES)],
    },
    locale: "en-001",
    pageRoute: ["About"],
    navigation: [
      nav(binding, "berlin", "en-001", "home", "Home", []),
      nav(binding, "berlin", "en-001", "about", "About", ["About"], true),
    ],
  });
}

const ALPHA_VIEW = sharedView(ALPHA);
const BETA_VIEW = sharedView(BETA);

/** The authored primary navigation both owners configure identically. */
const AUTHORED_ABOUT: readonly NavigationItem[] = [{ label: "About", href: "/about" }];

function model(
  view: EfsShellDestinationSource,
  authoredNavigation: readonly NavigationItem[],
  extra: Partial<EfsPrimaryNavigationModelInput> = {},
): readonly EfsResolvedNavItem[] {
  return efsPrimaryNavigationModel({
    view,
    authoredNavigation,
    dictionaryNavigationLabels: {},
    resolveIcon: (name) => (name === undefined ? undefined : `/assets/${name}`),
    ...extra,
  });
}

/* ── 1. Two owners, one configured route ─────────────────────────────────────────────────────────────── */

describe("EFS primary navigation — one configured destination, each owner's own address", () => {
  it("resolves the SAME authored /about to OWNER A's dedicated-root address", () => {
    const [item] = model(NORTH_VIEW, AUTHORED_ABOUT);
    expect(item?.href).toBe(href(NORTH, "berlin", "de-DE", ["About"]));
    expect(item?.label).toBe("About");
  });

  it("resolves the SAME authored /about to OWNER B's prefixed address, and never to A's", () => {
    const [alpha] = model(ALPHA_VIEW, AUTHORED_ABOUT);
    expect(alpha?.href).toBe(href(ALPHA, "berlin", "en-001", ["About"]));
    // Distinct owners, distinct addresses, no borrowing in either direction.
    expect(alpha?.href).not.toBe(href(NORTH, "berlin", "de-DE", ["About"]));
    expect(alpha?.href).toContain("/alpha/");
  });

  it("keeps two prefixes of one facet apart — beta cannot borrow alpha's navigation", () => {
    const [alpha] = model(ALPHA_VIEW, AUTHORED_ABOUT);
    const [beta] = model(BETA_VIEW, AUTHORED_ABOUT);
    expect(alpha?.href).not.toBe(beta?.href);
    expect(beta?.href).toBe(href(BETA, "berlin", "en-001", ["About"]));
    expect(beta?.href).toContain("/beta/");
  });

  it("never reaches Munich's identically-named Page from a Berlin view", () => {
    const [alpha] = model(ALPHA_VIEW, AUTHORED_ABOUT);
    expect(alpha?.href).not.toContain("munich");
    expect(alpha?.href).toBe(href(ALPHA, "berlin", "en-001", ["About"]));
  });

  it("accepts a verified FALLBACK-locale representation without pinning the view locale", () => {
    // The Page is declared for de-DE with an en-001 fallback, and the published entry carries the
    // en-001 address — R04-B keeps that eligible even though this view's locale is de-DE.
    const fallbackPages = [page("about", ["About"], "de-DE", "en-001")];
    const fallbackView = view({
      binding: NORTH,
      site: site("berlin", fallbackPages),
      facet: { id: "north", sites: [site("berlin", fallbackPages)] },
      locale: "de-DE",
      pageRoute: ["About"],
      navigation: [nav(NORTH, "berlin", "en-001", "about", "About", ["About"])],
    });
    const [item] = model(fallbackView, AUTHORED_ABOUT);
    expect(item?.href).toBe(href(NORTH, "berlin", "en-001", ["About"]));
    // It is the FALLBACK representation, not an address synthesised for this view's own locale.
    expect(item?.href).not.toBe(href(NORTH, "berlin", "de-DE", ["About"]));
    expect(item?.href).toContain("en-001");
  });

  it("omits the entry when the fallback representation is NOT published", () => {
    const fallbackPages = [page("about", ["About"], "de-DE", "en-001")];
    const unpublishedView = view({
      binding: NORTH,
      site: site("berlin", fallbackPages),
      facet: { id: "north", sites: [site("berlin", fallbackPages)] },
      locale: "de-DE",
      pageRoute: ["About"],
      // Declared, but the verified navigation has no public entry for it.
      navigation: [],
    });
    expect(model(unpublishedView, AUTHORED_ABOUT)).toEqual([]);
  });
});

/* ── 2. Authored internal routes ────────────────────────────────────────────────────────────────────── */

const NORTH_FULL: readonly NavigationItem[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Team", href: "/Team/Page" },
];

describe("authored internal destinations — R04 alone decides, and Home is decided once", () => {
  it("resolves Home, a nested Page and a mixed-case route to their verified addresses", () => {
    const items = model(NORTH_VIEW, NORTH_FULL);
    expect(items.map((item) => item.href)).toEqual([
      href(NORTH, "berlin", "de-DE", []),
      href(NORTH, "berlin", "de-DE", ["About"]),
      href(NORTH, "berlin", "de-DE", ["Team", "Page"]),
    ]);
  });

  it("folds the authored case (D43) — /Team/Page and /team/page are one Page, one address", () => {
    const [mixed] = model(NORTH_VIEW, [{ label: "Team", href: "/Team/Page" }]);
    const [lower] = model(NORTH_VIEW, [{ label: "Team", href: "/team/page" }]);
    expect(mixed?.href).toBe(lower?.href);
    expect(mixed?.href).toBe(href(NORTH, "berlin", "de-DE", ["Team", "Page"]));
  });

  it("omits an undeclared route and keeps the published sibling entry", () => {
    const items = model(NORTH_VIEW, [
      { label: "Nope", href: "/nope" },
      { label: "About", href: "/about" },
    ]);
    expect(items.map((item) => item.label)).toEqual(["About"]);
  });

  it("omits a Page this Site declares but the verified navigation does not publish", () => {
    const pages: readonly EfsPageDeclaration[] = [
      page("about", ["About"]),
      page("draft", ["Draft"]),
    ];
    const draftView = view({
      binding: NORTH,
      site: site("berlin", pages),
      facet: { id: "north", sites: [site("berlin", pages)] },
      locale: "de-DE",
      pageRoute: ["About"],
      navigation: [nav(NORTH, "berlin", "de-DE", "about", "About", ["About"])],
    });
    const items = model(draftView, [
      { label: "About", href: "/about" },
      { label: "Draft", href: "/draft" },
    ]);
    expect(items.map((item) => item.label)).toEqual(["About"]);
  });

  it("omits a route only a SIBLING Site could declare, from an open-Site view", () => {
    // `munich` IS a Site of this facet, so the diagnostic is `site-scoped-authored-route`; either way the
    // entry must not become a link and no sibling Site's Page may be selected.
    expect(model(ALPHA_VIEW, [{ label: "Secrets", href: "/munich/secrets" }])).toEqual([]);
  });

  it("keeps R04's DECLARATION-FIRST fix — a Site-ID-shaped route declared HERE still resolves", () => {
    // `munich/guide` is declared by the current BERLIN Site while the same facet also contains a Site
    // called `munich`. R04-A stopped refusing that; this composer must not reintroduce the over-refusal.
    const guidePages: readonly EfsPageDeclaration[] = [page("guide", ["munich", "guide"], "en-001")];
    const guideView = view({
      binding: ALPHA,
      site: site("berlin", guidePages),
      facet: {
        id: "alpha",
        sites: [site("berlin", guidePages), site("munich", SHARED_MUNICH_PAGES)],
      },
      locale: "en-001",
      pageRoute: ["munich", "guide"],
      navigation: [nav(ALPHA, "berlin", "en-001", "guide", "Guide", ["munich", "guide"], true)],
    });
    const [item] = model(guideView, [{ label: "Guide", href: "/munich/guide" }]);
    expect(item?.href).toBe(href(ALPHA, "berlin", "en-001", ["munich", "guide"]));
    expect(item?.active).toBe(true);
  });

  it("never emits a retired /ww/ alias, a host or an absolute origin", () => {
    for (const item of model(NORTH_VIEW, NORTH_FULL)) {
      expect(item.href.startsWith("/"), item.href).toBe(true);
      expect(item.href).not.toContain("/ww/");
      expect(item.href).not.toContain("north.example");
      expect(item.href).not.toContain("://");
    }
  });
});

/* ── 3. Order, identity and duplicates ─────────────────────────────────────────────────────────────── */

describe("authored order, position-derived identity and duplicate destinations", () => {
  it("preserves configuration order exactly", () => {
    const authored: readonly NavigationItem[] = [
      { label: "Team", href: "/team/page" },
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
    ];
    expect(model(NORTH_VIEW, authored).map((item) => item.label)).toEqual([
      "Team",
      "Home",
      "About",
    ]);
  });

  it("keeps the ORIGINAL source index when an entry is omitted (no renumbering)", () => {
    const authored: readonly NavigationItem[] = [
      { label: "Home", href: "/" }, // nav:0
      { label: "Gone", href: "/nope" }, // nav:1 — omitted
      { label: "About", href: "/about" }, // nav:2
    ];
    expect(model(NORTH_VIEW, authored).map((item) => item.key)).toEqual(["nav:0", "nav:2"]);
  });

  it("keeps two entries with the SAME destination as two distinct items", () => {
    const items = model(NORTH_VIEW, [
      { label: "About", href: "/about" },
      { label: "About again", href: "/about" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.href).toBe(items[1]?.href);
    expect(items[0]?.key).not.toBe(items[1]?.key);
    expect(items.map((item) => item.label)).toEqual(["About", "About again"]);
  });

  it("produces no items for an empty configuration", () => {
    expect(model(NORTH_VIEW, [])).toEqual([]);
  });
});


/* ── 4. Labels, disabled state, icons and presentation leaves ──────────────────────────────────────── */

describe("labels, disabled state and presentation leaves are preserved from the authored source", () => {
  it("prefers the localized dictionary label keyed by the AUTHORED href", () => {
    const [item] = model(NORTH_VIEW, [{ label: "About", href: "/about" }], {
      dictionaryNavigationLabels: { "/about": "Über uns" },
    });
    expect(item?.label).toBe("Über uns");
  });

  it("falls back to the configured label when the dictionary has no entry", () => {
    const [item] = model(NORTH_VIEW, [{ label: "About", href: "/about" }], {
      dictionaryNavigationLabels: { "/elsewhere": "Woanders" },
    });
    expect(item?.label).toBe("About");
  });

  it("localizes by the AUTHORED href — a key naming the RESOLVED address never wins", () => {
    const [item] = model(NORTH_VIEW, [{ label: "About", href: "/about" }], {
      dictionaryNavigationLabels: { [href(NORTH, "berlin", "de-DE", ["About"])]: "Wrong" },
    });
    expect(item?.label).toBe("About");
  });

  it("keeps a public-but-disabled entry labelled, addressed and disabled", () => {
    const [item] = model(NORTH_VIEW, [{ label: "About", href: "/about", disabled: true }]);
    expect(item?.label).toBe("About");
    expect(item?.href).toBe(href(NORTH, "berlin", "de-DE", ["About"]));
    expect(item?.disabled).toBe(true);
  });

  it("resolves only DECLARED icons and requests no sidebar default on the caller's behalf", () => {
    const calls: (string | undefined)[] = [];
    const [plain] = model(NORTH_VIEW, [{ label: "About", href: "/about" }], {
      resolveIcon: (name) => {
        calls.push(name);
        return name === undefined ? undefined : `/ns/${name}`;
      },
    });
    expect(plain?.icon).toBeUndefined();
    expect(plain?.openIcon).toBeUndefined();
    expect(plain?.closedIcon).toBeUndefined();
    // An item with no configured icon asks the resolver NOTHING — no dot, no plus.
    expect(calls).toEqual([]);
  });

  it("distinguishes a MISSING icon from a PRESENT screened URL", () => {
    const resolveIcon = (name: string | undefined) =>
      name === undefined ? undefined : `/ns/${name}`;
    const [item] = model(
      NORTH_VIEW,
      [{ label: "About", href: "/about", icon: "a.svg", iconOpen: "o.svg", iconClosed: "c.svg" }],
      { resolveIcon },
    );
    expect(item?.icon).toBe("/ns/a.svg");
    expect(item?.openIcon).toBe("/ns/o.svg");
    expect(item?.closedIcon).toBe("/ns/c.svg");
  });

  it("passes an UNAVAILABLE icon through as the empty string — the legacy no-icon contract", () => {
    const [item] = model(NORTH_VIEW, [{ label: "About", href: "/about", icon: "gone.svg" }], {
      resolveIcon: () => "",
    });
    expect(item?.icon).toBe("");
  });

  it("carries position as presentation placement only", () => {
    const [item] = model(NORTH_VIEW, [{ label: "About", href: "/about", position: "top" }]);
    expect(item?.position).toBe("top");
  });

  it("never invents demoOnly — NavigationItem has no such field", () => {
    const [item] = model(NORTH_VIEW, [{ label: "About", href: "/about" }]);
    expect(item?.demoOnly).toBeUndefined();
    expect(Object.keys(item ?? {})).not.toContain("demoOnly");
  });
});


/* ── 5. The current-Page decision ──────────────────────────────────────────────────────────────────── */

describe("active comes from the verified navigation entry, never from a client path", () => {
  it("marks exactly the verified current internal Page", () => {
    const items = model(NORTH_VIEW, NORTH_FULL);
    expect(items.map((item) => item.active)).toEqual([false, false, true]);
  });

  it("does not mark a published-but-not-current Page", () => {
    const items = model(ALPHA_VIEW, [
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
    ]);
    expect(items.map((item) => item.active)).toEqual([false, true]);
  });

  it("is a PAGE decision — authored case variation cannot change it", () => {
    const items = model(NORTH_VIEW, [
      { label: "Team", href: "/Team/Page" },
      { label: "TEAM AGAIN", href: "/team/page" },
    ]);
    expect(items.map((item) => item.active)).toEqual([true, true]);
  });
});

/* ── 6. External destinations ─────────────────────────────────────────────────────────────────────── */

describe("external destinations — only a released, explicit scheme becomes a trusted nav link", () => {
  it("passes https:, http:, mailto: and tel: through as the decoded verdict", () => {
    const items = model(NORTH_VIEW, [
      { label: "Site", href: "https://example.com/x" },
      { label: "Plain", href: "http://example.com/y" },
      { label: "Mail", href: "mailto:hi@example.com" },
      { label: "Call", href: "tel:+49123" },
    ]);
    expect(items.map((item) => item.href)).toEqual([
      "https://example.com/x",
      "http://example.com/y",
      "mailto:hi@example.com",
      "tel:+49123",
    ]);
    expect(items.every((item) => item.external === true)).toBe(true);
    expect(items.every((item) => item.active === false)).toBe(true);
  });

  it("emits the DECODED value, never the encoded original", () => {
    const [item] = model(NORTH_VIEW, [{ label: "Mail", href: "mailto:a&#64;example.com" }]);
    expect(item?.href).toBe("mailto:a@example.com");
  });

  it("refuses every destination the released authoring policy refuses", () => {
    const unsafe = [
      "javascript:alert(1)",
      "data:text/html,x",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "about:blank",
      "unknownscheme:x",
      "jav&#x61;script:alert(1)",
    ];
    for (const authoredHref of unsafe) {
      expect(model(NORTH_VIEW, [{ label: "Bad", href: authoredHref }]), authoredHref).toEqual([]);
    }
  });

  it("refuses bare, relative and fragment-only values the broader policy tolerates", () => {
    for (const authoredHref of ["example.com", "./x", "../x", "#top", "?q=1", ""]) {
      expect(
        model(NORTH_VIEW, [{ label: "Not a nav link", href: authoredHref }]),
        authoredHref,
      ).toEqual([]);
    }
  });

  it("distinguishes a leading-/ INTERNAL route from a protocol-relative candidate", () => {
    // A protocol-relative value begins with `/`, so it reaches R04, whose ONE route grammar refuses it
    // for carrying an empty segment; the released classifier refuses it independently as well. Neither
    // path may produce a link.
    expect(model(ALPHA_VIEW, [{ label: "Evil", href: "//evil.example/x" }])).toEqual([]);
    expect(classifyAuthorUrl("//evil.example/x")).toEqual({
      ok: false,
      reason: "protocol-relative",
    });
    // …while a genuine internal route on the same view resolves.
    expect(model(ALPHA_VIEW, [{ label: "About", href: "/about" }])).toHaveLength(1);
  });

  it("is governed ONLY by AUTHOR_ALLOWED_SCHEMES — no second allowlist exists", () => {
    expect(AUTHOR_ALLOWED_SCHEMES).toEqual(["http", "https", "mailto", "tel"]);
    for (const scheme of AUTHOR_ALLOWED_SCHEMES) {
      const [item] = model(NORTH_VIEW, [{ label: scheme, href: `${scheme}:x` }]);
      expect(item?.href, scheme).toBe(`${scheme}:x`);
    }
  });

  it("keeps externals in authored order, with no external flag on internals", () => {
    const items = model(NORTH_VIEW, [
      { label: "Mail", href: "mailto:hi@example.com" },
      { label: "About", href: "/about" },
    ]);
    expect(items.map((item) => item.key)).toEqual(["nav:0", "nav:1"]);
    expect(items[0]?.external).toBe(true);
    expect(items[1]?.external).toBeUndefined();
  });
});


/* ── 7. Output purity ──────────────────────────────────────────────────────────────────────────────── */

describe("the produced list is plain, deterministic server data", () => {
  it("carries only primitive presentation values — no function, view or config object", () => {
    const items = model(NORTH_VIEW, [
      ...NORTH_FULL,
      { label: "Mail", href: "mailto:hi@example.com", icon: "mail.svg" },
    ]);
    for (const item of items) {
      for (const value of Object.values(item)) {
        if (value === undefined) continue;
        expect(["string", "boolean"], JSON.stringify(item)).toContain(typeof value);
      }
      for (const forbidden of [
        "view",
        "context",
        "publication",
        "properties",
        "source",
        "facet",
        "site",
        "binding",
        "resolveIcon",
      ]) {
        expect(Object.keys(item)).not.toContain(forbidden);
      }
    }
  });

  it("survives a JSON round trip with every identity and address intact", () => {
    const items = model(NORTH_VIEW, [
      ...NORTH_FULL,
      { label: "Mail", href: "mailto:hi@example.com" },
    ]);
    const roundTrip = JSON.parse(JSON.stringify(items)) as readonly EfsResolvedNavItem[];
    expect(roundTrip).toHaveLength(items.length);
    expect(roundTrip.map((item) => item.key)).toEqual(items.map((item) => item.key));
    expect(roundTrip.map((item) => item.href)).toEqual(items.map((item) => item.href));
    expect(roundTrip.map((item) => item.label)).toEqual(items.map((item) => item.label));
  });

  it("does not mutate FROZEN inputs", () => {
    const authored = Object.freeze([
      Object.freeze({ label: "About", href: "/about", icon: "a.svg" }),
    ]) as readonly NavigationItem[];
    const labels = Object.freeze({ "/about": "Über uns" });
    const before = JSON.stringify({ authored, labels });
    model(NORTH_VIEW, authored, { dictionaryNavigationLabels: labels });
    expect(JSON.stringify({ authored, labels })).toBe(before);
  });

  it("is deterministic across repeated calls, with no cross-request cache", () => {
    const first = model(NORTH_VIEW, NORTH_FULL);
    expect(model(NORTH_VIEW, NORTH_FULL)).toEqual(first);
    // A different view answers differently, so nothing was memoised from the first call.
    expect(model(ALPHA_VIEW, NORTH_FULL)).not.toEqual(first);
  });
});

/* ── 8. Vertical integration through the REAL R05 renderer ─────────────────────────────────────────── */

/** Escape a verified address for use inside a RegExp (addresses legitimately contain `/` and `.`). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Render the produced list through the ACTUAL shared component, with NO ClientRoutingProvider. */
function render(items: readonly EfsResolvedNavItem[], sortByRegion = false): string {
  return renderToStaticMarkup(
    createElement(ContextNavLinks, { mode: "efs-resolved", items, sortByRegion }),
  );
}

describe("vertical integration — the list renders through ContextNavLinks mode=efs-resolved", () => {
  it("renders the verified hrefs, labels and aria-current with no client-routing provider", () => {
    const items = model(NORTH_VIEW, [
      { label: "Home", href: "/" },
      { label: "Team", href: "/Team/Page" },
    ]);
    const html = render(items);
    for (const item of items) {
      expect(html).toContain(`href="${item.href}"`);
      expect(html).toContain(item.label);
    }
    // Exactly one item is current, and it is the verified one. React emits attributes in its own order,
    // so the two attributes are matched in either order rather than assuming one.
    expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(1);
    const activeHref = escapeRegExp(items[1]?.href ?? "");
    expect(html).toMatch(
      new RegExp(
        `(href="${activeHref}"[^>]*aria-current="page"|aria-current="page"[^>]*href="${activeHref}")`,
      ),
    );
  });

  it("renders a valid external action as a new-tab link that is never current", () => {
    const items = model(NORTH_VIEW, [
      { label: "Mail", href: "mailto:hi@example.com" },
      { label: "About", href: "/about" },
    ]);
    const html = render(items);
    expect(html).toContain('href="mailto:hi@example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(0);
  });

  it("keeps position grouping as presentation order without altering any address", () => {
    const items = model(NORTH_VIEW, [
      { label: "Bottom", href: "/about", position: "bottom" },
      { label: "Top", href: "/team/page", position: "top" },
    ]);
    const html = render(items, true);
    expect(html.indexOf("Top")).toBeLessThan(html.indexOf("Bottom"));
    for (const item of items) {
      expect(html).toContain(`href="${item.href}"`);
    }
  });

  it("renders a disabled entry as labelled but non-navigable", () => {
    const html = render(model(NORTH_VIEW, [{ label: "About", href: "/about", disabled: true }]));
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("About");
    expect(html).not.toContain("<a ");
  });

  it("renders a screened icon and omits the icon element when none was configured", () => {
    const withIcon = render(
      model(NORTH_VIEW, [
        { label: "About", href: "/about", icon: "about.svg" },
        { label: "Team", href: "/team/page" },
      ]),
    );
    expect(withIcon).toContain('src="/assets/about.svg"');
    expect(withIcon.match(/<img /g) ?? []).toHaveLength(1);
  });
});


/* ── 9. Source guard — the helper is NOT live ──────────────────────────────────────────────────────── */

const SRC = path.join(process.cwd(), "src");
const MODEL = path.join(SRC, "app", "[[...segments]]", "efs-shell-nav-model.ts");

/**
 * THE ONE PREAUTHORIZED IMPORTER — AND IT DOES NOT EXIST YET.
 *
 * R06 originally refused EVERY application importer of this model. That blanket condition collided with
 * the next intended order: the non-live EFS ownership adapter must legitimately import
 * `efsPrimaryNavigationModel` to compose a Site's primary navigation, so the model could never gain its
 * one intended consumer without first defeating an accepted guard.
 *
 * The enduring safety property is therefore not "nobody imports this model" but "**no unauthorized**
 * live import". This is ONE exact repository-relative path — not a basename, directory, glob or prefix
 * — so a same-named module elsewhere, an added route or layout, an adjacent server compositor and a
 * newly named EFS helper all still fail. Preauthorizing the path is all this correction does; creating
 * it is a separate order.
 */
const OWNERSHIP_ADAPTER = "src/app/[[...segments]]/efs-shell-nav-ownership.ts";

/**
 * Repository-relative POSIX path for a scanned module. `path.relative` makes the decision independent
 * of where the checkout sits on disk, and folding the separator keeps ONE comparison working on Windows
 * (backslash) and POSIX (slash) instead of two subtly different ones.
 */
function repoPath(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}

/**
 * The guard's decision, extracted as a PURE function so it can be proved against synthetic input
 * without ever planting a violating module in the tree. Takes repository-relative importer paths and
 * returns exactly those that are NOT the single preauthorized adapter, in input order.
 */
function unauthorizedImporters(importerPaths: readonly string[]): string[] {
  return importerPaths
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => file !== OWNERSHIP_ADAPTER);
}

/**
 * Comments are stripped FIRST. Several modules legitimately NAME the authorities they refuse to use in
 * prose (this one does), so a text search that counted those would report a dependency the compiler
 * never sees. This is the same technique the accepted Stage A guard uses.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Every `.ts`/`.tsx` module under `src/`, recursively. */
function applicationModules(directory: string = SRC): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...applicationModules(absolute));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      found.push(absolute);
    }
  }
  return found;
}

describe("source guard — nothing live imports this model yet", () => {
  it("has NO UNAUTHORIZED application importer, so the live shell still runs the old path", () => {
    // The FULL repository-wide scan is kept — every `.ts`/`.tsx` module under `src/`, the model itself
    // excluded, comments stripped. Narrowing the EXCEPTION must never narrow the DETECTION: checking
    // only the seven known live files would silently admit any new unauthorized importer elsewhere.
    const observed = applicationModules()
      .filter((file) => file !== MODEL)
      .filter((file) => withoutComments(readFileSync(file, "utf8")).includes("efs-shell-nav-model"))
      .map(repoPath);

    // THE ENDURING INVARIANT: the only importer of this model may ever be the one preauthorized,
    // non-live adapter. Anything else — a route, a layout, a compositor, a helper, a lookalike
    // filename in another directory — is a violation.
    expect(unauthorizedImporters(observed)).toEqual([]);

    // CHECKPOINT FACT (R08), deliberately SELF-EXPIRING rather than permanent: while the adapter does
    // not exist, nothing at all may import the model. Once a later order creates it this branch simply
    // stops asserting and the invariant above carries on, so the successor meets no contradictory
    // guard and this file never needs a second corrective order.
    if (!existsSync(path.join(process.cwd(), ...OWNERSHIP_ADAPTER.split("/")))) {
      expect(observed).toEqual([]);
    }
  });

  /**
   * POSITIVE CONTROL — the guard above must be able to FAIL.
   *
   * `expect(unauthorizedImporters(observed)).toEqual([])` would pass trivially on a tree with no
   * importers at all, which proves nothing about detection. These cases feed the same pure classifier
   * synthetic repository-relative paths, so an unauthorized LIVE surface, an unrelated application
   * importer and a same-named module in another directory are each shown to be REPORTED — asserted by
   * the exact returned paths, not merely "returns an array". The strings are test data only: no
   * production module becomes an importer and the tree stays free of the adapter.
   */
  describe("importer classification — one exact preauthorized path, everything else refused", () => {
    it("allows exactly the one preauthorized non-live adapter", () => {
      expect(unauthorizedImporters([OWNERSHIP_ADAPTER])).toEqual([]);
    });

    it("reports a live App Router surface even beside the allowed adapter", () => {
      expect(
        unauthorizedImporters([OWNERSHIP_ADAPTER, "src/app/[[...segments]]/layout.tsx"]),
      ).toEqual(["src/app/[[...segments]]/layout.tsx"]);
    });

    it("reports unrelated application importers, so this is not a route-only exemption", () => {
      expect(
        unauthorizedImporters([
          "src/components/site/context-nav-links.tsx",
          "src/core/efs/publication.ts",
          OWNERSHIP_ADAPTER,
        ]),
      ).toEqual(["src/components/site/context-nav-links.tsx", "src/core/efs/publication.ts"]);
    });

    it("reports the SAME basename elsewhere — the allowlist is a path, not a filename", () => {
      expect(
        unauthorizedImporters([
          "src/another-place/efs-shell-nav-ownership.ts",
          "src/app/[[...segments]]/efs-shell-nav-ownership.tsx",
          "src/app/[[...segments]]/efs-shell-nav-ownership.ts.bak",
        ]),
      ).toEqual([
        "src/another-place/efs-shell-nav-ownership.ts",
        "src/app/[[...segments]]/efs-shell-nav-ownership.tsx",
        "src/app/[[...segments]]/efs-shell-nav-ownership.ts.bak",
      ]);
    });

    it("normalizes Windows separators before deciding, on either platform", () => {
      expect(
        unauthorizedImporters(["src\\app\\[[...segments]]\\efs-shell-nav-ownership.ts"]),
      ).toEqual([]);
      expect(unauthorizedImporters(["src\\app\\[[...segments]]\\layout.tsx"])).toEqual([
        "src/app/[[...segments]]/layout.tsx",
      ]);
    });
  });

  it("is not reachable from the route, layout, composition or the accepted EFS modules", () => {
    for (const file of [
      "app/[[...segments]]/layout.tsx",
      "app/[[...segments]]/page.tsx",
      "app/[[...segments]]/server-composition.tsx",
      "app/[[...segments]]/efs-request.ts",
      "app/[[...segments]]/efs-shell-addresses.ts",
      "app/[[...segments]]/efs-shell-destinations.ts",
      "components/site/context-nav-links.tsx",
    ]) {
      const source = withoutComments(readFileSync(path.join(SRC, file), "utf8"));
      expect(source, file).not.toContain("efs-shell-nav-model");
      // …nor the forthcoming non-live intermediate. A live entrypoint importing the adapter directly
      // would reach the model without ever appearing in the importer allowlist above, so the narrowed
      // exception must not become a way around this guard. This remains a STRING-LEVEL source guard —
      // not a transitive dependency graph; deeper reachability is a review question at cutover time.
      expect(source, file).not.toContain("efs-shell-nav-ownership");
    }
  });

  it("left the accepted R04 resolver and R05 renderer seams unchanged", () => {
    const resolver = withoutComments(
      readFileSync(path.join(SRC, "app", "[[...segments]]", "efs-shell-destinations.ts"), "utf8"),
    );
    expect(resolver).toContain("export function resolveEfsShellInternalDestination");
    expect(resolver).not.toContain("efsPrimaryNavigationModel");

    const renderer = withoutComments(
      readFileSync(path.join(SRC, "components", "site", "context-nav-links.tsx"), "utf8"),
    );
    expect(renderer).toContain('readonly mode: "efs-resolved"');
    expect(renderer).not.toContain("efsPrimaryNavigationModel");
  });

  it("declares no second URL grammar — it imports only the accepted authorities", () => {
    const model = withoutComments(readFileSync(MODEL, "utf8"));
    for (const forbidden of [
      "siteHref",
      "pathContextOr",
      "resolveNavHref",
      "contentSegments",
      "canonicalUrl",
      "bindingsForSite",
      "sitePrefixPath",
      "pageRoutePathSegments",
      "next/headers",
      "next/navigation",
      "node:fs",
      "node:path",
      "siteConfig",
    ]) {
      expect(model, `must not reach ${forbidden}`).not.toContain(forbidden);
    }
    // …and it does use the three accepted seams it exists to connect.
    expect(model).toContain("resolveEfsShellInternalDestination");
    expect(model).toContain("navItemKey");
    expect(model).toContain("classifyAuthorUrl");
    expect(model).toContain("AUTHOR_ALLOWED_SCHEMES");
  });
});
