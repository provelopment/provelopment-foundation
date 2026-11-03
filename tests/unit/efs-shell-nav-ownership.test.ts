/**
 * Owner-verified EFS primary-navigation composition — UNIT tests, plus one `renderToStaticMarkup`
 * integration with the real R05 renderer.
 *
 * NOT served HTTP, NOT a browser request and NOT a live-shell proof. Every view here is an explicitly
 * SIMULATED ALREADY-VALIDATED one: the fields a real `EfsView` carries for a request the runtime has
 * already resolved. Nothing in this file performs a request, starts a server or asserts a page response,
 * and the "two owners" cases are two injected service sets — not two real installation roots.
 *
 * Every address is formed by the SAME authority the request boundary uses (`contentSegments` over
 * `localePathKey`), so this suite never restates a prefix, binding or locale-path rule of its own.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

/**
 * THE COMPOSER MUST NOT CONSULT CLIENT ROUTING. `next/navigation` is replaced with a `usePathname` that
 * THROWS, so "no client path was read" is a property of the run rather than of the prose.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => {
    throw new Error("THE OWNER-VERIFIED COMPOSER MUST NOT READ A CLIENT PATHNAME");
  },
}));

import { efsOwnedPrimaryNavigation } from "@/app/[[...segments]]/efs-shell-nav-ownership";
import type { EfsView } from "@/app/[[...segments]]/efs-request";
import { ContextNavLinks } from "@/components/site/context-nav-links";
import type { RuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import type { RuntimeDictionaryAccess } from "@/config/runtime-dictionaries";
import type { SiteConfig } from "@/config/site-config";
import { canonicalUrl, contentSegments } from "@/core/efs/publication";
import { localePathKey } from "@/core/efs/locales";

type Binding = EfsView["binding"];
type EfsPage = EfsView["site"]["pages"][number];
type EfsNav = EfsView["navigation"][number];
type SiteEntry = SiteConfig["sites"][number];
type AuthoredNav = SiteConfig["navigation"][number];

/** The public href for a declared Page route, produced by the one address authority. */
function href(
  binding: Binding,
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

function page(
  id: string,
  route: readonly string[],
  locale = "de-DE",
  fallbackLocaleKey?: string,
): EfsPage {
  return {
    id,
    route,
    representations: [{ locale, ...(fallbackLocaleKey === undefined ? {} : { fallbackLocaleKey }) }],
  };
}

function nav(
  binding: Binding,
  siteId: string,
  locale: string,
  pageId: string,
  label: string,
  pageRoute: readonly string[],
  current = false,
): EfsNav {
  return { pageId, label, href: href(binding, siteId, locale, pageRoute), current };
}

/** One declared configuration Site. Only `code` and the override lookup matter to this seam. */
function siteEntry(code: string): SiteEntry {
  return { code, label: code } as unknown as SiteEntry;
}

/**
 * The owning Spoke's page-facing configuration, built structurally: `effectiveSitePageConfig` reads
 * `sites`, `sitePageOverrides`, the shared leaves and `ui`, and the production config carries far more
 * than this seam ever consults.
 */
function siteConfig(input: {
  readonly sites: readonly SiteEntry[];
  readonly navigation: readonly AuthoredNav[];
  readonly overrides?: Readonly<Record<string, { readonly navigation?: readonly AuthoredNav[] }>>;
}): SiteConfig {
  return {
    sites: input.sites,
    defaultSite: input.sites[0],
    navigation: input.navigation,
    sitePageOverrides: input.overrides ?? {},
  } as unknown as SiteConfig;
}

/**
 * A simulated verified view. The fields listed are the ones this seam and R04 actually read; the rest of
 * a real `EfsView` belongs to surfaces this module never consults, so they are deliberately absent rather
 * than faked with plausible-looking values that no assertion covers.
 */
function buildView(input: {
  readonly publication: {
    readonly id: string;
    readonly spokeId: string;
    readonly spokeHubId?: string;
    readonly presentationSiteCode?: string;
  };
  readonly context: {
    readonly id: string;
    readonly spokeHubId?: string;
    readonly siteConfig: SiteConfig;
  };
  readonly binding: Binding;
  readonly efsSiteId: string;
  readonly efsPages: readonly EfsPage[];
  readonly facetSites: readonly { readonly id: string; readonly pages: readonly EfsPage[] }[];
  readonly locale: string;
  readonly pageRoute: readonly string[];
  readonly navigation: readonly EfsNav[];
}): EfsView {
  const site = { id: input.efsSiteId, pages: input.efsPages };
  const publication = input.publication;
  return {
    publication: {
      id: publication.id,
      spokeId: publication.spokeId,
      ...(publication.spokeHubId === undefined ? {} : { spokeHubId: publication.spokeHubId }),
      ...(publication.presentationSiteCode === undefined
        ? {}
        : { presentationSiteCode: publication.presentationSiteCode }),
      entityId: input.binding.entityId,
      facetId: input.binding.facetId,
      bindings: [input.binding],
    },
    binding: input.binding,
    context: input.context,
    site,
    facet: { id: input.binding.facetId, sites: input.facetSites },
    locale: input.locale,
    localeKey: localePathKey(input.locale),
    canonical: canonicalUrl(input.binding, {
      siteId: input.efsSiteId,
      locale: input.locale,
      localeKey: localePathKey(input.locale),
      pageRoute: input.pageRoute,
    }),
    alternates: [],
    navigation: input.navigation,
  } as unknown as EfsView;
}

/* ── Probes ──────────────────────────────────────────────────────────────────────────────────────────── */

interface DictionaryProbe {
  readonly access: RuntimeDictionaryAccess;
  readonly calls: { locale: string; siteCode: string | undefined }[];
}

/**
 * A dictionary service that RECORDS every question it is asked. Rows are keyed `<siteCode>/<localePath>`,
 * exactly the effective (Site, locale) key the owning registry uses, so a wrong Site code or a
 * synthesized locale is visible rather than silently answered.
 */
function dictionaryProbe(
  table: Record<string, Record<string, string>> = {},
): DictionaryProbe {
  const calls: { locale: string; siteCode: string | undefined }[] = [];
  const access = {
    get: (locale: string, siteCode?: string) => {
      calls.push({ locale, siteCode });
      const items = table[`${siteCode ?? "*"}/${locale}`] ?? {};
      return { navigation: { items } };
    },
    applicable: () => true,
  } as unknown as RuntimeDictionaryAccess;
  return { access, calls };
}

interface AssetProbe {
  readonly assets: Pick<RuntimeAssetOwnershipResolver, "availableIconUrl">;
  readonly calls: string[];
}

/** An owner-scoped asset resolver that records every icon it is asked to screen. */
function assetProbe(map: Readonly<Record<string, string>> = {}): AssetProbe {
  const calls: string[] = [];
  const assets = {
    availableIconUrl: (name: string | undefined) => {
      if (name === undefined) return undefined;
      calls.push(name);
      return map[name];
    },
  } as unknown as Pick<RuntimeAssetOwnershipResolver, "availableIconUrl">;
  return { assets, calls };
}

/* ── The owning installation ─────────────────────────────────────────────────────────────────────────── */

/** A dedicated-root, closed-Site binding: the EFS Site selector is not in the URL. */
const NORTH: Binding = {
  id: "north-root",
  host: "north.example",
  prefix: [],
  entityId: "e_00000000000000000000000003",
  facetId: "north",
  siteIds: ["berlin", "munich"],
  siteMode: "closed",
  defaultSiteId: "berlin",
  locales: ["de-DE", "en-001"],
  defaultLocale: "de-DE",
  canonical: true,
};

const BERLIN_PAGES: readonly EfsPage[] = [
  page("home", ["home"]),
  page("about", ["About"]),
  page("team", ["Team", "Page"]),
];

/** A sibling EFS Site. Its Pages are published there — never in a Berlin view. */
const MUNICH_PAGES: readonly EfsPage[] = [page("services", ["Services"])];

const SHARED_NAV: readonly AuthoredNav[] = [
  { label: "Start", href: "/" },
  { label: "Über uns", href: "/about" },
];

/** OWNER A's `brand` Site override — replaces the shared list wholesale. */
const BRAND_NAV: readonly AuthoredNav[] = [
  { label: "About", href: "/about" },
  { label: "Team", href: "/team/page", icon: "team.svg" },
];

/** OWNER B's `brand` Site override — a DIFFERENT list, under the SAME presentation Site code. */
const BRAND_NAV_B: readonly AuthoredNav[] = [{ label: "About", href: "/about", icon: "b-mark.svg" }];

const OWNER_A_CONFIG = siteConfig({
  sites: [siteEntry("main"), siteEntry("brand")],
  navigation: SHARED_NAV,
  overrides: { brand: { navigation: BRAND_NAV } },
});

const OWNER_B_CONFIG = siteConfig({
  sites: [siteEntry("main"), siteEntry("brand")],
  navigation: SHARED_NAV,
  overrides: { brand: { navigation: BRAND_NAV_B } },
});

const BERLIN_NAV: readonly EfsNav[] = [
  nav(NORTH, "berlin", "de-DE", "home", "Start", []),
  nav(NORTH, "berlin", "de-DE", "about", "Über uns", ["About"]),
  nav(NORTH, "berlin", "de-DE", "team", "Team", ["Team", "Page"], true),
];

/** A simulated verified Berlin view over the NORTH publication. */
function northView(input: {
  readonly id?: string;
  readonly spokeId: string;
  readonly spokeHubId?: string;
  readonly presentationSiteCode?: string;
  readonly contextId: string;
  readonly contextHubId?: string;
  readonly config: SiteConfig;
  readonly navigation?: readonly EfsNav[];
  readonly locale?: string;
}): EfsView {
  return buildView({
    publication: {
      id: input.id ?? "pub-north",
      spokeId: input.spokeId,
      ...(input.spokeHubId === undefined ? {} : { spokeHubId: input.spokeHubId }),
      ...(input.presentationSiteCode === undefined
        ? {}
        : { presentationSiteCode: input.presentationSiteCode }),
    },
    context: {
      id: input.contextId,
      ...(input.contextHubId === undefined ? {} : { spokeHubId: input.contextHubId }),
      siteConfig: input.config,
    },
    binding: NORTH,
    efsSiteId: "berlin",
    efsPages: BERLIN_PAGES,
    facetSites: [
      { id: "berlin", pages: BERLIN_PAGES },
      { id: "munich", pages: MUNICH_PAGES },
    ],
    locale: input.locale ?? "de-DE",
    pageRoute: ["Team", "Page"],
    navigation: input.navigation ?? BERLIN_NAV,
  });
}

/** The ordinary, fully valid view: owning Spoke A, Hub A, presentation Site `brand`. */
const OWNER_A_VIEW = northView({
  spokeId: "spoke-a",
  spokeHubId: "hub-a",
  contextId: "spoke-a",
  contextHubId: "hub-a",
  presentationSiteCode: "brand",
  config: OWNER_A_CONFIG,
});

/** A second owning installation answering for the SAME presentation Site code. */
const OWNER_B_VIEW = northView({
  id: "pub-north-b",
  spokeId: "spoke-b",
  spokeHubId: "hub-b",
  contextId: "spoke-b",
  contextHubId: "hub-b",
  presentationSiteCode: "brand",
  config: OWNER_B_CONFIG,
});

const OWNER_A_DICTIONARIES = () =>
  dictionaryProbe({ "brand/de-de": { "/about": "Über uns (A)", "/team/page": "Team (A)" } });
const OWNER_B_DICTIONARIES = () =>
  dictionaryProbe({ "brand/de-de": { "/about": "About (B)" } });
const OWNER_A_ASSETS = () => assetProbe({ "team.svg": "/assets/a/team.svg" });
const OWNER_B_ASSETS = () => assetProbe({ "b-mark.svg": "/assets/b/b-mark.svg" });

/* ── 0. The call under test ─────────────────────────────────────────────────────────────────────────── */

function compose(
  view: EfsView,
  services: { readonly dictionaries: DictionaryProbe; readonly assets: AssetProbe },
) {
  return efsOwnedPrimaryNavigation({
    view,
    dictionaries: services.dictionaries.access,
    assets: services.assets.assets,
  });
}

/* ── 1. The presentation Site is an explicit choice, never a fallback ───────────────────────────────── */

describe("the presentation Site is an explicit choice, never a fallback", () => {
  it("returns exactly null when no presentation Site is declared, touching no service", () => {
    const dictionaries = OWNER_A_DICTIONARIES();
    const assets = OWNER_A_ASSETS();
    // A fully valid, fully owned view whose publication declares NO presentation Site: the ordinary
    // EFS-only document boundary. A default Site exists and must not be borrowed.
    const view = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      config: OWNER_A_CONFIG,
    });

    expect(compose(view, { dictionaries, assets })).toBeNull();
    expect(dictionaries.calls).toEqual([]);
    expect(assets.calls).toEqual([]);
  });

  it("REFUSES an undeclared presentation Site even though a default Site exists", () => {
    const dictionaries = OWNER_A_DICTIONARIES();
    const assets = OWNER_A_ASSETS();
    const view = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "ghost",
      config: OWNER_A_CONFIG,
    });

    // `effectiveSitePageConfig`'s documented STRING form would answer with `defaultSite`; this seam must
    // never let that become an EFS fallback.
    expect(() => compose(view, { dictionaries, assets })).toThrow(/not declared by the owning Spoke/);
    expect(dictionaries.calls).toEqual([]);
    expect(assets.calls).toEqual([]);
  });

  it("returns exactly [] when the selected Site configures no primary navigation", () => {
    const dictionaries = OWNER_A_DICTIONARIES();
    const assets = OWNER_A_ASSETS();
    const view = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config: siteConfig({
        sites: [siteEntry("main"), siteEntry("brand")],
        navigation: [],
        overrides: {},
      }),
    });

    expect(compose(view, { dictionaries, assets })).toEqual([]);
    // No icon was ever asked about, because nothing declared one.
    expect(assets.calls).toEqual([]);
    // Exactly one question, in the verified locale, for the presentation Site — nothing invented.
    expect(dictionaries.calls).toEqual([{ locale: "de-de", siteCode: "brand" }]);
  });

  it("selects the NAMED Site among several, taking only that Site's override", () => {
    const config = siteConfig({
      sites: [siteEntry("main"), siteEntry("brand"), siteEntry("outlet")],
      navigation: SHARED_NAV,
      overrides: {
        brand: { navigation: BRAND_NAV },
        outlet: { navigation: [{ label: "Outlet", href: "/about" }] },
      },
    });
    const view = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config,
    });

    const result = compose(view, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() });
    expect(result?.map((item) => item.label)).toEqual(["Über uns (A)", "Team (A)"]);
    expect(result?.map((item) => item.key)).toEqual(["nav:0", "nav:1"]);
  });
});

