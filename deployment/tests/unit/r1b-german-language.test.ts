import { describe, expect, it, vi } from "vitest";

// This suite asserts the RELEASED legacy metadata contract through the shared composition.
// It no longer drives the production route: EFS is the only public runtime, so the legacy
// composition is exercised directly as the separately scoped test utility it now is.


// DEPLOYMENT SCOPE — this test asserts THIS deployment's own configuration, content and assets, so
// it lives in the deployment capsule (`deployment/tests/**`, FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in
// the `deployment` Vitest project, whose setup selects the REAL installed deployment
// (`tests/setup/real-deployment.ts`, ISO-H2). Its subject is the real capsule, never a fixture.
import { renderToStaticMarkup } from "react-dom/server";

import { pageForContext, pageMetadataForContext, spokeServerComposition } from "@/app/[[...segments]]/server-composition";
import { createPageSources } from "@/adapters/content/page-sources";
// M18 — FOUNDATION Spoke binding: the `ww` Site, its dictionaries and its origin. A multi-Spoke
// Installation has no installation-wide configuration to read (the authority refuses that answer), so a
// deployment-scope suite names the Spoke it describes. `dictionaries` is the ACCEPTED context-bound
// dictionary access, never the one-Spoke compatibility global.
import { foundationConfig as siteConfig, foundationSpoke } from "../support/spoke-contexts";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";
// M21 — the German pages are proved by CONTEXT and SHAPE: the German locale answers from its own
// source (no fallback), the rendered document has a valid outline, and the destinations resolve.
// Wording is the owner's: German and English may legitimately read the same (AGENTS.md §14).
import {
  declarativeSectionCount,
  headingLevels,
  headingOutlineIssues,
  markdownSectionAnchors,
  unresolvedDestinations,
} from "../support/rendered-structure";

const dictionaries = dictionaryAccessForRuntimeContext(foundationSpoke.context);
// M18 — the public route and its metadata resolve the Spoke from the REQUEST BOUNDARY private selection
// header, so a node test that drives them must present one, exactly as the boundary would. Without it a
// multi-Spoke Installation answers NOTHING: no claimed host means no Spoke, never a default one.
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "foundation-template.provelopment.com",
      "x-foundation-spoke-segment": "foundation",
    }),
}));
import { dictionarySchema } from "@/config/i18n/dictionary";
import { siteDescriptionForLocale } from "@/config/site-metadata";
import { HOME_CONTENT_SLUG } from "@/core/page-content";

/**
 * FOUNDATION-R1B1A — ONE REAL SECOND LANGUAGE (German / `de` on the `ww` site)
 * ==========================================================================
 *
 * German is added the way the platform intends a language to be added: by CONFIGURATION and
 * CONTENT alone (`i18n.locales`, `config/i18n/de.json`, the German page files under
 * `content/pages/<mode>/ww/de/`). This file
 * proves the consequences that configuration is supposed to have:
 *
 *  - `ww` serves `en` + `de`, and English is still the default locale;
 *  - `ww/de` is canonical `de` — the Worldwide site invents no country (`de-DE` would be wrong);
 *  - German Home and About are REAL German sources, not English answers for a German URL;
 *  - the German Home document has the SAME structure (section types, order, destinations,
 *    variants, ratios, surfaces) as the English canonical page — the translation translated the
 *    copy and redesigned nothing;
 *  - both German pages keep the one-h1 contract and their authored heading shape;
 *  - the locale root's metadata speaks German (`i18n.locales[].description`) while a page's own
 *    summary still speaks for the page, and hreflang alternates stay inside the `ww` site.
 *
 * The browser-visible half of the same story (the Language selector appearing on its own, its
 * exact choices, switching in both directions, Layout persistence, German text expansion) is
 * proved in the `reference-content` browser scenario, against the SHIPPED configuration.
 */
const SITE = "ww";
const GERMAN = "de";
const ENGLISH = "en";

