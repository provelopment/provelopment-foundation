/**
 * CONVERTED REFERENCE INSTALLATION SCENARIO (S3-E3-R02)
 * ====================================================
 *
 * Exercises the actual controlled Spokes after conversion, including the released URL grammar.
 * It uses raw HTTP with an explicit Host header because a local browser cannot resolve the
 * production hostnames; browser rendering of the same EFS renderer is covered by efs.scenario.
 */
import http from "node:http";

export const id = "efs-reference";

const PORT_OFFSETS = [71, 72, 73];

function request(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET", headers: { host } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
}

async function start(harness) {
  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.basePort + offset;
    const server = harness.startDevServer(port, { synthetic: false });
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        try {
          const probe = await request(port, "/ww/en", "foundation-template.provelopment.com");
          if (probe.status === 200) return { server, port };
        } catch {
          /* not ready */
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      throw new Error("converted reference server did not answer");
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  throw last ?? new Error("no converted reference port answered");
}

export async function run(_chrome, harness) {
  const rows = [];
  let started = null;
  try {
    started = await start(harness);
    const { port } = started;

    const foundation = [
      ["/ww/en", "Build a website you own.", "en"],
      ["/ww/de", "Eine Website, die Ihnen gehört.", "de"],
      ["/ww/en/about", "About this Foundation website", "en"],
      ["/ww/de/about", "Über diese Foundation-Website", "de"],
    ];
    for (const [path, title, lang] of foundation) {
      const page = await request(port, path, "foundation-template.provelopment.com");
      harness.check(
        rows,
        `foundation ${path} is served from the converted Entity`,
        page.status === 200 &&
          page.body.includes(`<title>${title}</title>`) &&
          page.body.includes(`<html lang="${lang}"`) &&
          page.body.includes("data-ui-shell-layout"),
        `status=${page.status}`,
      );
    }

    const germany = [
      ["/de/de", "Deutschland: zwei Sprachen, zwei Standorte.", "de"],
      ["/de/en", "Germany: two languages, two locations.", "en"],
      ["/de/de/about", "Über die Deutschland-Website", "de"],
      ["/de/en/about", "About the Germany website", "en"],
      ["/de/de/berlin", "Berlin", "de"],
      ["/de/en/berlin", "Berlin", "en"],
      ["/de/de/frankfurt", "Frankfurt", "de"],
      ["/de/en/frankfurt", "Frankfurt", "en"],
    ];
    for (const [path, title, lang] of germany) {
      const page = await request(port, path, "foundation-template-germany.provelopment.com");
      harness.check(
        rows,
        `germany ${path} is served from the converted Entity`,
        page.status === 200 &&
          page.body.includes(`<title>${title}</title>`) &&
          page.body.includes(`<html lang="${lang}"`),
        `status=${page.status}`,
      );
    }

    const germanEnglish = await request(
      port,
      "/de/en",
      "foundation-template-germany.provelopment.com",
    );
    harness.check(
      rows,
      "a declared `en` representation stays English under a Germany-named Facet and `de` prefix",
      germanEnglish.status === 200 &&
        germanEnglish.body.includes('<html lang="en"') &&
        germanEnglish.body.includes('rel="canonical" href="https://foundation-template-germany.provelopment.com/de/en"') &&
        germanEnglish.body.includes('hrefLang="en"') &&
        germanEnglish.body.includes('hrefLang="de"') &&
        germanEnglish.body.includes('property="og:locale" content="en"') &&
        !germanEnglish.body.includes("en-DE") &&
        !germanEnglish.body.includes("de-DE"),
      "lang=en, canonical /de/en, hreflang en/de, og:locale en",
    );
    const german = await request(port, "/de/de", "foundation-template-germany.provelopment.com");
    harness.check(
      rows,
      "a declared `de` representation stays German without a country-derived tag",
      german.status === 200 &&
        german.body.includes('<html lang="de"') &&
        german.body.includes('hrefLang="de"') &&
        !german.body.includes("de-DE"),
      "lang=de, no de-DE",
    );
    const city = await request(
      port,
      "/de/en/berlin",
      "foundation-template-germany.provelopment.com",
    );
    harness.check(
      rows,
      "a city-named Page creates no place record, region route, address or timezone",
      city.status === 200 &&
        city.body.includes("<title>Berlin</title>") &&
        !city.body.includes("Europe/Berlin") &&
        !city.body.includes("Example Street") &&
        !city.body.includes('aria-label="Location"') &&
        !city.body.includes("data-region"),
      "ordinary Berlin Page, no regional runtime state",
    );
    harness.check(
      rows,
      "legacy regional configuration cannot leak into the EFS shell",
      !germanEnglish.body.includes("Example Street") &&
        !germanEnglish.body.includes("Europe/Berlin") &&
        !germanEnglish.body.includes('aria-label="Location"'),
      "no authored region address/timezone/selector",
    );


    const about = await request(port, "/ww/en/about", "foundation-template.provelopment.com");
    harness.check(
      rows,
      "canonical and hreflang retain the released URLs",
      about.body.includes(
        'rel="canonical" href="https://foundation-template.provelopment.com/ww/en/about"',
      ) &&
        about.body.includes('hrefLang="de"') &&
        about.body.includes("https://foundation-template.provelopment.com/ww/de/about"),
      "canonical + de alternate",
    );
    harness.check(
      rows,
      "private properties and EntityIDs never reach public HTML",
      !about.body.includes("OWNER-ONLY") &&
        !about.body.includes("conversion:foundation") &&
        !about.body.includes("e_00000000000000000000000001"),
      "no private/identity leakage",
    );

    const icon = await request(
      port,
      "/ww/owner-assets/brand/favicon.svg",
      "foundation-template.provelopment.com",
    );
    harness.check(
      rows,
      "owner-scoped favicon is served with image MIME",
      icon.status === 200 &&
        String(icon.headers["content-type"]).startsWith("image/svg+xml") &&
        icon.body.includes("<svg"),
      `status=${icon.status}`,
    );
    const foreign = await request(
      port,
      "/de/owner-assets/brand/favicon.svg",
      "foundation-template.provelopment.com",
    );
    harness.check(
      rows,
      "a foreign prefix cannot fetch another owner's asset",
      foreign.status === 404,
      `status=${foreign.status}`,
    );

    const unknownPage = await request(port, "/ww/en/absent", "foundation-template.provelopment.com");
    harness.check(rows, "an undeclared Page is refused", unknownPage.status === 404, `status=${unknownPage.status}`);
    const unknownHost = await request(port, "/ww/en", "unclaimed.example");
    harness.check(rows, "an unclaimed host is refused", unknownHost.status === 404, `status=${unknownHost.status}`);

    const sitemap = await request(port, "/sitemap.xml", "foundation-template.provelopment.com");
    harness.check(
      rows,
      "sitemap publishes the converted Host's localized Pages",
      sitemap.status === 200 &&
        sitemap.body.includes("https://foundation-template.provelopment.com/ww/en") &&
        sitemap.body.includes("https://foundation-template.provelopment.com/ww/de/about"),
      `status=${sitemap.status}`,
    );
  } catch (error) {
    harness.check(
      rows,
      "the converted-reference scenario ran to completion",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (started) await harness.stopServer(started.server);
  }
  return rows;
}

export default { id, run };
