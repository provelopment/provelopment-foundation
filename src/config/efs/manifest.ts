/**
 * THE EFS CANDIDATE DECLARATION (`D31`, Amendment 06)
 * ==================================================
 *
 * One explicit manifest declares the five ownership levels, their optional properties, the
 * Page representations and the publication bindings. Nothing is inferred from a release's
 * folder shape, hostname, Site name or URL.
 *
 * This is E1 candidate configuration, not a released schema. It is intentionally small and
 * validated rather than permissive: duplicate, orphaned, geographic or ambiguous declarations
 * fail closed before runtime.
 */
import { readFileSync } from "node:fs";

import { entityIdIssue } from "@/core/efs/identity";
import { canonicalLocaleTag, publicationLocaleIssue, type PublicationLocaleIssue } from "@/core/efs/locales";
import { resolveProperties, type PropertyBag } from "@/core/efs/properties";
import { typedPropertyIssue } from "@/core/efs/property-contract";
import { OPEN_GRAPH_IMAGE_SEGMENT } from "@/config/efs/image-path";
import {
  bindingIssues,
  normalizePrefix,
  type EfsBinding,
  type EfsSiteMode,
} from "@/core/efs/publication";
import { siteIdIssue } from "@/core/site-identity";
import { IMPLICIT_SPOKE_HUB_ID, IMPLICIT_SPOKE_ID } from "@/core/spoke";

/**
 * ONE diagnosis for a locale that may not be PUBLISHED (`GEO-03` R04 §5).
 *
 * The two failures stay distinct on purpose. A MALFORMED tag is a spelling fault, while an
 * UNQUALIFIED tag is a perfectly valid language that does not say WHICH authored representation is
 * meant. Collapsing them would tell an author to fix the wrong thing: `de` needs a region, not a
 * spelling repair. Browser preferences are a different question and stay bare-friendly.
 */
function publicationLocaleDiagnosis(issue: PublicationLocaleIssue): string {
  return issue.kind === "malformed"
    ? issue.reason
    : `${issue.reason} A published representation is qualified by an authored script or region ` +
        '("en-001", "de-DE", "zh-Hans"); a browser preference may still be bare.';
}

/** One localized representation declared inside a Page. */
export interface EfsRepresentationDeclaration {
  readonly locale: string;
  readonly fallbackLocaleKey?: string;
  readonly properties?: PropertyBag;
}

/**
 * One Page, language-neutral and identified independently of its route.
 *
 * Publication visibility is NOT declared here. It belongs to the localized source document that
 * answers each representation, exactly as the released Page-document contract defines. Keeping a
 * second Page-level answer here would let the manifest advertise a representation the document
 * marks unlisted (or hide one it marks public).
 */
export interface EfsPageDeclaration {
  readonly id: string;
  readonly route: readonly string[];
  readonly fallbackLocaleKey?: string;
  readonly properties?: PropertyBag;
  readonly representations: readonly EfsRepresentationDeclaration[];
}

/** One Site inside exactly one Facet. */
export interface EfsSiteDeclaration {
  readonly id: string;
  readonly properties?: PropertyBag;
  readonly pages: readonly EfsPageDeclaration[];
}

/** One Facet inside exactly one Entity. */
export interface EfsFacetDeclaration {
  readonly id: string;
  readonly properties?: PropertyBag;
  readonly sites: readonly EfsSiteDeclaration[];
}

/** One Entity and its owned content. */
export interface EfsEntityDeclaration {
  readonly id: string;
  readonly properties?: PropertyBag;
  readonly facets: readonly EfsFacetDeclaration[];
}

/** One explicit Spoke<->Entity publication with its bindings. */
export interface EfsPublicationDeclaration {
  readonly id: string;
  /**
   * The Spoke that OWNS this publication. A publication is never attached to a Spoke by a
   * hostname, a URL prefix, a matching name or an Entity/Facet name.
   */
  readonly spokeId: string;
  /** The owning Spoke Hub when the Installation identifies its Hubs; absent in flat form. */
  readonly spokeHubId?: string;
  /**
   * The presentation Site inside the owning Spoke's configuration, chosen EXPLICITLY. It supplies
   * the approved shared shell (dictionary, navigation, footer, branding, layouts, accessibility).
   * Absent means the EFS-only document boundary is used. It is never inferred from a prefix.
   */
  readonly presentationSiteCode?: string;
  readonly entityId: string;
  readonly facetId: string;
  readonly bindings: readonly EfsBinding[];
}