const pages = () => createPageSources({ sites: siteConfig.sites, roots: foundationSpoke.resources });
const composition = () => spokeServerComposition(foundationSpoke.context);
const renderPage = (...segments: string[]) => pageForContext(composition(), segments);
const pageMetadata = (...segments: string[]) => pageMetadataForContext(composition(), segments);
const site = siteConfig.sites.find((candidate) => candidate.code === SITE);
describe("the `ww` site serves a real second language", () => {

  it("serves exactly `en` and `de`, and keeps English as the default locale", () => {
    expect(site?.locales.map((locale) => locale.path)).toEqual([ENGLISH, GERMAN]);
    expect(site?.defaultLocale).toBe(ENGLISH);
    expect(siteConfig.defaultLocale).toBe(ENGLISH);
  });

  it("makes `ww/de` canonical `de`, never a country variant", () => {
    // The Worldwide site makes no country assumption (`@/core/site-locale`): `ww/de` is German,
    // not `de-DE`, and `ww/en` is untouched by this increment.
    expect(site?.locales.find((locale) => locale.path === GERMAN)?.canonical).toBe("de");
    expect(site?.locales.find((locale) => locale.path === ENGLISH)?.canonical).toBe("en");
  });

  it("describes the German choices exactly as a visitor sees them", () => {
    // The Language selector lists the configured locales by their native `label` (an
    // `englishLabel` would add a bracketed English name; German deliberately has none), so the
    // visible vocabulary is English | Deutsch — never a fictitious third language.
    expect(siteConfig.locales.map((locale) => locale.label)).toEqual(["English", "Deutsch"]);
    expect(
      siteConfig.locales.find((locale) => locale.code === GERMAN)?.englishLabel,
    ).toBeUndefined();
    expect(siteConfig.locales).toHaveLength(2);
  });
});


