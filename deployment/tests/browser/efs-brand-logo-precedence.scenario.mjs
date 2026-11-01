// deployment/tests/browser/efs-brand-logo-precedence.scenario.mjs
// THE REFERENCE DEPLOYMENT'S BRAND-LOGO SOURCE PRECEDENCE (`D40` Decision C, `R04-C31`).
//
// ONE decision, measured on the SHIPPED publication: the effective, publicly projected EFS `brand.logo` is the
// logo the shared shell renders, the bytes behind it are the owner's authored capsule artwork served from the
// binding's own `owner-assets` address, and the metadata advertises that same address on that publication's OWN
// canonical origin. Nothing from the configured Spoke catalog, another Spoke's namespace or another origin
// appears anywhere in the document.
//
// WHY THIS SCENARIO CANNOT COVER ALL FOUR STATES. The other three — absent-with-configured-fallback, private and
// explicit-`null` suppression — need AUTHORED capsule or Spoke configuration this run may not write (`§4`/`§51`),
// so they are proved at the composition layer against real render output in
// `tests/unit/efs-shell-source-precedence.test.tsx`. What only a real server can prove is here: the published
// artwork's real URL, its real bytes and the real metadata.
//
// HOW IT IS RUN. `pnpm test:browser` discovers every `*.scenario.mjs` in this directory and calls
// `run(chrome, harness)`. Its subject is the SHIPPED deployment, so it starts the dev server WITHOUT the
// synthetic override and reads (never writes) the deployment's own files.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FOUNDATION_HOST,
  GERMANY_HOST,
  requestWithHost,
  waitForHostReady,
} from "../support/host-requests.mjs";

/** The scenario's id, used as the report's `presentation` label. */
export const id = "efs-brand-logo-precedence";

/** The one owner-assets address a published `brand.logo` resolves to on a dedicated-root binding. */
const LOGO_PATH = "/owner-assets/brand/logo.svg";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Every authored `brand.logo` file this deployment publishes, as content hashes (read-only). */
function authoredLogoHashes() {
  const capsule = path.resolve(dirname, "..", "..", "efs", "capsule");
  const hashes = [];
  for (const entity of readdirSync(capsule, { withFileTypes: true })) {
    if (!entity.isDirectory()) continue;
    for (const owner of readdirSync(path.join(capsule, entity.name), { withFileTypes: true })) {
      if (!owner.isDirectory()) continue;
      const file = path.join(capsule, entity.name, owner.name, "assets", "brand", "logo.svg");
      try {
        hashes.push(createHash("sha256").update(readFileSync(file)).digest("hex"));
      } catch {
        /* this owner publishes no brand logo */
      }
    }
  }
  return hashes;
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** The `<picture>` the header's brand slot renders, or `""`. */
const logoPicture = (html) =>
  /<picture class="ui-site-header-logo-frame"[^>]*>([\s\S]*?)<\/picture>/.exec(html)?.[0] ?? "";

/** Every `logo` node the page's JSON-LD declares. */
function jsonLdLogos(html) {
  const logos = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const node = JSON.parse(match[1]);
      if (node?.logo) logos.push(node.logo);
    } catch {
      /* not a JSON-LD node this check reads */
    }
  }
  return logos;
}

