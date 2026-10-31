import { describe, expect, it, vi } from "vitest";

// R04-C7 — RE-EXPRESSION OF `r1c-reference-sites`.
//
// ORIGINAL INTENT, kept: independent page trees and language sets per publication, the Germany Berlin
// and Frankfurt Pages isolated from the reference's Pages, no Site selector where there is nothing to
// select, correct dictionary ownership, and correct public routing.
//
// WHAT RETIRED IT: the original asserted the geographic presentation model — Site `ww` beside Site `de`
// inside ONE Spoke, per-site country canonical variants, `/ww/…` and `/de/de/…` routes,
// `regionsForSite`/`specifiedDestination` over `ww`/`de` codes, and a Site control that preserved the
// route. M18 already moved Germany into its own Spoke; both Spokes now publish the descriptive Site code
// `main`, and isolation derives from the owning Entity, Facet and binding — never from a country code.
//
// WHAT REPLACES IT: the same capabilities as Entity → Facet → Site → Page → localized representation
// proofs, including the NEGATIVE isolation cases the original had no way to express.
const requested = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => requested.get(key) ?? null }),
}));

import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";

import PageRoute from "@/app/[[...segments]]/page";
import { efsViewForCurrentRequest } from "@/app/[[...segments]]/efs-request";
import { loadEfsManifest } from "@/config/efs/manifest";
import { matchBinding, parseContentRoute } from "@/core/efs/publication";

const loaded = loadEfsManifest(path.join(process.cwd(), "deployment", "efs", "manifest.json"));
const manifest = loaded.manifest!;
const [foundationPublication, germanyPublication] = manifest.publications;
const bindingOf = (publication: (typeof manifest.publications)[number]) =>
  publication.bindings.find((binding) => binding.canonical !== false)!;
const foundationBinding = bindingOf(foundationPublication);
const germanyBinding = bindingOf(germanyPublication);
const entityOf = (publication: (typeof manifest.publications)[number]) =>
  manifest.entities.find((entity) => entity.id === publication.entityId)!;
const foundationEntity = entityOf(foundationPublication);
const germanyEntity = entityOf(germanyPublication);
/** The Spoke each publication declares, which the request boundary must confirm. */
const spokeOf = (publication: (typeof manifest.publications)[number]) => publication.spokeId;

function ask(host: string, spokeSegment: string, segments: readonly string[]) {
  requested.set("host", host);
  requested.set("x-foundation-spoke-segment", spokeSegment);
  return segments;
}

const view = async (
  publication: (typeof manifest.publications)[number],
  binding: typeof foundationBinding,
  segments: readonly string[],
) => efsViewForCurrentRequest([...ask(binding.host, spokeOf(publication), segments)]);

const html = async (
  publication: (typeof manifest.publications)[number],
  binding: typeof foundationBinding,
  segments: readonly string[],
) =>
  renderToStaticMarkup(
    await PageRoute({ params: Promise.resolve({ segments: [...ask(binding.host, spokeOf(publication), segments)] }) }),
  );

