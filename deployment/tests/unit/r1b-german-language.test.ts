import { describe, expect, it, vi } from "vitest";

// R04-C7 — RE-EXPRESSION OF `r1b-german-language`.
//
// ORIGINAL INTENT, kept: a REAL second language, added by configuration and content alone, must serve a
// German Home and a German About from genuinely German sources (never English answers behind a German
// URL), with the same document structure as the English canonical page, its own metadata, and every
// internal destination resolving inside the same owner.
//
// WHAT RETIRED IT: the original form asserted the geographic presentation model — Site `ww`, locales
// `en`/`de`, routes `/ww/de/...`, `createPageSources().resolve("ww", …)` and `pageMetadataForContext`.
// Under the accepted architecture the Site is `main`, locales are QUALIFIED (`en-001`, `de-DE`), routes
// are `/{locale}/...`, and the authority is the publication itself.
//
// WHAT REPLACES IT: the same capabilities through the EFS runtime (`efsViewForCurrentRequest` and the
// metadata helpers over that view) and the rendered document. Nothing reads the retired resolver.
const requested = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => requested.get(key) ?? null }),
}));

import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";

import PageRoute from "@/app/[[...segments]]/page";
import {
  efsDescription,
  efsLanguageAlternates,
  efsPublicSegments,
  efsRobots,
  efsTitle,
  efsViewForCurrentRequest,
} from "@/app/[[...segments]]/efs-request";
import { loadEfsManifest } from "@/config/efs/manifest";
import { HOME_CONTENT_SLUG } from "@/core/page-content";

import {
  declarativeSectionCount,
  headingLevels,
  headingOutlineIssues,
  markdownSectionAnchors,
  unresolvedDestinations,
} from "../support/rendered-structure";

const loaded = loadEfsManifest(path.join(process.cwd(), "deployment", "efs", "manifest.json"));
const publication = loaded.manifest!.publications[0];
const binding = publication.bindings.find((candidate) => candidate.canonical !== false)!;
const host = binding.host;
const reference = loaded.manifest!.entities.find((entity) => entity.id === publication.entityId)!;
const pages = reference.facets[0].sites[0].pages;
const ENGLISH = "en-001";
const GERMAN = "de-de";

function request(spokeSegment: string) {
  requested.set("host", host);
  requested.set("x-foundation-spoke-segment", spokeSegment);
}

async function view(segments: readonly string[], spokeSegment = "foundation") {
  request(spokeSegment);
  const answer = await efsViewForCurrentRequest([...segments]);
  expect(answer, `/${segments.join("/")} is published`).not.toBeNull();
  return answer!;
}

const html = async (segments: readonly string[]) =>
  renderToStaticMarkup(await PageRoute({ params: Promise.resolve({ segments: [...segments] }) }));

