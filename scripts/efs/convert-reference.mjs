/**
 * CONTROLLED REFERENCE CONVERSION (`S3-E3-R02`)
 * =============================================
 *
 * Converts the template's own controlled reference Spokes into the explicit
 * Entity -> Facet -> Site -> Page -> representation capsule. It reads the released
 * Spoke content only; it never writes into `deployment/spokes/**`. The generated
 * manifest and capsule are committed, so the runtime does not depend on this script.
 *
 * Run: node scripts/efs/convert-reference.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DEPLOYMENT = join(ROOT, "deployment");
const EFS = join(DEPLOYMENT, "efs");
const CAPSULE = join(EFS, "capsule");

const entityIdFor = (index) => `e_${String(index).padStart(26, "0")}`;

const SPOKES = [
  {
    index: 1,
    spoke: "foundation",
    facet: "foundation",
    site: "main",
    legacySite: "ww",
    hosts: [
      { host: "foundation-template.provelopment.com", id: "foundation-web" },
      { host: "provelopment-foundation.vercel.app", id: "foundation-inspection" },
    ],
    locales: ["en", "de"],
    defaultLocale: "en",
    pages: [
      { id: "home", route: ["home"], labels: { en: "Home", de: "Start" } },
      { id: "about", route: ["about"], labels: { en: "About", de: "Über uns" } },
    ],
  },
  {
    index: 2,
    spoke: "germany",
    facet: "germany",
    site: "main",
    legacySite: "de",
    hosts: [{ host: "foundation-template-germany.provelopment.com", id: "germany-web" }],
    locales: ["de", "en"],
    defaultLocale: "de",
    pages: [
      { id: "home", route: ["home"], labels: { de: "Start", en: "Home" } },
      { id: "about", route: ["about"], labels: { de: "Über uns", en: "About" } },
      { id: "berlin", route: ["berlin"], labels: { de: "Berlin", en: "Berlin" } },
      { id: "frankfurt", route: ["frankfurt"], labels: { de: "Frankfurt", en: "Frankfurt" } },
    ],
  },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sourceCandidates(spoke, site, page, locale) {
  return [
    join(DEPLOYMENT, "spokes", spoke, "content", "pages", "json", site, locale, `${page}.json`),
    join(DEPLOYMENT, "spokes", spoke, "content", "pages", "markdown", site, locale, `${page}.md`),
  ];
}

function copySource(input, output) {
  mkdirSync(dirname(output), { recursive: true });
  cpSync(input, output);
}

function buildEntity(config, definition) {
  const entityId = entityIdFor(definition.index);
  const site = config.sites.find((candidate) => candidate.code === definition.legacySite);
  if (!site) throw new Error(`Spoke ${definition.spoke} has no Site ${definition.site}.`);

  const pages = definition.pages.map((page) => {
    const representations = [];
    for (const locale of definition.locales) {
      const [json, markdown] = sourceCandidates(definition.spoke, definition.legacySite, page.id, locale);
      const input = existsSync(json) ? json : existsSync(markdown) ? markdown : null;
      if (!input) throw new Error(`Spoke ${definition.spoke} page ${page.id} has no ${locale} source.`);
      const extension = input.endsWith(".json") ? "json" : "md";
      copySource(
        input,
        join(
          CAPSULE,
          entityId,
          definition.facet,
          definition.site,
          "pages",
          page.id,
          `${locale}.${extension}`,
        ),
      );
      representations.push({ locale });
    }
    return {
      id: page.id,
      route: page.route,
      visibility: "public",
      properties: {
        "nav.label": { value: page.labels[definition.defaultLocale], public: true },
        "internal.pageNotes": { value: `conversion:${definition.spoke}/${page.id}`, public: false },
      },
      representations,
    };
  });

  const logoSource = join(DEPLOYMENT, "spokes", definition.spoke, "content", "assets", "placeholders", "logo-header.svg");
  const faviconSource = join(DEPLOYMENT, "spokes", definition.spoke, "content", "assets", "placeholders", "favicon.svg");
  const assetRoot = join(CAPSULE, entityId, definition.facet, "assets", "brand");
  if (existsSync(logoSource)) copySource(logoSource, join(assetRoot, "logo.svg"));
  if (existsSync(faviconSource)) copySource(faviconSource, join(assetRoot, "favicon.svg"));

  return {
    entity: {
      id: entityId,
      properties: {
        "brand.name": { value: config.site.name, public: true },
        "brand.tagline": { value: config.site.tagline ?? "", public: true },
        "brand.description": { value: config.site.description ?? "", public: true },
        "brand.logo": { value: "/brand/logo.svg", public: true },
        "brand.favicon": { value: "/brand/favicon.svg", public: true },
        "contact.email": { value: config.contact?.email ?? "", public: true },
        "internal.ownerNotes": { value: `conversion:${definition.spoke}`, public: false },
      },
      facets: [
        {
          id: definition.facet,
          properties: {
            "internal.facetNotes": { value: `facet:${definition.facet}`, public: false },
          },
          sites: [
            {
              id: definition.site,
              properties: {
                "site.label": { value: site.label, public: true },
                "description.en": { value: config.site.description ?? "", public: true },
                ...Object.fromEntries(
                  (config.i18n?.locales ?? [])
                    .filter((locale) => typeof locale.description === "string")
                    .map((locale) => [
                      `description.${locale.code.toLowerCase()}`,
                      { value: locale.description, public: true },
                    ]),
                ),
              },
              pages,
            },
          ],
        },
      ],
    },
    publication: {
      id: `${definition.spoke}-publication`,
      // Explicit publication ownership and explicit presentation source. Neither is derived from
      // the binding host or URL prefix.
      spokeId: definition.spoke,
      presentationSiteCode: definition.legacySite,
      entityId,
      facetId: definition.facet,
      bindings: definition.hosts.map((host) => ({
        id: host.id,
        host: host.host,
        prefix: [definition.legacySite],
        entityId,
        facetId: definition.facet,
        siteIds: [definition.site],
        siteMode: "closed",
        defaultSiteId: definition.site,
        locales: definition.locales,
        defaultLocale: definition.defaultLocale,
        canonical: true,
      })),
    },
  };
}


function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}

function main() {
  rmSync(CAPSULE, { recursive: true, force: true });
  mkdirSync(EFS, { recursive: true });
  const entities = [];
  const publications = [];
  for (const definition of SPOKES) {
    const config = readJson(join(DEPLOYMENT, "spokes", definition.spoke, "site.config.json"));
    const built = buildEntity(config, definition);
    entities.push(built.entity);
    publications.push(built.publication);
  }
  writeFileSync(
    join(EFS, "manifest.json"),
    `${JSON.stringify({ entities, publications }, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `[efs] converted ${SPOKES.length} Spokes, ${entities.length} Entities, ${walk(CAPSULE).length} capsule files`,
  );
}

main();