/** The complete candidate manifest. */
export interface EfsManifest {
  readonly entities: readonly EfsEntityDeclaration[];
  readonly publications: readonly EfsPublicationDeclaration[];
}

/** Validation outcome; the caller refuses to publish when `issues` is non-empty. */
export interface EfsManifestResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly manifest?: EfsManifest;
}

const FACET_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arrayOf<T>(value: unknown, label: string, issues: string[]): readonly T[] {
  if (!Array.isArray(value)) {
    issues.push(`${label} must be an array.`);
    return [];
  }
  return value as T[];
}

function text(value: unknown, label: string, issues: string[]): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${label} must be a non-empty string.`);
    return "";
  }
  return value;
}

function propertyBag(value: unknown, label: string, issues: string[]): PropertyBag | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push(`${label} properties must be an object.`);
    return undefined;
  }
  // Typed keys carry a contract beyond the generic cascade validation (`D40` Decision A). A
  // malformed `timezone` or `openingSchedule` fails HERE, before anything is published, rather
  // than degrading into a missing value at render time.
  for (const [key, declaration] of Object.entries(value)) {
    if (declaration === null) continue; // explicit suppression: no value to validate
    if (!isRecord(declaration)) continue; // the generic cascade reports the shape issue
    const issue = typedPropertyIssue(key, declaration.value);
    if (issue) issues.push(`${label}.properties["${key}"]: ${issue}`);
  }
  return value as PropertyBag;
}

function routeSegments(value: unknown, label: string, issues: string[]): readonly string[] {
  const segments = arrayOf<unknown>(value, label, issues);
  if (segments.length === 0) {
    issues.push(`${label} must contain at least one route segment.`);
    return [];
  }
  const parsed = segments.map((segment) => {
    if (typeof segment !== "string" || segment.length === 0 || /[/\\%]/.test(segment)) {
      issues.push(`${label} has an unsafe route segment.`);
      return "";
    }
    return segment;
  });
  // R04-C21-R02 (finding F3) — THE RESERVED IMAGE SUFFIX IS NOT A PAGE ROUTE.
  //
  // `…/opengraph-image` is the site/locale social-card ENDPOINT (`@/config/efs/image-path`). A Page whose route
  // ENDS in that segment would be shadowed by the image dispatch — and in the site-open shape the same URL is
  // `/<prefix>/<site>/<locale>/opengraph-image`, so both shapes collide — leaving an author with a declared
  // Page that silently never renders. The rule is therefore refused HERE, at validation, before publication,
  // and only for this terminal segment: every other route, nested or not, keeps validating exactly as it did.
  if (parsed[parsed.length - 1] === OPEN_GRAPH_IMAGE_SEGMENT) {
    issues.push(
      `${label} may not end in the reserved Open Graph image segment "${OPEN_GRAPH_IMAGE_SEGMENT}": ` +
        `that URL names an image endpoint, not a Page route, and the Page would never be served.`,
    );
  }
  return parsed;
}

/**
 * Validate a candidate manifest in one pass. Every issue names its path; no invalid value is
 * repaired into something that looks authored.
 */
export function validateEfsManifest(input: unknown): EfsManifestResult {
  if (!isRecord(input)) return { ok: false, issues: ["The EFS manifest must be an object."] };

  const issues: string[] = [];
  const entities: EfsEntityDeclaration[] = [];
  const entityIds = new Set<string>();
  const sitesByFacet = new Map<string, Map<string, EfsSiteDeclaration>>();

  for (const [entityIndex, rawEntity] of arrayOf<unknown>(input.entities, "entities", issues).entries()) {
    const at = `entities[${entityIndex}]`;
    if (!isRecord(rawEntity)) {
      issues.push(`${at} must be an object.`);
      continue;
    }
    const id = text(rawEntity.id, `${at}.id`, issues);
    const idIssue = entityIdIssue(id);
    if (idIssue) issues.push(`${at}.id: ${idIssue}`);
    if (entityIds.has(id)) issues.push(`${at}.id duplicates Entity "${id}".`);
    entityIds.add(id);
    const entityProperties = propertyBag(rawEntity.properties, at, issues);

    const facets: EfsFacetDeclaration[] = [];
    for (const [facetIndex, rawFacet] of arrayOf<unknown>(rawEntity.facets, `${at}.facets`, issues).entries()) {
      const facetAt = `${at}.facets[${facetIndex}]`;
      if (!isRecord(rawFacet)) {
        issues.push(`${facetAt} must be an object.`);
        continue;
      }
      const facetId = text(rawFacet.id, `${facetAt}.id`, issues);
      if (!FACET_ID_PATTERN.test(facetId)) issues.push(`${facetAt}.id is not a content-slug FacetID.`);
      const facetProperties = propertyBag(rawFacet.properties, facetAt, issues);

      const sites: EfsSiteDeclaration[] = [];
      const siteIndexByName = new Map<string, EfsSiteDeclaration>();
      const siteIds = new Set<string>();
      for (const [siteIndex, rawSite] of arrayOf<unknown>(rawFacet.sites, `${facetAt}.sites`, issues).entries()) {
        const siteAt = `${facetAt}.sites[${siteIndex}]`;
        if (!isRecord(rawSite)) {
          issues.push(`${siteAt} must be an object.`);
          continue;
        }
        const siteId = text(rawSite.id, `${siteAt}.id`, issues);
        const siteIssue = siteIdIssue(siteId);
        if (siteIssue) issues.push(`${siteAt}.id: ${siteIssue}`);
        if (siteIds.has(siteId)) issues.push(`${siteAt}.id duplicates Site "${siteId}" in its Facet.`);
        siteIds.add(siteId);
        const siteProperties = propertyBag(rawSite.properties, siteAt, issues);

        const pages: EfsPageDeclaration[] = [];
        const pageIds = new Set<string>();
        for (const [pageIndex, rawPage] of arrayOf<unknown>(rawSite.pages, `${siteAt}.pages`, issues).entries()) {
          const pageAt = `${siteAt}.pages[${pageIndex}]`;
          if (!isRecord(rawPage)) {
            issues.push(`${pageAt} must be an object.`);
            continue;
          }
          const pageId = text(rawPage.id, `${pageAt}.id`, issues);
          if (!FACET_ID_PATTERN.test(pageId)) issues.push(`${pageAt}.id is not a content-slug PageID.`);
          if (pageIds.has(pageId)) issues.push(`${pageAt}.id duplicates Page "${pageId}" in its Site.`);
          pageIds.add(pageId);
          const route = routeSegments(rawPage.route, `${pageAt}.route`, issues);
          if (rawPage.visibility !== undefined) {
            issues.push(
              `${pageAt}.visibility is not an EFS manifest property: publication visibility belongs ` +
                "to the localized JSON Page document that answers each representation.",
            );
          }
          const pageProperties = propertyBag(rawPage.properties, pageAt, issues);

          const representations: EfsRepresentationDeclaration[] = [];
          const localeKeys = new Set<string>();
          for (const [representationIndex, rawRepresentation] of arrayOf<unknown>(
            rawPage.representations,
            `${pageAt}.representations`,
            issues,
          ).entries()) {
            const representationAt = `${pageAt}.representations[${representationIndex}]`;
            if (!isRecord(rawRepresentation)) {
              issues.push(`${representationAt} must be an object.`);
              continue;
            }
            const localeValue = text(rawRepresentation.locale, `${representationAt}.locale`, issues);
            const localeIssue = publicationLocaleIssue(localeValue);
            if (localeIssue) issues.push(`${representationAt}.locale: ${publicationLocaleDiagnosis(localeIssue)}`);
            let locale = localeValue;
            try {
              locale = canonicalLocaleTag(localeValue);
            } catch {
              // The issue above already records the invalid tag.
            }
            const key = localeValue.length > 0 ? localeValue.toLowerCase() : "";
            if (localeKeys.has(key)) issues.push(`${representationAt}.locale duplicates "${key}".`);
            localeKeys.add(key);
            representations.push({
              locale,
              fallbackLocaleKey: rawRepresentation.fallbackLocaleKey as string | undefined,
              properties: propertyBag(rawRepresentation.properties, representationAt, issues),
            });
          }
          if (representations.length === 0) issues.push(`${pageAt} must declare a representation.`);
          const fallback = rawPage.fallbackLocaleKey;
          if (fallback !== undefined && (typeof fallback !== "string" || !localeKeys.has(fallback.toLowerCase()))) {
            issues.push(`${pageAt}.fallbackLocaleKey must name an existing representation.`);
          }
          pages.push({
            id: pageId,
            route,
            fallbackLocaleKey: fallback as string | undefined,
            properties: pageProperties,
            representations,
          });
        }

        const site: EfsSiteDeclaration = { id: siteId, properties: siteProperties, pages };
        sites.push(site);
        siteIndexByName.set(siteId, site);
      }

      facets.push({ id: facetId, properties: facetProperties, sites });
      sitesByFacet.set(`${id}/${facetId}`, siteIndexByName);
    }

    entities.push({ id, properties: entityProperties, facets });
  }


  for (const entity of entities) {
    for (const facet of entity.facets) {
      for (const site of facet.sites) {
        for (const page of site.pages) {
          try {
            resolveProperties([
              { level: "entity", id: entity.id, properties: entity.properties },
              { level: "facet", id: facet.id, properties: facet.properties },
              { level: "site", id: site.id, properties: site.properties },
              { level: "page", id: page.id, properties: page.properties },
            ]);
            for (const representation of page.representations) {
              resolveProperties([
                { level: "entity", id: entity.id, properties: entity.properties },
                { level: "facet", id: facet.id, properties: facet.properties },
                { level: "site", id: site.id, properties: site.properties },
                { level: "page", id: page.id, properties: page.properties },
                {
                  level: "representation",
                  id: representation.locale,
                  properties: representation.properties,
                },
              ]);
            }
          } catch (error) {
            issues.push(
              `${entity.id}/${facet.id}/${site.id}/${page.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    }
  }

  const publications: EfsPublicationDeclaration[] = [];
  const publicationIds = new Set<string>();
  const allBindings: EfsBinding[] = [];

  for (const [publicationIndex, rawPublication] of arrayOf<unknown>(
    input.publications,
    "publications",
    issues,
  ).entries()) {
    const at = `publications[${publicationIndex}]`;
    if (!isRecord(rawPublication)) {
      issues.push(`${at} must be an object.`);
      continue;
    }
    const publicationId = text(rawPublication.id, `${at}.id`, issues);
    if (publicationIds.has(publicationId)) issues.push(`${at}.id duplicates publication "${publicationId}".`);
    publicationIds.add(publicationId);
    const entityId = text(rawPublication.entityId, `${at}.entityId`, issues);
    const facetId = text(rawPublication.facetId, `${at}.facetId`, issues);
    if (!entityIds.has(entityId)) issues.push(`${at}.entityId does not name a declared Entity.`);
    const siteMap = sitesByFacet.get(`${entityId}/${facetId}`);
    if (!siteMap) issues.push(`${at}.facetId does not name a declared Facet of that Entity.`);

    // OWNERSHIP IS EXPLICIT. A publication names its Spoke (and, in an identified-Hub
    // Installation, its Spoke Hub). Hostnames, prefixes and matching names are never substituted.
    const spokeId = text(rawPublication.spokeId, `${at}.spokeId`, issues);
    if (spokeId.trim() === IMPLICIT_SPOKE_ID) {
      issues.push(`${at}.spokeId cannot declare the reserved implicit Spoke.`);
    }
    const spokeHubId =
      rawPublication.spokeHubId === undefined
        ? undefined
        : text(rawPublication.spokeHubId, `${at}.spokeHubId`, issues);
    if (spokeHubId?.trim() === IMPLICIT_SPOKE_HUB_ID) {
      issues.push(`${at}.spokeHubId cannot declare the reserved implicit Spoke Hub.`);
    }
    const presentationSiteCode =
      rawPublication.presentationSiteCode === undefined
        ? undefined
        : text(rawPublication.presentationSiteCode, `${at}.presentationSiteCode`, issues);
    // The presentation identity is a DESCRIPTIVE KEY, checked by the one Site-ID grammar. Whether it
    // names a Site the owning Spoke actually declares needs the Spoke's configuration, so that half is
    // checked at establishment (`GEO-03` R04 §6), never while a Page renders.
    if (presentationSiteCode !== undefined) {
      const presentationIssue = siteIdIssue(presentationSiteCode);
      if (presentationIssue) issues.push(`${at}.presentationSiteCode: ${presentationIssue}`);
    }

    const bindings: EfsBinding[] = [];
    for (const [bindingIndex, rawBinding] of arrayOf<unknown>(
      rawPublication.bindings,
      `${at}.bindings`,
      issues,
    ).entries()) {
      const bindingAt = `${at}.bindings[${bindingIndex}]`;
      if (!isRecord(rawBinding)) {
        issues.push(`${bindingAt} must be an object.`);
        continue;
      }
      const siteIds = arrayOf<unknown>(rawBinding.siteIds, `${bindingAt}.siteIds`, issues).map((site) =>
        text(site, `${bindingAt}.siteIds[]`, issues),
      );
      for (const siteId of siteIds) {
        if (!siteMap?.has(siteId)) issues.push(`${bindingAt} names Site "${siteId}" outside its Facet.`);
      }
      const locales = arrayOf<unknown>(rawBinding.locales, `${bindingAt}.locales`, issues).map((locale) =>
        text(locale, `${bindingAt}.locales[]`, issues),
      );
      // A binding PUBLISHES the locales it lists (`GEO-03` R04 §5): each must identify a qualified
      // authored representation, so a bare language is refused here rather than served.
      for (const locale of locales) {
        const localeIssue = publicationLocaleIssue(locale);
        if (localeIssue) {
          issues.push(`${bindingAt}.locales[]: ${publicationLocaleDiagnosis(localeIssue)}`);
        }
      }
      const defaultLocale = text(rawBinding.defaultLocale, `${bindingAt}.defaultLocale`, issues);
      const defaultLocaleIssue = publicationLocaleIssue(defaultLocale);
      if (defaultLocaleIssue) {
        issues.push(`${bindingAt}.defaultLocale: ${publicationLocaleDiagnosis(defaultLocaleIssue)}`);
      }
      const siteMode =
        rawBinding.siteMode === "open" ? "open" : rawBinding.siteMode === "closed" ? "closed" : "";
      if (!siteMode) issues.push(`${bindingAt}.siteMode must be "closed" or "open".`);
      let prefix: readonly string[] = [];
      try {
        prefix = normalizePrefix(
          arrayOf<unknown>(rawBinding.prefix, `${bindingAt}.prefix`, issues).map((segment) =>
            text(segment, `${bindingAt}.prefix[]`, issues),
          ),
        );
      } catch (error) {
        issues.push(
          `${bindingAt}.prefix: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const binding: EfsBinding = {
        id: text(rawBinding.id, `${bindingAt}.id`, issues),
        host: text(rawBinding.host, `${bindingAt}.host`, issues),
        prefix,
        entityId,
        facetId,
        siteIds,
        siteMode: siteMode as EfsSiteMode,
        defaultSiteId: rawBinding.defaultSiteId as string | undefined,
        locales,
        defaultLocale,
        canonical: rawBinding.canonical as boolean | undefined,
        aliasOf: rawBinding.aliasOf as string | undefined,
      };
      bindings.push(binding);
      allBindings.push(binding);
    }
    publications.push({
      id: publicationId,
      spokeId,
      spokeHubId,
      presentationSiteCode,
      entityId,
      facetId,
      bindings,
    });
  }

  issues.push(...bindingIssues(allBindings));

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, issues: [], manifest: { entities, publications } };
}

/** Load and validate one manifest file. */
export function loadEfsManifest(path: string): EfsManifestResult {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return validateEfsManifest(parsed);
  } catch (error) {
    return {
      ok: false,
      issues: [`Cannot load EFS manifest: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