/* ── 2. Ownership is proved before anything is read ─────────────────────────────────────────────────── */

describe("ownership is proved before anything is read", () => {
  it("refuses a publication naming a different Spoke, before any service access", () => {
    const dictionaries = OWNER_A_DICTIONARIES();
    const assets = OWNER_A_ASSETS();
    const view = northView({
      spokeId: "spoke-z",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config: OWNER_A_CONFIG,
    });

    expect(() => compose(view, { dictionaries, assets })).toThrow(/does not own/);
    expect(dictionaries.calls).toEqual([]);
    expect(assets.calls).toEqual([]);
  });

  it("refuses the SAME Spoke ID under a different named Hub", () => {
    const dictionaries = OWNER_A_DICTIONARIES();
    const assets = OWNER_A_ASSETS();
    // Identical local Spoke identity, different Hub. Identity is composite, so this is NOT the same owner.
    const view = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-b",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config: OWNER_A_CONFIG,
    });

    expect(() => compose(view, { dictionaries, assets })).toThrow(/does not own/);
    expect(dictionaries.calls).toEqual([]);
    expect(assets.calls).toEqual([]);
  });

  it("accepts the correct Hub + Spoke pair", () => {
    const result = compose(OWNER_A_VIEW, {
      dictionaries: OWNER_A_DICTIONARIES(),
      assets: OWNER_A_ASSETS(),
    });

    expect(result?.map((item) => item.href)).toEqual([
      href(NORTH, "berlin", "de-DE", ["About"]),
      href(NORTH, "berlin", "de-DE", ["Team", "Page"]),
    ]);
  });

  it("never guesses a first Hub or a first Spoke when the identities disagree in shape", () => {
    const flatPublication = northView({
      spokeId: "spoke-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config: OWNER_A_CONFIG,
    });
    expect(() =>
      compose(flatPublication, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() }),
    ).toThrow(/does not own/);

    const hubPublication = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      presentationSiteCode: "brand",
      config: OWNER_A_CONFIG,
    });
    expect(() =>
      compose(hubPublication, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() }),
    ).toThrow(/does not own/);
  });

  it("names only configuration identifiers in its refusal, never a path or a host", () => {
    const view = northView({
      spokeId: "spoke-z",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config: OWNER_A_CONFIG,
    });

    let message = "";
    try {
      compose(view, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("spoke-z");
    expect(message).not.toContain("north.example");
    expect(message).not.toContain("/assets");
  });
});

