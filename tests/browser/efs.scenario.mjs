/**
 * EFS REAL-BROWSER SCENARIO (S3-E3-R01)
 * =====================================
 *
 * Proves the explicit EFS request path through a real dev server and headless browser: managed
 * prefix and dedicated host, Home entry, nested Page, binding-derived canonical/hreflang,
 * owner-scoped asset bytes, sitemap/robots and responsive rendering.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const id = "efs-runtime";

const PORT_OFFSETS = [61, 62, 63];

function base(port) {
  return `http://localhost:${port}`;
}

async function request(url) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  return {
    status: response.status,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type"),
    body: await response.text(),
  };
}

async function waitForHeading(cdp) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await cdp.evaluate(`(() => {
      const heading = document.querySelector('h1');
      return document.readyState === 'complete' && heading ? heading.textContent : null;
    })()`);
    if (ready) return ready;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("EFS page heading did not render");
}

async function start(harness) {
  const manifest = path.join(
    harness.repositoryRoot,
    "tests",
    "fixtures",
    "efs",
    "canonical",
    "manifest.json",
  );
  const capsule = path.join(
    harness.repositoryRoot,
    "tests",
    "fixtures",
    "efs",
    "canonical",
    "capsule",
  );
  const previous = {
    manifest: process.env.FOUNDATION_EFS_MANIFEST,
    capsule: process.env.FOUNDATION_EFS_CAPSULE,
  };
  // The EFS fixture's publication names the REAL Spoke `acme-spoke`. Its owner must exist in an
  // explicit Installation hierarchy, so the scenario builds a disposable Installation that declares
  // it, rather than relying on an implicit/mocked context.
  const installation = mkdtempSync(path.join(tmpdir(), "foundation-efs-browser-"));
  cpSync(
    path.join(harness.repositoryRoot, "deployment", "spokes", "foundation"),
    path.join(installation, "spokes", "acme-spoke"),
    { recursive: true },
  );
  mkdirSync(path.join(installation, "spokes"), { recursive: true });
  writeFileSync(
    path.join(installation, "spokes.json"),
    `${JSON.stringify({ spokes: [{ id: "acme-spoke", root: "spokes/acme-spoke" }] }, null, 2)}\n`,
    "utf8",
  );
  process.env.FOUNDATION_EFS_MANIFEST = manifest;
  process.env.FOUNDATION_EFS_CAPSULE = capsule;
  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.basePort + offset;
    const server = harness.startDevServer(port, { synthetic: false, deploymentRoot: installation });
    try {
      await harness.waitForServer(`${base(port)}/acme-co/en-001/about`, 240000);
      return { server, port, previous, installation };
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  rmSync(installation, { recursive: true, force: true });
  process.env.FOUNDATION_EFS_MANIFEST = previous.manifest;
  process.env.FOUNDATION_EFS_CAPSULE = previous.capsule;
  throw last ?? new Error("no EFS port answered");
}

export async function run(chrome, harness) {
  const rows = [];
  let started = null;
  let cdp = null;
  try {
    started = await start(harness);
    const { port } = started;
    const origin = base(port);

    const about = await request(`${origin}/acme-co/en-001/about`);
    harness.check(
      rows,
      "managed prefixed Page is served",
      about.status === 200 && about.body.includes("About Acme"),
      `status=${about.status}`,
    );
    harness.check(
      rows,
      "managed canonical is built from the binding",
      about.body.includes("https://localhost/acme-co/en-001/about"),
      about.body.match(/rel="canonical" href="([^"]+)/)?.[1] ?? "no canonical",
    );
    harness.check(
      rows,
      "hreflang names only existing representations",
      about.body.includes('hrefLang="en-001"') &&
        about.body.includes('hrefLang="fr-CA"') &&
        !about.body.includes('hrefLang="fr"'),
      "en-001 + fr-CA only",
    );
    harness.check(
      rows,
      "EntityID is not visitor-facing",
      !about.body.includes("e_00000000000000000000000000"),
      "no EntityID in HTML",
    );

    const assetHref = about.body.match(/<img[^>]+src="([^"]*owner-assets[^"]+)"/)?.[1] ?? "";
    const asset = await request(assetHref.startsWith("/") ? `${origin}${assetHref}` : assetHref);
    harness.check(
      rows,
      "the owner-scoped asset is delivered with correct bytes and MIME",
      asset.status === 200 && asset.contentType === "image/svg+xml" && asset.body.includes("<svg"),
      `status=${asset.status} type=${asset.contentType} src=${assetHref}`,
    );

    const dedicated = await request(`http://127.0.0.1:${port}/en-001/about`);
    harness.check(
      rows,
      "the dedicated host serves the same Page with its own canonical",
      dedicated.status === 200 && dedicated.body.includes("https://127.0.0.1/en-001/about"),
      `status=${dedicated.status}`,
    );

    const entry = await request(`${origin}/acme-co`);
    harness.check(
      rows,
      "the binding entry redirects to a real localized Home Page",
      entry.status === 307 && /\/acme-co\/en-001\/?$/.test(entry.location ?? ""),
      `status=${entry.status} location=${entry.location}`,
    );

    const nested = await request(`${origin}/acme-co/en-001/products/detail`);
    harness.check(
      rows,
      "nested Page route is served",
      nested.status === 200 && nested.body.includes("Product detail"),
      `status=${nested.status}`,
    );

    const sitemap = await request(`${origin}/sitemap.xml`);
    harness.check(
      rows,
      "sitemap advertises canonical Home and public Pages but no unlisted/nested Home duplicate",
      sitemap.status === 200 &&
        sitemap.body.includes("https://localhost/acme-co/en-001</loc>") &&
        !sitemap.body.includes("/en-001/home") &&
        !sitemap.body.includes("/products/detail"),
      `status=${sitemap.status}`,
    );
    const robots = await request(`${origin}/robots.txt`);
    harness.check(
      rows,
      "robots points at the binding host's sitemap",
      robots.body.includes("Sitemap: https://localhost/sitemap.xml"),
      robots.body.replace(/\s+/g, " ").trim(),
    );


    const { Cdp } = await import("./cdp.mjs");
    cdp = await Cdp.connect(chrome);
    await cdp.setViewport(harness.viewports.desktop.width, harness.viewports.desktop.height);
    await cdp.navigate(`${origin}/acme-co/en-001/about`);
    await waitForHeading(cdp);
    const browser = await cdp.evaluate(`(() => {
      const img = document.querySelector('img');
      return {
        h1: document.querySelector('h1')?.textContent ?? '',
        nav: [...document.querySelectorAll('header nav a')].map((a) => a.getAttribute('href')),
        logoNaturalWidth: img ? img.naturalWidth : 0,
        canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href') ?? '',
        jsonLd: document.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    })()`);
    harness.check(rows, "browser renders the EFS heading", browser.h1 === "About Acme", browser.h1);
    harness.check(
      rows,
      "browser navigation stays inside the binding",
      browser.nav.every((href) => href?.startsWith("/acme-co/en-001")),
      browser.nav.join(","),
    );
    harness.check(
      rows,
      "browser decodes the owner asset",
      browser.logoNaturalWidth > 0,
      `naturalWidth=${browser.logoNaturalWidth}`,
    );
    harness.check(
      rows,
      "browser sees the binding canonical",
      browser.canonical === "https://localhost/acme-co/en-001/about",
      browser.canonical,
    );
    harness.check(
      rows,
      "structured metadata is valid JSON",
      (() => {
        try {
          return JSON.parse(browser.jsonLd)["@type"] === "WebSite";
        } catch {
          return false;
        }
      })(),
      browser.jsonLd,
    );
    harness.check(
      rows,
      "no horizontal overflow at desktop",
      browser.overflow <= 1,
      `overflow=${browser.overflow}`,
    );

    for (const [name, viewport] of Object.entries({
      tablet: harness.viewports.tablet,
      mobile: harness.viewports.mobile,
    })) {
      await cdp.setViewport(viewport.width, viewport.height);
      await cdp.navigate(`${origin}/acme-co/en-001/about`);
      await waitForHeading(cdp);
      const seen = await cdp.evaluate(
        `({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, h1: document.querySelector('h1')?.textContent ?? '' })`,
      );
      harness.check(
        rows,
        `no horizontal overflow at ${name}`,
        seen.overflow <= 1 && seen.h1 === "About Acme",
        JSON.stringify(seen),
      );
    }
  } catch (error) {
    harness.check(
      rows,
      "the EFS browser scenario ran to completion",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (cdp) await cdp.close();
    if (started) {
      await harness.stopServer(started.server);
      process.env.FOUNDATION_EFS_MANIFEST = started.previous.manifest;
      process.env.FOUNDATION_EFS_CAPSULE = started.previous.capsule;
      rmSync(started.installation, { recursive: true, force: true });
    }
  }
  return rows;
}

export default { id, run };