describe("the reference publishes two real languages", () => {
  it("serves exactly `en-001` and `de-de`, and declares English as the default", () => {
    expect([...binding.locales].map((locale) => locale.toLowerCase()).sort()).toEqual([GERMAN, ENGLISH]);
    expect(binding.defaultLocale.toLowerCase()).toBe(ENGLISH);
  });

  it("keeps both languages QUALIFIED — no bare `de` or `en` path key is served", async () => {
    const german = await view([GERMAN]);
    // The path key is the lowercase form of the canonical tag, and the tag itself is qualified, so the
    // Worldwide Site can never be mistaken for a country and `de` alone is never a locale.
    expect(german.localeKey).toBe(GERMAN);
    expect(german.locale.toLowerCase()).toBe(GERMAN);
    expect(german.locale).not.toBe("de");
    expect(efsPublicSegments(german)).toEqual([GERMAN]);
    await expect(PageRoute({ params: Promise.resolve({ segments: ["de"] }) })).rejects.toThrow();
    await expect(PageRoute({ params: Promise.resolve({ segments: ["en"] }) })).rejects.toThrow();
  });

  it("answers German from a German source, never the English one behind a German URL", async () => {
    const german = await view([GERMAN]);
    const home = pages.find((page) => page.id === HOME_CONTENT_SLUG)!;
    // The Page declares BOTH representations; the German request is served by the German one.
    expect(home.representations.map((representation) => representation.locale.toLowerCase()).sort()).toEqual([
      GERMAN,
      ENGLISH,
    ]);
    expect(german.page.id).toBe(HOME_CONTENT_SLUG);
    expect(german.visibility).toBe("public");
  });

  it("gives German Home the SAME document structure as the English canonical page", async () => {
    const englishHtml = await html([ENGLISH]);
    const germanHtml = await html([GERMAN]);

    for (const [document, label] of [
      [englishHtml, ENGLISH],
      [germanHtml, GERMAN],
    ] as const) {
      expect(document.match(/<h1\b/g) ?? [], `${label} has exactly one h1`).toHaveLength(1);
      expect(headingOutlineIssues(headingLevels(document)), `${label} outline`).toEqual([]);
      expect(declarativeSectionCount(document), `${label} sections`).toBeGreaterThan(0);
    }
    // Same section count and the same heading DEPTHS: a translation may not restructure the page.
    expect(declarativeSectionCount(germanHtml)).toBe(declarativeSectionCount(englishHtml));
    expect(headingLevels(germanHtml)).toEqual(headingLevels(englishHtml));
  });

  it("renders German About as its own authored document, with addressable sections", async () => {
    const germanHtml = await html([GERMAN, "about"]);
    expect(germanHtml.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(headingOutlineIssues(headingLevels(germanHtml))).toEqual([]);
    const anchors = markdownSectionAnchors(germanHtml);
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) expect(anchor.trim()).not.toBe("");
    // A German page is its own document, not the English one re-served.
    expect(germanHtml).not.toBe(await html([ENGLISH, "about"]));
  });

  it("resolves every destination the German pages render, inside the owning publication", async () => {
    const resolve = async (slug: string) => {
      const page = pages.find((candidate) => candidate.id === slug);
      const authored = (page?.representations ?? []).map((representation) => representation.locale.toLowerCase());
      return authored.includes(GERMAN) || authored.includes(ENGLISH) ? page : null;
    };
    // R04-C22-R02 — THE RETIRED-LINK ALLOWANCE IS GONE, NOT NARROWED.
    //
    // Until R04-C22 this test excused the German Home's two authored `/ww/de/about` links from resolution and
    // pinned them as the exact orphan set (the R04-C7 finding). The owner-ordered repair changed both authored
    // `href` values to this publication's own German About Page, so nothing is excused any more: BOTH German
    // pages must render ZERO unresolved internal destinations, and the retired tree must not reappear.
    for (const segments of [[GERMAN], [GERMAN, "about"]]) {
      const document = await html(segments);
      const unresolved = await unresolvedDestinations(document, resolve, {
        prefixes: [`/${GERMAN}`],
        homeSlug: HOME_CONTENT_SLUG,
      });
      expect(unresolved, `/${segments.join("/")} renders no unresolvable destination`).toEqual([]);
      for (const match of document.matchAll(/href="(\/[^"#?]*)/g)) {
        const href = match[1];
        expect(href, "an internal destination stays inside this owner").toMatch(
          new RegExp(`^/(${GERMAN}|${ENGLISH})(/|$)`),
        );
      }
    }

    // The German Home's editorial About actions address its OWN German About Page, and never a retired route:
    // the repair is stated where the links are authored, so a regression cannot hide behind resolution alone.
    const germanHome = await html([GERMAN]);
    const aboutDestinations = [...germanHome.matchAll(/href="([^"#?]*\/about)"/g)].map((match) => match[1]);
    expect(aboutDestinations.length, "the German Home still links to its German About Page").toBeGreaterThanOrEqual(2);
    expect(new Set(aboutDestinations), "every About destination is this owner's German Page").toEqual(
      new Set([`/${GERMAN}/about`]),
    );
  });

  it("speaks German in German metadata, with a truthful alternate map", async () => {
    const german = await view([GERMAN]);
    expect(String(efsTitle(german)).trim()).not.toBe("");
    expect(String(efsDescription(german) ?? "").trim()).not.toBe("");
    // A PUBLIC representation is indexable, and its canonical URL is its own German one.
    expect(efsRobots(german)).toBeUndefined();
    expect(german.canonical).toContain(`/${GERMAN}`);
    const languages = efsLanguageAlternates(german) ?? {};
    expect(Object.keys(languages).map((key) => key.toLowerCase()).sort()).toEqual(
      [ENGLISH, GERMAN, "x-default"].sort(),
    );
    // Both alternates are this owner's own URLs, and x-default is the default language.
    for (const href of Object.values(languages)) expect(href.startsWith(host) || href.startsWith(`https://${host}`)).toBe(true);
    expect(String(languages["x-default"])).toContain(`/${ENGLISH}`);
    // The English representation is a different canonical URL, not the German one re-labelled.
    const english = await view([ENGLISH]);
    expect(english.canonical).not.toBe(german.canonical);
    expect(String(efsTitle(english)).trim()).not.toBe("");
  });
});