/* ── 3. Two Site namespaces, never interchanged ─────────────────────────────────────────────────────── */

describe("the presentation Site and the EFS publication Site stay separate", () => {
  it("takes labels from the presentation Site and addresses from view.site", () => {
    const result = compose(OWNER_A_VIEW, {
      dictionaries: OWNER_A_DICTIONARIES(),
      assets: OWNER_A_ASSETS(),
    });

    // Addresses are the EFS publication Site's own published Pages (`berlin`), resolved by R04.
    expect(result?.map((item) => item.href)).toEqual([
      href(NORTH, "berlin", "de-DE", ["About"]),
      href(NORTH, "berlin", "de-DE", ["Team", "Page"]),
    ]);
    // Labels are the presentation Site's (`brand`) dictionary answers.
    expect(result?.map((item) => item.label)).toEqual(["Über uns (A)", "Team (A)"]);
    // DECISIVE NEGATIVE: the configuration Site code is never used as an EFS URL selector.
    expect(result?.every((item) => !item.href.includes("brand"))).toBe(true);
  });

  it("never turns a Page that only a SIBLING EFS Site declares into a link", () => {
    const config = siteConfig({
      sites: [siteEntry("main"), siteEntry("brand")],
      navigation: [],
      overrides: {
        brand: {
          navigation: [
            { label: "About", href: "/about" },
            { label: "Services", href: "/services" },
          ],
        },
      },
    });
    const view = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config,
    });

    const result = compose(view, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() });
    expect(result?.map((item) => item.label)).toEqual(["Über uns (A)"]);
    expect(result?.some((item) => item.href.includes("services"))).toBe(false);
  });
});