describe("two independent publications, one descriptive Site code", () => {
  it("publishes ONE Entity → Facet → Site per Spoke, with `main` on both sides", () => {
    expect(manifest.publications).toHaveLength(2);
    expect(foundationPublication.entityId).not.toBe(germanyPublication.entityId);
    expect(foundationEntity.facets).toHaveLength(1);
    expect(germanyEntity.facets).toHaveLength(1);
    // The SAME descriptive code on both sides…

    expect(foundationEntity.facets[0].sites.map((site) => site.id)).toEqual(["main"]);
    expect(germanyEntity.facets[0].sites.map((site) => site.id)).toEqual(["main"]);
    // …each bound by its own publication, on its own origin.
    expect([...foundationBinding.siteIds]).toEqual(["main"]);
    expect([...germanyBinding.siteIds]).toEqual(["main"]);
    expect(foundationBinding.host).not.toBe(germanyBinding.host);
  });

  it("tells the two `main` Sites apart by OWNERSHIP, never by the shared name", () => {
    const foundationRoute = matchBinding(foundationBinding.host, "/en-001/about", [foundationBinding]);
    const germanyRoute = matchBinding(germanyBinding.host, "/de-de/berlin", [germanyBinding]);
    expect(foundationRoute).not.toBeNull();
    expect(germanyRoute).not.toBeNull();
    const foundationContent = parseContentRoute(foundationRoute!.binding, foundationRoute!.remaining);
    const germanyContent = parseContentRoute(germanyRoute!.binding, germanyRoute!.remaining);
    expect(foundationContent.kind).toBe("route");
    expect(germanyContent.kind).toBe("route");
    if (foundationContent.kind !== "route" || germanyContent.kind !== "route") return;
    // Both routes name Site `main`; what separates them is the Entity/Facet that owns the binding.
    expect(foundationContent.route.siteId).toBe("main");
    expect(germanyContent.route.siteId).toBe("main");
    expect(foundationRoute!.binding.entityId).toBe(foundationPublication.entityId);
    expect(germanyRoute!.binding.entityId).toBe(germanyPublication.entityId);
    expect(foundationRoute!.binding.facetId).toBe(foundationPublication.facetId);
    expect(germanyRoute!.binding.facetId).toBe(germanyPublication.facetId);
  });

  it("keeps its own Pages, languages and origin on each side", () => {
    const pagesOf = (entity: typeof foundationEntity) =>
      entity.facets[0].sites[0].pages.map((page) => page.id).sort();
    expect(pagesOf(foundationEntity)).toEqual(["about", "contact", "home"]);
    expect(pagesOf(germanyEntity)).toEqual(["about", "berlin", "frankfurt", "home"]);
    // Both publish the same two QUALIFIED languages; neither falls back to a country variant. Each
    // publication keeps its OWN default — the reference English, Germany German — and neither default is
    // inferred from geography, it is declared.
    for (const binding of [foundationBinding, germanyBinding]) {
      expect([...binding.locales].map((locale) => locale.toLowerCase()).sort()).toEqual(["de-de", "en-001"]);
    }
    expect(foundationBinding.defaultLocale.toLowerCase()).toBe("en-001");
    expect(germanyBinding.defaultLocale.toLowerCase()).toBe("de-de");
  });

  it("routes each owner's Pages and REFUSES the other owner's", async () => {
    // Positive: each owner serves its own German Pages.
    expect(await view(foundationPublication, foundationBinding, ["de-de", "about"])).not.toBeNull();
    const berlin = await view(germanyPublication, germanyBinding, ["de-de", "berlin"]);
    expect(berlin).not.toBeNull();
    expect(berlin!.entity.id).toBe(germanyPublication.entityId);
    expect(berlin!.site.id).toBe("main");
    expect(berlin!.localeKey).toBe("de-de");
    expect(berlin!.canonical).toContain(germanyBinding.host);
    const berlinHtml = await html(germanyPublication, germanyBinding, ["de-de", "berlin"]);
    expect(berlinHtml.match(/<h1\b/g) ?? []).toHaveLength(1);

    // Negative isolation: Berlin exists only under the Germany Entity, and `contact` only under the
    // reference Entity, so neither can be reached through the other's ownership.
    await expect(
      PageRoute({ params: Promise.resolve({ segments: [...ask(foundationBinding.host, spokeOf(foundationPublication), ["de-de", "berlin"])] }) }),
    ).rejects.toThrow();
    await expect(
      PageRoute({ params: Promise.resolve({ segments: [...ask(germanyBinding.host, spokeOf(germanyPublication), ["de-de", "contact"])] }) }),
    ).rejects.toThrow();
    // The Pages are not merely unroutable: they are absent from the other Entity's tree.
    expect(germanyEntity.facets[0].sites[0].pages.some((page) => page.id === "contact")).toBe(false);
    expect(foundationEntity.facets[0].sites[0].pages.some((page) => page.id === "berlin")).toBe(false);
  });

  it("offers NO Site control, because each publication declares exactly one Site", () => {
    for (const binding of [foundationBinding, germanyBinding]) {
      // A selector needs at least two candidates; there is only ever one, so the retired geographic
      // Site control has nothing to select and is not part of the accepted model.
      expect(new Set(binding.siteIds).size).toBe(1);
      // And no retired geographic code survives as a Site identity.
      for (const siteId of binding.siteIds) expect(["ww", "de", "en"]).not.toContain(siteId);
    }
  });

  it("completes no language implicitly from geography", async () => {
    // A bare country code is not a locale on EITHER origin, and no page is invented for one.
    for (const [publication, binding] of [
      [foundationPublication, foundationBinding],
      [germanyPublication, germanyBinding],
    ] as const) {
      await expect(
        PageRoute({ params: Promise.resolve({ segments: [...ask(binding.host, spokeOf(publication), ["de"])] }) }),
      ).rejects.toThrow();
      // The Germany owner serves German under the qualified key only.
      const german = await view(publication, binding, ["de-de"]);
      expect(german).not.toBeNull();
      expect(german!.localeKey).toBe("de-de");
    }
  });

  it("keeps German and English representations independent on the Germany side too", async () => {
    const english = await view(germanyPublication, germanyBinding, ["en-001", "frankfurt"]);
    const german = await view(germanyPublication, germanyBinding, ["de-de", "frankfurt"]);
    expect(english!.page.id).toBe("frankfurt");
    expect(german!.page.id).toBe("frankfurt");
    expect(english!.canonical).not.toBe(german!.canonical);
    expect(english!.localeKey).toBe("en-001");
    expect(german!.localeKey).toBe("de-de");
  });
});