export async function run(chrome, harness) {
  const { port: portFor, check, startDevServer, stopServer } = harness;

  const rows = [];
  const port = portFor(412);
  const server = startDevServer(port, { synthetic: false });
  const request = (host, pathname) => requestWithHost(port, host, pathname);

  try {
    await waitForHostReady(port, FOUNDATION_HOST, "/en-001", server);
    const authored = authoredLogoHashes();
    check(rows, "brandLogo.fixture.authoredCapsuleArtworkFound", authored.length > 0, String(authored.length));

    // ── 1. THE SHARED SHELL RENDERS THE EFS ARTWORK — and nothing of a losing source ───────────────
    const page = await request(FOUNDATION_HOST, "/en-001");
    const html = page.body;
    const picture = logoPicture(html);
    check(rows, "brandLogo.header.is200", page.status === 200, String(page.status));
    check(rows, "brandLogo.header.picturePresent", picture !== "", picture.slice(0, 120));
    check(
      rows,
      "brandLogo.header.ownerAssetsSource",
      picture.includes(`src="${LOGO_PATH}"`),
      picture.replace(/\s+/g, " ").slice(0, 200),
    );
    // An EFS logo is a single identity: the configured compact alternate of a losing source must not appear.
    check(rows, "brandLogo.header.noCompactAlternate", !picture.includes("<source"), picture.slice(0, 160));
    check(rows, "brandLogo.header.accessibleName", /<img[^>]*alt="[^"]+"/.test(picture), picture.slice(0, 160));
    // No configured catalog artwork and no other Spoke's namespace anywhere in the document.
    check(rows, "brandLogo.header.noConfiguredCatalogArt", !html.includes("/assets/logo-header.svg"), "searched");
    check(rows, "brandLogo.isolation.noForeignNamespace", !html.includes("/spokes/germany/"), "searched");

    // ── 2. THE REAL BYTES are the owner's authored capsule artwork, served owner-scoped ─────────────
    const asset = await request(FOUNDATION_HOST, LOGO_PATH);
    check(rows, "brandLogo.asset.is200", asset.status === 200, String(asset.status));
    check(
      rows,
      "brandLogo.asset.isSvg",
      String(asset.headers["content-type"] ?? "").includes("image/svg+xml"),
      String(asset.headers["content-type"] ?? ""),
    );
    check(
      rows,
      "brandLogo.asset.bytesAreAuthoredArtwork",
      authored.includes(sha256(asset.body)),
      sha256(asset.body).slice(0, 16),
    );
    // …and the namespace serves ONLY authored artwork: an unpublished name is refused, never resolved.
    const missing = await request(FOUNDATION_HOST, "/owner-assets/brand/not-published.svg");
    check(rows, "brandLogo.asset.unpublishedRefused", missing.status === 404, String(missing.status));

    // ── 3. THE METADATA carries the SAME address, on THIS publication's canonical origin ─────────────
    const logos = jsonLdLogos(html);
    check(rows, "brandLogo.metadata.singleLogo", logos.length === 1, JSON.stringify(logos));
    check(
      rows,
      "brandLogo.metadata.canonicalOwnerUrl",
      logos[0]?.url === `https://${FOUNDATION_HOST}${LOGO_PATH}`,
      JSON.stringify(logos[0] ?? null),
    );

    // ── 4. A SECOND OWNER keeps its OWN origin and its own artwork ─────────────────────────────────
    const germany = await request(GERMANY_HOST, "/de-de");
    const germanyLogos = jsonLdLogos(germany.body);
    check(rows, "brandLogo.germany.is200", germany.status === 200, String(germany.status));
    check(
      rows,
      "brandLogo.germany.ownCanonicalOrigin",
      germanyLogos[0]?.url === `https://${GERMANY_HOST}${LOGO_PATH}`,
      JSON.stringify(germanyLogos[0] ?? null),
    );
    check(
      rows,
      "brandLogo.germany.headerUsesOwnerAssets",
      logoPicture(germany.body).includes(`src="${LOGO_PATH}"`),
      logoPicture(germany.body).replace(/\s+/g, " ").slice(0, 160),
    );
    const germanyAsset = await request(GERMANY_HOST, LOGO_PATH);
    check(
      rows,
      "brandLogo.germany.assetServed",
      germanyAsset.status === 200 && authored.includes(sha256(germanyAsset.body)),
      `${germanyAsset.status} ${sha256(germanyAsset.body).slice(0, 16)}`,
    );

    // ── 5. THE D42 CARD AND THE D40-B CONTRACT ARE UNTOUCHED (this change is logo precedence only) ───
    const ogImage = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1] ?? "";
    check(
      rows,
      "brandLogo.d42.ogImageStillTheReservedCard",
      ogImage === `https://${FOUNDATION_HOST}/en-001/opengraph-image`,
      ogImage,
    );
    // Its own status is RECORDED, not forced into a shape this change never promised.
    const card = await request(FOUNDATION_HOST, "/en-001/opengraph-image");
    check(rows, "brandLogo.d42.cardBehaviourRecorded", card.status !== 308, `${card.status} ${card.location}`);
    // The matched-address casing redirect still answers exactly as `R04-C30` left it.
    const casing = await request(GERMANY_HOST, "/de-DE/about");
    check(rows, "brandLogo.d40b.casingUntouched.is308", casing.status === 308, `${casing.status} ${casing.location}`);
    check(rows, "brandLogo.d40b.casingUntouched.location", casing.location === "/de-de/about", casing.location);
  } catch (error) {
    check(rows, "efs-brand-logo-precedence.scenario.error", false, String(error));
  } finally {
    await stopServer(server);
  }
  return rows;
}