/* ── 4. Two owners, interleaved ─────────────────────────────────────────────────────────────────────── */

describe("two owning contexts answering for the same presentation Site code", () => {
  it("keeps every interleaved answer inside its own owner", () => {
    const a1 = compose(OWNER_A_VIEW, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() });
    const b1 = compose(OWNER_B_VIEW, { dictionaries: OWNER_B_DICTIONARIES(), assets: OWNER_B_ASSETS() });
    const a2 = compose(OWNER_A_VIEW, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() });
    const b2 = compose(OWNER_B_VIEW, { dictionaries: OWNER_B_DICTIONARIES(), assets: OWNER_B_ASSETS() });

    // No cache and no module-global configuration: A and B are unchanged by each other.
    expect(a2).toEqual(a1);
    expect(b2).toEqual(b1);

    expect(a1?.map((item) => item.label)).toEqual(["Über uns (A)", "Team (A)"]);
    expect(a1?.[1]?.icon).toBe("/assets/a/team.svg");

    expect(b1?.map((item) => item.label)).toEqual(["About (B)"]);
    expect(b1?.map((item) => item.icon)).toEqual(["/assets/b/b-mark.svg"]);
    // B authored ONE entry; A's second entry must not leak into B, and vice versa.
    expect(a1).toHaveLength(2);
    expect(b1).toHaveLength(1);
  });
});