describe("the German UI dictionary is a complete, validated dictionary", () => {
  const german = dictionaries.get(GERMAN);

  it("satisfies the complete dictionary schema", () => {
    const parsed = dictionarySchema.safeParse(german);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("translates the shared UI vocabulary the live German surface shows", () => {
    expect(german.language.label).toBe("Sprache");
    expect(german.layout).toEqual({
      label: "Layout",
      sidebar: "Seitenleiste",
      menuBar: "Menüleiste",
    });
    expect(german.navigation.showSidebar).toBe("Navigation einblenden");
    expect(german.navigation.hideSidebar).toBe("Navigation ausblenden");
    expect(german.navigation.primaryLabel).toBe("Hauptnavigation");
    expect(german.a11y.skipToContent).toBe("Zum Inhalt springen");
    expect(german.notFound.title).toBe("Seite nicht gefunden");
    // The agreed human-facing labels: the neutral Location choice is "All locations", and the
    // reserved `ww` Site carries the agreed label "Global" (the Site selector's own vocabulary).
    expect(german.location.unspecified).toBe("Alle Standorte");
  });

  it("translates the configured navigation destinations without changing a URL", () => {
    expect(german.navigation.items["/"]).toBe("Startseite");
    expect(german.navigation.items["/about"]).toBe("Über uns");
    // The dictionary is keyed by HREF: adding a language never invents a German slug. M19 adds the
    // SECONDARY/FOOTER destinations (the cross-Spoke links to the other public website) to this same
    // href-keyed map, because that is the documented mechanism the footer group resolves its labels
    // through — so the key set is every configured destination href, primary and secondary alike.
    const configuredHrefs = [
      ...siteConfig.navigation.map((item) => item.href),
      ...(siteConfig.footerNavigation?.items ?? []).map((item) => item.href),
    ];
    expect(Object.keys(german.navigation.items).sort()).toEqual(configuredHrefs.sort());
  });

  it("leaves the English dictionary alone", () => {
    expect(dictionaries.get(ENGLISH).language.label).toBe("Language");
    expect(dictionaries.get(ENGLISH).navigation.items["/about"]).toBe("About");
  });
});

describe("the German pages are real German sources, not English answers", () => {
  it("resolves the authored German Home document at the reserved home slug", async () => {
    const home = await pages().resolve(SITE, HOME_CONTENT_SLUG, GERMAN);
    expect(home?.kind).toBe("json");
    // The German URL is answered by the GERMAN source — no fallback to English — and it belongs to
    // this Site. That is the whole "German is real" proof: context, never wording (M21).
    expect(home?.siteId).toBe(SITE);
    expect(home?.locale).toBe(GERMAN);
    expect(home?.fallback).toBe(false);
    expect(home?.title.trim()).not.toBe("");
  });

  it("resolves the authored German About page", async () => {
    const about = await pages().resolve(SITE, "about", GERMAN);
    expect(about?.kind).toBe("markdown");
    expect(about?.siteId).toBe(SITE);
    expect(about?.locale).toBe(GERMAN);
    expect(about?.fallback).toBe(false);
    // An authored page declares its own title, summary and body — in whatever words the owner chose.
    expect(about?.title.trim()).not.toBe("");
    expect(about?.kind === "markdown" ? (about.description ?? "").trim() !== "" : false).toBe(true);
    expect(about?.kind === "markdown" ? about.body.trim() !== "" : false).toBe(true);
  });

  it("resolves the authored German About page", async () => {
    const about = await pages().resolve(SITE, "about", GERMAN);
    expect(about?.kind).toBe("markdown");
    expect(about?.locale).toBe(GERMAN);
    expect(about?.fallback).toBe(false);
    // …and its own summary is the German one, so `/ww/de/about` advertises German metadata.
    const english = await pages().resolve(SITE, "about", ENGLISH);
    expect(about?.description).toBeTruthy();
    expect(about?.description).not.toBe(english?.description);
    expect(about?.title.trim()).not.toBe("");
    expect(about?.title).not.toBe(english?.title);
  });

  it("publishes the same route under the German locale", async () => {
    const routePaths = await pages().listRoutes(SITE, GERMAN);
    expect(routePaths.some((routePath) => routePath.replace(/^\//, "") === "about")).toBe(true);
    // The home page's real URL is the locale root: the reserved slug is a CONTENT route that the
    // route/sitemap layer translates into the root URL (never `/<site>/<locale>/home`).
    expect(routePaths).toContain(HOME_CONTENT_SLUG);
  });
});

describe("the German Home keeps the English page's structure", () => {
  /** The STRUCTURAL tokens of a document: what must not change when copy is translated. */
  const shape = (document: { readonly sections: readonly Record<string, unknown>[] }) =>
    document.sections.map((section) => {
      const actions = (section.actions ?? []) as readonly Record<string, unknown>[];
      const items = (section.items ?? []) as readonly Record<string, unknown>[];
      return {
        type: section.type,
        surface: section.surface ?? null,
        ratio: section.ratio ?? null,
        actionCount: actions.length,
        itemCount: items.length,
        itemActionCount: items.filter((item) => item.action !== undefined).length,
      };
    });

  it("declares the same sections, in the same order, with the same shape", async () => {
    const german = await pages().resolve(SITE, HOME_CONTENT_SLUG, GERMAN);
    const english = await pages().resolve(SITE, HOME_CONTENT_SLUG, ENGLISH);
    const germanDocument = german?.kind === "json" ? german.document : null;
    const englishDocument = english?.kind === "json" ? english.document : null;

    expect(germanDocument?.sections.map((section) => section.type)).toEqual([
      "hero",
      "columns",
      "callout",
      "cards",
      "prose",
      "prose",
    ]);
    expect(shape(germanDocument!)).toEqual(shape(englishDocument!));
  });

  it("keeps its own internal destination and the external repository link", async () => {
    // The German page states the SITE-SCOPED destination it means (`/ww/de/about`), because `de`
    // is both a locale key and the Germany site's code — a `route` target would resolve to
    // `/de/about`, which now names the Germany site. The external destination is untouched.
    const home = await pages().resolve(SITE, HOME_CONTENT_SLUG, GERMAN);
    const document = home?.kind === "json" ? home.document : null;
    const hero = document?.sections[0] as Record<string, unknown> | undefined;
    const actions = (hero?.actions ?? []) as readonly Record<string, unknown>[];

    // The German home's own hero actions, structurally: the internal destination is SITE-SCOPED, so
    // `de` can never be read as the Germany Site, and the other destination is absolutely addressed
    // with its secondary variant. WHICH pages they name is the owner's editorial choice (M21).
    expect(String(actions[0]?.href ?? "")).toMatch(/^\/ww\/[a-z]{2}\//);
    expect(String(actions[1]?.href ?? "")).toMatch(/^https:\/\//);
    expect(actions[1]?.variant).toBe("secondary");
  });
});

describe("the served German pages", () => {
  it("renders German Home at `/ww/de`: one h1, a valid outline, site-scoped destinations", async () => {
    const home = await pages().resolve(SITE, HOME_CONTENT_SLUG, GERMAN);
    const html = renderToStaticMarkup(await renderPage(SITE, GERMAN));

    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(headingOutlineIssues(headingLevels(html))).toEqual([]);
    // The German page is the JSON mode's composed document, exactly as the English one is.
    expect(declarativeSectionCount(html)).toBeGreaterThan(1);
    // `de` is BOTH a locale key and the Germany Site's code, so every internal destination this page
    // renders must be SITE-SCOPED (`/ww/…`) — the durable form of "unambiguous by construction".
    expect(
      await unresolvedDestinations(html, (slug) => pages().resolve(SITE, slug, GERMAN), {
        prefixes: [`/${SITE}/${GERMAN}`, `/${GERMAN}`],
        homeSlug: HOME_CONTENT_SLUG,
      }),
    ).toEqual([]);
    for (const href of [...html.matchAll(/<a\b[^>]*?\bhref="(\/[^"#]*)"/gi)].map((match) => match[1]!)) {
      expect(href, "an internal destination must stay inside this Site").toMatch(/^\/ww\//);
    }
    // An authored action still renders an ABSOLUTE external destination (wherever the owner points it).
    expect(html).toMatch(/<a\b[^>]*?\bhref="https:\/\//i);
    // The authored home page replaces the starter homepage, exactly as it does in English.
    expect(html).not.toContain("home-hero");
    expect(home?.fallback).toBe(false);
  });

  it("renders German About at `/ww/de/about`: one h1, a valid outline, addressable sections", async () => {
    const about = await pages().resolve(SITE, "about", GERMAN);
    const html = renderToStaticMarkup(await renderPage(SITE, GERMAN, "about"));

    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(headingOutlineIssues(headingLevels(html))).toEqual([]);
    // A translated `# Heading` still renders RELATIVE to the page title and stays ADDRESSABLE: the
    // Markdown renderer's own anchors exist, whatever the headings happen to say.
    const anchors = markdownSectionAnchors(html);
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) expect(anchor.trim()).not.toBe("");
    // Every internal destination resolves to a page this deployment serves, inside this Site.
    expect(
      await unresolvedDestinations(html, (slug) => pages().resolve(SITE, slug, GERMAN), {
        prefixes: [`/${SITE}/${GERMAN}`, `/${GERMAN}`],
        homeSlug: HOME_CONTENT_SLUG,
      }),
    ).toEqual([]);
    for (const href of [...html.matchAll(/<a\b[^>]*?\bhref="(\/[^"#]*)"/gi)].map((match) => match[1]!)) {
      expect(href, "an internal destination must stay inside this Site").toMatch(/^\/ww\//);
    }
    expect(html).toMatch(/<a\b[^>]*?\bhref="https:\/\//i);
    expect(about?.fallback).toBe(false);
  });
});

describe("German locale metadata", () => {
  it("speaks German at the locale root, where the site's own words stand alone", async () => {
    const metadata = await pageMetadata(SITE, GERMAN);

    expect(metadata.description).toBe(siteDescriptionForLocale(siteConfig, GERMAN));
    // …and it is genuinely German, not the deployment's English sentence.
    expect(metadata.description).not.toBe(siteConfig.description);
    // The route returns the SITE-RELATIVE destination; `metadataBase` resolves it to the absolute
    // URL the page serves (`…/ww/de`), which the browser scenario asserts on the rendered tag.
    expect(metadata.alternates?.canonical).toBe("/ww/de");
    expect(metadata.openGraph?.locale).toBe(GERMAN);
    expect(metadata.openGraph?.alternateLocale).toEqual([ENGLISH]);
    // hreflang alternates stay INSIDE the `ww` site: both languages plus x-default.
    expect(metadata.alternates?.languages).toMatchObject({
      en: `${siteConfig.url}/ww/en`,
      de: `${siteConfig.url}/ww/de`,
      "x-default": `${siteConfig.url}/ww/en`,
    });
  });

  it("leaves the English locale root exactly as the owner accepted it", async () => {
    const metadata = await pageMetadata(SITE, ENGLISH);

    expect(metadata.description).toBe(siteConfig.description);
    expect(metadata.alternates?.canonical).toBe("/ww/en");
    expect(metadata.openGraph?.locale).toBe(ENGLISH);
  });

  it("lets the German About page's own summary speak for it, with German alternates", async () => {
    const metadata = await pageMetadata(SITE, GERMAN, "about");
    const about = await pages().resolve(SITE, "about", GERMAN);

    // The page's metadata is present and coherent; its wording is the owner's.
    expect(String(metadata.title ?? "").trim()).not.toBe("");
    expect(metadata.description).toBe(about?.description);
    expect(metadata.alternates?.canonical).toBe(`${siteConfig.url}/ww/de/about`);
    expect(metadata.alternates?.languages).toMatchObject({
      en: `${siteConfig.url}/ww/en/about`,
      de: `${siteConfig.url}/ww/de/about`,
      "x-default": `${siteConfig.url}/ww/en/about`,
    });
  });
});