/* ── 5. Override, inheritance and the R06 leaves carried across ─────────────────────────────────────── */

describe("effective configuration, labels, icons and identity are R06's, not restated here", () => {
  it("inherits the shared navigation when a Site overrides nothing, and replaces it wholesale when it does", () => {
    const shared = compose(
      northView({
        spokeId: "spoke-a",
        spokeHubId: "hub-a",
        contextId: "spoke-a",
        contextHubId: "hub-a",
        presentationSiteCode: "main",
        config: OWNER_A_CONFIG,
      }),
      { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() },
    );
    expect(shared?.map((item) => item.href)).toEqual([
      href(NORTH, "berlin", "de-DE", []),
      href(NORTH, "berlin", "de-DE", ["About"]),
    ]);
    // A configured label is the fallback when the dictionary has no entry for the authored href.
    expect(shared?.[0]?.label).toBe("Start");

    const overridden = compose(OWNER_A_VIEW, {
      dictionaries: OWNER_A_DICTIONARIES(),
      assets: OWNER_A_ASSETS(),
    });
    // Wholesale replacement: `main`'s two inherited entries do NOT merge with `brand`'s override.
    expect(overridden).toHaveLength(2);
    expect(overridden?.[0]?.href).toBe(href(NORTH, "berlin", "de-DE", ["About"]));
  });

  it("keys labels by the AUTHORED href — a key naming the RESOLVED address never wins", () => {
    const dictionaries = dictionaryProbe({
      "brand/de-de": { "/de-de/about": "WRONG (resolved)", "/about": "Right (authored)" },
    });
    const result = compose(OWNER_A_VIEW, { dictionaries, assets: OWNER_A_ASSETS() });

    expect(result?.[0]?.label).toBe("Right (authored)");
  });

  it("asks only for icons the configuration declares, and degrades an unavailable one", () => {
    const config = siteConfig({
      sites: [siteEntry("main"), siteEntry("brand")],
      navigation: [],
      overrides: {
        brand: {
          navigation: [
            { label: "About", href: "/about" },
            { label: "Team", href: "/team/page", icon: "team.svg" },
            { label: "Gone", href: "/about", icon: "absent.svg", disabled: true },
          ],
        },
      },
    });
    const view = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config,
    });
    const assets = OWNER_A_ASSETS();

    const result = compose(view, { dictionaries: OWNER_A_DICTIONARIES(), assets });
    // The About entry declares no icon, so it is never asked about.
    expect(assets.calls).toEqual(["team.svg", "absent.svg"]);
    expect(result?.[1]?.icon).toBe("/assets/a/team.svg");
    // An unowned icon degrades to text rather than to a broken image.
    expect(result?.[2]?.icon).toBeUndefined();
    // The author's disabled state is carried across unchanged.
    expect(result?.[2]?.disabled).toBe(true);
  });

  it("keeps ORIGINAL source indices when an entry is refused, and duplicate destinations distinct", () => {
    const config = siteConfig({
      sites: [siteEntry("main"), siteEntry("brand")],
      navigation: [],
      overrides: {
        brand: {
          navigation: [
            { label: "Undeclared", href: "/nowhere" },
            { label: "About", href: "/about" },
            { label: "About again", href: "/about" },
          ],
        },
      },
    });
    const view = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config,
    });

    const result = compose(view, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() });
    expect(result).toHaveLength(2);
    // Omission never renumbers the survivors: they keep the indices they were authored at.
    expect(result?.map((item) => item.key)).toEqual(["nav:1", "nav:2"]);
    // Two configured entries with one destination stay two distinct items.
    expect(result?.[0]?.href).toBe(result?.[1]?.href);
    expect(result?.[0]?.key).not.toBe(result?.[1]?.key);
  });
});

/* ── 6. Locale keys are passed through, never synthesized ───────────────────────────────────────────── */

describe("the verified locale key is passed through untouched", () => {
  it("asks for de-de and en-001 exactly, and never invents a language base", () => {
    const german = OWNER_A_DICTIONARIES();
    compose(OWNER_A_VIEW, { dictionaries: german, assets: OWNER_A_ASSETS() });
    expect(german.calls).toEqual([{ locale: "de-de", siteCode: "brand" }]);

    const englishView = buildView({
      publication: {
        id: "pub-en",
        spokeId: "spoke-a",
        spokeHubId: "hub-a",
        presentationSiteCode: "brand",
      },
      context: { id: "spoke-a", spokeHubId: "hub-a", siteConfig: OWNER_A_CONFIG },
      binding: NORTH,
      efsSiteId: "berlin",
      efsPages: [page("about", ["About"], "en-001")],
      facetSites: [{ id: "berlin", pages: [page("about", ["About"], "en-001")] }],
      locale: "en-001",
      pageRoute: ["About"],
      navigation: [nav(NORTH, "berlin", "en-001", "about", "About", ["About"], true)],
    });
    const english = dictionaryProbe({ "brand/en-001": { "/about": "About (EN)" } });
    const result = compose(englishView, { dictionaries: english, assets: OWNER_A_ASSETS() });

    expect(english.calls).toEqual([{ locale: "en-001", siteCode: "brand" }]);
    // …and the verified public href for that representation is R04's, unchanged.
    expect(result?.[0]?.href).toBe(href(NORTH, "berlin", "en-001", ["About"]));
    expect(result?.[0]?.label).toBe("About (EN)");
    expect(result?.[0]?.active).toBe(true);
  });
});

/* ── 7. Destinations this seam never invents and never permits ──────────────────────────────────────── */

describe("external destinations are the released policy's decision, and no geography is invented", () => {
  const config = siteConfig({
    sites: [siteEntry("main"), siteEntry("brand")],
    navigation: [],
    overrides: {
      brand: {
        navigation: [
          { label: "Docs", href: "https://docs.example/page" },
          { label: "Mail", href: "mailto:team@example.com" },
          { label: "Call", href: "tel:+4930123" },
          { label: "Bad", href: "javascript:alert(1)" },
          { label: "Bare", href: "example.com" },
          { label: "Relative", href: "./sibling" },
        ],
      },
    },
  });
  const view = northView({
    spokeId: "spoke-a",
    spokeHubId: "hub-a",
    contextId: "spoke-a",
    contextHubId: "hub-a",
    presentationSiteCode: "brand",
    config,
  });

  it("keeps a released https/mailto/tel destination and refuses every unsafe or ambiguous one", () => {
    const result = compose(view, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() });

    expect(result?.map((item) => item.label)).toEqual(["Docs", "Mail", "Call"]);
    expect(result?.map((item) => item.href)).toEqual([
      "https://docs.example/page",
      "mailto:team@example.com",
      "tel:+4930123",
    ]);
    expect(result?.every((item) => item.external === true)).toBe(true);
    // An external destination is never the current Page.
    expect(result?.some((item) => item.active === true)).toBe(false);
  });

  it("generates no `ww` or other geographic segment anywhere in the output", () => {
    const result = compose(view, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("/ww");
    expect(serialized).not.toContain("\\/ww");
  });
});


/* ── 10. Rendered through the REAL shared component ─────────────────────────────────────────────────── */

describe("vertical integration — the list renders through the shared ContextNavLinks", () => {
  /**
   * A RENDERED-COMPONENT integration, not served HTTP and not browser behaviour: `renderToStaticMarkup`
   * over the ACTUAL component, with `usePathname` armed to throw and no `ClientRoutingProvider` mounted.
   */
  it("renders the owner-verified hrefs, labels and aria-current with no client-routing provider", () => {
    const items = compose(OWNER_A_VIEW, {
      dictionaries: OWNER_A_DICTIONARIES(),
      assets: OWNER_A_ASSETS(),
    }) ?? [];

    const html = renderToStaticMarkup(createElement(ContextNavLinks, { mode: "efs-resolved", items }));

    expect(html).toContain(`href="${href(NORTH, "berlin", "de-DE", ["About"])}"`);
    expect(html).toContain("Über uns (A)");
    expect(html).toContain("Team (A)");
    expect(html.split('aria-current="page"').length - 1, html).toBe(1);
    // `<li` alone would also match the icon `<link rel="preload">`; count list items only.
    expect((html.match(/<li[ >]/g) ?? []).length, html).toBe(2);
    // No geographic or `ww` destination was introduced at the render boundary either.
    expect(html).not.toContain("/ww");
  });

  it("renders a verified external as a new-tab link and a disabled entry as non-navigable", () => {
    const config = siteConfig({
      sites: [siteEntry("main"), siteEntry("brand")],
      navigation: [],
      overrides: {
        brand: {
          navigation: [
            { label: "Docs", href: "https://docs.example/page" },
            { label: "Off", href: "/about", disabled: true },
          ],
        },
      },
    });
    const view = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config,
    });
    // An EMPTY dictionary: these two labels are asserted as AUTHORED, not localized.
    const items = compose(view, { dictionaries: dictionaryProbe(), assets: OWNER_A_ASSETS() }) ?? [];

    const html = renderToStaticMarkup(createElement(ContextNavLinks, { mode: "efs-resolved", items }));

    expect(html).toContain('href="https://docs.example/page"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    // The disabled entry stays labelled and carries `aria-disabled`, but is not a link at all.
    expect(html).toContain("Off");
    expect(html).toContain('aria-disabled="true"');
    expect(html.split("<a ").length - 1, html).toBe(1);
  });
});


const SRC = path.join(process.cwd(), "src");
const ADAPTER = "src/app/[[...segments]]/efs-shell-nav-ownership.ts";
const MODEL = "src/app/[[...segments]]/efs-shell-nav-model.ts";

/** Comments are stripped FIRST: this suite and the adapter NAME the authorities they refuse to use. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function allModules(directory: string = SRC): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) found.push(...allModules(absolute));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(absolute);
  }
  return found;
}

function repoPath(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}

describe("the composer is pure", () => {
  it("is deterministic, and mutates neither the view nor the configuration it was given", () => {
    const navigationBefore = JSON.stringify(OWNER_A_VIEW.navigation);
    const publicationBefore = JSON.stringify(OWNER_A_VIEW.publication);
    const authoredBefore = JSON.stringify(BRAND_NAV);

    const first = compose(OWNER_A_VIEW, {
      dictionaries: OWNER_A_DICTIONARIES(),
      assets: OWNER_A_ASSETS(),
    });
    const second = compose(OWNER_A_VIEW, {
      dictionaries: OWNER_A_DICTIONARIES(),
      assets: OWNER_A_ASSETS(),
    });

    expect(second).toEqual(first);
    expect(JSON.stringify(OWNER_A_VIEW.navigation)).toBe(navigationBefore);
    expect(JSON.stringify(OWNER_A_VIEW.publication)).toBe(publicationBefore);
    expect(JSON.stringify(BRAND_NAV)).toBe(authoredBefore);
  });

  it("does not write to FROZEN inputs", () => {
    const frozenNav = Object.freeze(
      BRAND_NAV.map((entry) => Object.freeze({ ...entry })),
    ) as unknown as readonly AuthoredNav[];
    const config = siteConfig({
      sites: [siteEntry("main"), siteEntry("brand")],
      navigation: Object.freeze([]) as readonly AuthoredNav[],
      overrides: { brand: { navigation: frozenNav } },
    });
    const view = northView({
      spokeId: "spoke-a",
      spokeHubId: "hub-a",
      contextId: "spoke-a",
      contextHubId: "hub-a",
      presentationSiteCode: "brand",
      config,
    });

    // A mutation attempt would throw in strict mode rather than pass silently.
    const result = compose(view, { dictionaries: OWNER_A_DICTIONARIES(), assets: OWNER_A_ASSETS() });
    expect(result).toHaveLength(2);
  });

  it("returns only plain, serialisable public leaves — no service or context crosses the boundary", () => {
    const result = compose(OWNER_A_VIEW, {
      dictionaries: OWNER_A_DICTIONARIES(),
      assets: OWNER_A_ASSETS(),
    });

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const item of result ?? []) {
      for (const value of Object.values(item)) {
        expect(["string", "number", "boolean", "undefined"]).toContain(typeof value);
      }
    }
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("availableIconUrl");
    expect(serialized).not.toContain("siteConfig");
  });
});

describe("source guards — this seam stays non-live, and R08's guard still holds", () => {
  it("has exactly ONE importer of the R06 model: this adapter, at the authorized path", () => {
    const importers = allModules()
      .map(repoPath)
      .filter((file) => file !== MODEL)
      .filter((file) => withoutComments(readFileSync(path.join(process.cwd(), file), "utf8")).includes("efs-shell-nav-model"));

    // R08 preauthorized precisely this path; adding it is what unblocks composition, and it is the
    // ONLY exception the repository-wide scan may ever contain.
    expect(importers).toEqual([ADAPTER]);
  });

  it("is not imported by any live module", () => {
    const offenders = allModules()
      .map(repoPath)
      .filter((file) => file !== ADAPTER)
      .filter((file) => {
        const source = withoutComments(readFileSync(path.join(process.cwd(), file), "utf8"));
        return source.includes("efs-shell-nav-ownership") || source.includes("efsOwnedPrimaryNavigation");
      });

    expect(offenders).toEqual([]);
  });

  it("declares no second URL grammar — it imports only the accepted authorities", () => {
    const source = withoutComments(readFileSync(path.join(process.cwd(), ADAPTER), "utf8"));
    for (const forbidden of [
      "siteHref",
      "pathContextOr",
      "resolveNavHref",
      "canonicalUrl",
      "bindingsForSite",
      "sitePrefixPath",
      "pageRoutePathSegments",
      "next/headers",
      "next/navigation",
      "node:fs",
      "node:path",
      "siteConfig\"",
      "server-composition",
    ]) {
      expect(source, `must not reach ${forbidden}`).not.toContain(forbidden);
    }
    // …and it does use the authorities it exists to connect.
    expect(source).toContain("publicationOwnedBy");
    expect(source).toContain("effectiveSitePageConfig");
    expect(source).toContain("efsPrimaryNavigationModel");
  });
});
