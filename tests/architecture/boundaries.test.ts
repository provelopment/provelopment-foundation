import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { deploymentPaths } from "@/config/deployment-root";

import { syntheticDeploymentConfigFile } from "../support/synthetic-deployment";

const srcDirectory = path.join(process.cwd(), "src");

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listTypeScriptFiles(entryPath);
    }

    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function extractImportSpecifiers(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  const importPattern = /(?:from\s+|import\s+|require\()\s*["']([^"']+)["']/g;

  return [...source.matchAll(importPattern)].map((match) => match[1]);
}

function assertNoImportsFrom(
  directory: string,
  forbiddenPrefixes: readonly string[],
): void {
  const files = listTypeScriptFiles(directory);

  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    for (const specifier of extractImportSpecifiers(file)) {
      const violation = forbiddenPrefixes.find(
        (prefix) => specifier === prefix || specifier.startsWith(prefix),
      );

      expect(violation, `${file} imports "${specifier}"`).toBeUndefined();
    }
  }
}

describe("architectural boundaries", () => {
  it("core does not import frameworks or outer layers", () => {
    assertNoImportsFrom(path.join(srcDirectory, "core"), [
      "react",
      "react-dom",
      "next",
      "@/application",
      "@/adapters",
      "@/components",
      "@/app",
      "@/config",
    ]);
  });

  it("application does not import concrete adapters or framework code", () => {
    assertNoImportsFrom(path.join(srcDirectory, "application"), [
      "@/adapters",
      "@/components",
      "@/app",
      "react",
      "react-dom",
      "next",
    ]);
  });

  it("platform source never imports platform tooling (scripts/**)", () => {
    // FOUNDATION-B4A-A2 — the pure contracts live in `src/core/**`, and the procedural release tooling
    // (`scripts/**`) CONSUMES them. The direction may not reverse: a `src/**` module importing a script
    // would tie application code to Node CLI tooling, to the filesystem and to Git, and would make the
    // released platform depend on how this repository happens to build releases.
    const offenders: string[] = [];
    for (const file of listTypeScriptFiles(srcDirectory)) {
      for (const specifier of extractImportSpecifiers(file)) {
        if (/(^|\/)scripts\//.test(specifier)) offenders.push(`${file} imports "${specifier}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

const APP_DIRECTORY = path.join(process.cwd(), "src", "app");

function readAppFile(relativePath: string): string {
  return readFileSync(path.join(APP_DIRECTORY, relativePath), "utf8");
}

describe("error UX boundaries (Phase E)", () => {
  it("error.tsx and global-error.tsx are Client Components as App Router requires", () => {
    for (const file of [
      path.join("[[...segments]]", "error.tsx"),
      path.join("[[...segments]]", "global-error.tsx"),
    ]) {
      const source = readAppFile(file);
      expect(source).toContain('"use client"');
    }
  });

  it("error boundaries never surface debugging information to users", () => {
    // Hard acceptance: error UI must never render error.message, stacks,
    // internal paths, environment details, or console output.
    const forbidden = [
      "error.message",
      ".stack",
      "process.env",
      "console.",
      "window.location",
    ];
    for (const file of [
      path.join("[[...segments]]", "error.tsx"),
      path.join("[[...segments]]", "global-error.tsx"),
    ]) {
      const source = readAppFile(file);
      for (const leak of forbidden) {
        expect(source.includes(leak), `${file} must not expose "${leak}"`).toBe(false);
      }
    }
  });

  it("known missing routes stay on the 404 (not-found) path, not a generic error", () => {
    // The ONE page route must call next/navigation notFound() so an unknown in-locale
    // route renders the localized 404 rather than throwing — and it serves only the
    // routes the build discovered, so an unknown path is never rendered on demand.
        // M13 — the render rules live in the shared composition this route hands its context to, so the
    // "route under test" is the PAIR: the boundary that selects the context, and the composition.
    const pageRoute = [
      readAppFile(path.join("[[...segments]]", "page.tsx")),
      readAppFile(path.join("[[...segments]]", "server-composition.tsx")),
    ].join("\n");
    expect(pageRoute).toMatch(/from\s+["']next\/navigation["']/);
    expect(pageRoute).toMatch(/\bnotFound\(\)\s*;/);
    // S1/M17 — the PUBLIC route is ONE request-time renderer for DISCOVERED paths: it generates no static
    // parameters (the SAME pathname is rendered per host, from that host's own Spoke) and it claims no static
    // pathname, so an unknown path is never rendered on demand — `pageForContext` refuses whatever the
    // request-selected Spoke did not discover.
    expect(pageRoute).toContain("pageForContext");
    expect(pageRoute).not.toContain("generateStaticParams");
    const layout = readAppFile(path.join("[[...segments]]", "layout.tsx"));
    expect(layout).not.toContain("dynamicParams");

    // not-found preserves the SITE and locale via the root-params contract rather than
    // hard-coding or falling back to an error page.
    const notFound = readAppFile(path.join("[[...segments]]", "not-found.tsx"));
    expect(notFound).toMatch(/from\s+["']next\/root-params["']/);
    expect(notFound).toContain("segments()");
  });
});

const componentsDirectory = path.join(process.cwd(), "src", "components");
const layoutPath = path.join(process.cwd(), "src", "app", "[[...segments]]", "server-composition.tsx");

function readSource(relativeDirectory: string, file: string): string {
  return readFileSync(path.join(relativeDirectory, file), "utf8");
}

describe("locale-aware business resolution (Phase G)", () => {
  const siteComponentsDirectory = path.join(componentsDirectory, "site");

  it("footer and structured data resolve through the same shared mechanism", () => {
    // Regression guard: if the visible footer reads the resolved location and
    // structured data reads the global one (or vice versa) the two diverge. Both
    // consumers must route through the shared core resolvers so their data can
    // never drift apart.
    const businessInfo = readSource(siteComponentsDirectory, "business-info.tsx");
    const structuredData = readSource(siteComponentsDirectory, "structured-data.tsx");

    // Both visible footer and structured data route through the shared combined
    // resolver so their per-locale data can never drift apart.
    expect(businessInfo).toContain("resolveBusinessForLocale");
    expect(structuredData).toContain("resolveBusinessForLocale");

    // The root [[...segments]] layout passes the active locale into structured data.
    const layout = readFileSync(layoutPath, "utf8");
    expect(layout).toContain("<StructuredData locale={locale} siteConfig={siteConfig} />");
  });

  it("resolver lives in core and introduces no hard-coded locale mapping", () => {
    const coreBusiness = readSource(path.join(process.cwd(), "src", "core"), "business.ts");

    // Resolution must be data-driven (lookup by a config-supplied map key), never
    // locale-specific conditional branches. Guard the semantics of the resolver:
    // overrides are resolved via lookup against `location.locales[locale]`, not
    // literal comparisons against locale codes.
    expect(coreBusiness).toContain("location.locales?.[locale]");
    expect(coreBusiness).not.toMatch(/locale\s*===/); // no `locale === "…"` branch exists
  });
});

describe("provider integration boundaries (Phase H)", () => {
  const siteComponentsDirectory = path.join(componentsDirectory, "site");
  const adaptersDirectory = path.join(process.cwd(), "src", "adapters");

  it("the business component contains no provider-specific URL construction", () => {
    // The visible footer only renders a resolved direction action — it must
    // never know that Google Maps (or any provider) exists.
    const businessInfo = readSource(siteComponentsDirectory, "business-info.tsx");
    expect(businessInfo).not.toContain("google.com");
    expect(businessInfo).toContain("direction.kind === \"link\"");
  });

  it("provider deep-link URLs live only inside their adapter", () => {
    const mapsAdapter = readSource(path.join(adaptersDirectory, "maps"), "google-maps.ts");
    expect(mapsAdapter).toContain("google.com/maps");

    for (const file of listTypeScriptFiles(path.join(process.cwd(), "src"))) {
      if (file.startsWith(path.join(adaptersDirectory, "maps"))) continue;
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("google.com/maps");
    }
  });

  it("the analytics provider dependency stays inside its adapter", () => {
    const analyticsAdapterDirectory = path.join(adaptersDirectory, "analytics");

    for (const file of listTypeScriptFiles(path.join(process.cwd(), "src"))) {
      if (file.startsWith(analyticsAdapterDirectory)) continue;
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/@vercel\/analytics/);
      expect(source, file).not.toMatch(/vercel-analytics/);
    }
  });

  it("the layout renders composed integrations without provider selection", () => {
    // Provider selection belongs to the adapter factories; the layout must only
    // render the already-composed integration.
    const layout = readFileSync(layoutPath, "utf8");
    expect(layout).toContain("createAnalyticsProvider");
    expect(layout).toContain("createDirectionLinkResolver");
    expect(layout).not.toMatch(/\.provider/);
  });

  it("components contain no provider-specific conditionals", () => {
    for (const file of listTypeScriptFiles(componentsDirectory)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/provider\s*===/);
      expect(source, file).not.toMatch(/===\s*"(vercel|google|external-url)"/);
    }
  });

  it("booking is composed at the app boundary, not inside a component", () => {
    const homePage = readAppFile(path.join("[[...segments]]", "server-composition.tsx"));
    expect(homePage).toContain("createBookingActionResolver");

    const bookingAction = readSource(siteComponentsDirectory, "booking-action.tsx");
    expect(bookingAction).not.toMatch(/provider\s*===/);
    expect(bookingAction).not.toMatch(/===\s*"external-url"/);
  });

  it("adapters own the provider switching and no single giant factory file exists", () => {
    // Each integration has its own factory that SELECTS adapters; provider
    // behaviour lives in per-provider files.
    for (const integration of ["maps", "booking"]) {
      const adapterDirectory = path.join(adaptersDirectory, integration);
      const files = readdirSync(adapterDirectory).filter((name) => /\.[jt]sx?$/.test(name));
      // index (factory) + none + at least one provider adapter
      expect(files, integration).toContain("none.ts");
      expect(files, integration).toContain("index.ts");
    }
  });
});

describe("adapter factory boundary (Phase I)", () => {
  // Capability integration directories governed by the provider boundary rule:
  // concrete provider modules may be imported ONLY by their directory factory
  // (index) or by tests — never by arbitrary application/UI/domain source.
  // `adapters/content/**` is the pre-existing content repository and is
  // explicitly EXCLUDED from this rule.
  const integrationDirectories = ["maps", "booking", "analytics", "contact-inquiry"];
  const adaptersDirectory = path.join(process.cwd(), "src", "adapters");

  it("concrete provider modules are importable only by their factory index (never bypassed)", () => {
    const concreteByDomain = new Map<string, string[]>();

    for (const domain of integrationDirectories) {
      const directory = path.join(adaptersDirectory, domain);
      const concrete = readdirSync(directory)
        .filter((name) => /\.[jt]sx?$/.test(name))
        .filter((name) => !name.startsWith("index"))
        .map((name) => path.basename(name, path.extname(name)));
      expect(concrete.length, `${domain} must expose concrete provider modules`).toBeGreaterThan(0);
      concreteByDomain.set(domain, concrete);
    }

    const violations: string[] = [];

    for (const file of listTypeScriptFiles(path.join(process.cwd(), "src"))) {
      // The pre-existing content-repository adapter is out of scope for this rule.
      if (file.startsWith(path.join(adaptersDirectory, "content"))) continue;

      for (const specifier of extractImportSpecifiers(file)) {
        for (const domain of integrationDirectories) {
          const domainDirectory = path.join(adaptersDirectory, domain);
          // The domain's own factory (index) is the one sanctioned importer.
          const isDomainIndex = file.startsWith(path.join(domainDirectory, "index."));
          const concrete = concreteByDomain.get(domain)!;

          const aliasPrefix = `@/adapters/${domain}/`;
          // Resolve which concrete module (if any) this specifier reaches.
          let resolvedBase: string | undefined;
          if (specifier.startsWith(aliasPrefix)) {
            const remainder = specifier.slice(aliasPrefix.length);
            resolvedBase = remainder.split(".")[0].split("/")[0];
          } else if (file.startsWith(domainDirectory)) {
            // A relative import only targets a concrete module of this domain
            // when the importer lives inside the domain's own directory.
            const relative = specifier.startsWith("../") ? specifier.slice(3) : specifier;
            if (relative.startsWith("./")) {
              resolvedBase = relative.slice(2).split(".")[0];
            }
          }

          if (resolvedBase && concrete.includes(resolvedBase) && !isDomainIndex) {
            violations.push(
              `${path.relative(process.cwd(), file)} imports "${specifier}" (${domain}/${resolvedBase}) outside the factory`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("outbound server-action & isolation boundaries (Phase I)", () => {
  const appDirectory = path.join(srcDirectory, "app");
  const configDirectory = path.join(srcDirectory, "config");
  const coreDirectory = path.join(srcDirectory, "core");
  const contentDirectory = path.join(deploymentPaths().root, "content");
  // ISO-H2 — the deployment-owned surfaces come from the ONE authority, so this scan follows whichever
  // deployment is selected (the synthetic deployment in the generic project, the real capsule in the
  // deployment project, `<repo>` in the repository layout). A scan hard-coded to `<repo>/content` would
  // silently stop covering anything the moment the deployment moved into its capsule (B2B).
  const siteConfigPath = deploymentPaths().siteConfigFile;

  function listTextFiles(directory: string): string[] {
    // FS1 — the generic template ships no `content/` tree (and git cannot track
    // empty directories), so a scanned directory may legitimately be absent. An
    // absent directory simply has no files to scan; that is never an error.
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listTextFiles(entryPath);
      return /\.[jt]sx?$|\.md$|\.json$/.test(entry.name) ? [entryPath] : [];
    });
  }

  it("the contact server action imports the sender only through the contact-inquiry factory", () => {
    const actionSource = readFileSync(path.join(appDirectory, "contact-actions.ts"), "utf8");
    expect(actionSource).toMatch(/from "@\/adapters\/contact-inquiry"/);
    // Concrete provider modules must never be imported by the server action.
    expect(actionSource).not.toMatch(/from "@\/adapters\/contact-inquiry\/webhook"/);
    expect(actionSource).not.toMatch(/from "@\/adapters\/contact-inquiry\/stub"/);
  });

  it("webhook secrets are read lazily from the environment in the frontend boundary only", () => {
    const actionSource = readFileSync(path.join(appDirectory, "contact-actions.ts"), "utf8");
    // The ONLY sanctioned read site for the webhook secrets is the server action,
    // inside the request handler (lazy/call-time), sourced from process.env.
    expect(actionSource).toContain("process.env.CONTACT_WEBHOOK_URL");
    expect(actionSource).toContain("process.env.CONTACT_WEBHOOK_TOKEN");
  });

  it("webhook secrets (values or bearer-token properties) never live in config, content, or site.config.json", () => {
    const secretTokens = [
      /CONTACT_WEBHOOK/,
      /webhookUrl/,
      /webhookToken/,
    ];

    for (const file of [...listTextFiles(configDirectory), ...listTextFiles(contentDirectory), siteConfigPath]) {
      const source = readFileSync(file, "utf8");
      for (const token of secretTokens) {
        expect(source, `${path.relative(process.cwd(), file)} must not contain ${token}`).not.toMatch(token);
      }
    }
  });

  it("core never reads webhook secrets and names the env contract only in the sanctioned domain file", () => {
    const coreFiles = listTextFiles(coreDirectory);
    // `contact-inquiry.ts` is the sanctioned home of the ContactInquiryEnv type
    // (the env contract); every OTHER core file must not mention the secret
    // property names or read the environment at all.
    for (const file of coreFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, path.relative(process.cwd(), file)).not.toMatch(/CONTACT_WEBHOOK/);
      expect(source, path.relative(process.cwd(), file)).not.toMatch(/process\.env\.CONTACT_/);
      if (!file.endsWith("contact-inquiry.ts")) {
        expect(source, path.relative(process.cwd(), file)).not.toMatch(/webhookUrl|webhookToken/);
      }
    }
  });

  it("presentation (components) cannot import any concrete provider adapter", () => {
    const componentFiles = listTypeScriptFiles(path.join(srcDirectory, "components"));
    for (const file of componentFiles) {
      for (const specifier of extractImportSpecifiers(file)) {
        for (const domain of ["maps", "booking", "analytics", "contact-inquiry"]) {
          expect(
            specifier,
            `${path.relative(process.cwd(), file)} imports "${specifier}" (a ${domain} provider)`,
          ).not.toMatch(new RegExp(`^@/adapters/${domain}/`));
        }
      }
    }
  });

  it("core cannot import adapters or config (no outer-layer leakage)", () => {
    for (const file of listTypeScriptFiles(coreDirectory)) {
      for (const specifier of extractImportSpecifiers(file)) {
        expect(specifier, `${path.relative(process.cwd(), file)} imports "${specifier}"`).not.toMatch(
          /^@\/adapters(\/|$)/,
        );
        expect(specifier, `${path.relative(process.cwd(), file)} imports "${specifier}"`).not.toMatch(
          /^@\/config(\/|$)/,
        );
      }
    }
  });
});


describe("Phase L — regional page-context boundaries", () => {
  const COMPONENTS_DIRECTORY = path.join(process.cwd(), "src", "components", "site");

  function readComponent(name: string): string {
    return readFileSync(path.join(COMPONENTS_DIRECTORY, name), "utf8");
  }

  it("regional pages resolve their page context centrally (never in components)", () => {
    // ONE page route now serves flat, nested AND regional pages, so the regional
    // context contract is asserted there — the region still comes from the URL
    // (authoritative), never re-derived inside a component.
    const page = readFileSync(path.join(APP_DIRECTORY, "[[...segments]]", "server-composition.tsx"), "utf8");
    expect(page).toContain("resolveRegionalPageContext");
    // The route must not resolve timezones or read the global business block.
    expect(page).not.toContain("resolveTimezone");
    expect(page).not.toContain(".business.timezone");
    expect(page).not.toContain("business.locations");
  });

  it("region components and switchers never read the global business block or another region", () => {
    for (const file of [
      "region-block.tsx",
      "region-structured-data.tsx",
      "region-current-status.tsx",
      "location-switcher.tsx",
      "language-switcher.tsx",
    ]) {
      const source = readComponent(file);
      expect(source, `${file} must not read the global business block`).not.toContain(
        "siteConfig.business",
      );
      expect(source, `${file} must not resolve the legacy business identity`).not.toContain(
        "resolveBusinessForLocale",
      );
      expect(source, `${file} must not resolve timezones directly`).not.toContain(
        "resolveTimezone",
      );
    }
  });

  it("switchers delegate destination resolution to the pure core resolver", () => {
    for (const file of ["location-switcher.tsx", "language-switcher.tsx"]) {
      const source = readComponent(file);
      expect(source, `${file} must use the shared regional-pages resolver`).toContain(
        "@/core/regional-pages",
      );
    }
  });

  it("no location navigation links remain in config navigation or dictionaries", () => {
    const config = JSON.parse(
      readFileSync(syntheticDeploymentConfigFile, "utf8"),
    ) as { navigation?: { href: string }[] };
    const hrefs = (config.navigation ?? []).map((entry) => entry.href);
    for (const forbidden of ["/toronto", "/vancouver", "/montreal", "/berlin"]) {
      expect(hrefs, `nav must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("the one page route serves regional landings and excludes reserved first segments", () => {
    const page = readFileSync(path.join(APP_DIRECTORY, "[[...segments]]", "server-composition.tsx"), "utf8");
    // The reserved home slug can never double-route: home IS the locale root, so the route
    // skips the slug wherever a page inventory could publish it.
    expect(page).toContain("HOME_CONTENT_SLUG");
    expect(page).toMatch(/segments\.length === 1[\s\S]*HOME_CONTENT_SLUG/);
    // Regional landings come from the configured bindings, not from a literal list.
    expect(page).toContain("regionsForLocale");
  });
});

describe("Phase M — location selector + region-aware navigation boundaries", () => {
  const COMPONENTS_DIRECTORY = path.join(process.cwd(), "src", "components", "site");

  function readComponent(name: string): string {
    return readFileSync(path.join(COMPONENTS_DIRECTORY, name), "utf8");
  }

  it("the Location selector derives its inventory from the ACTIVE SITE's configured regions", () => {
    const source = readComponent("location-switcher.tsx");
    expect(source).toContain("regionsForSite");
    // The inventory must NOT be locale/page-scoped (Phase M: never "locations compatible with my
    // language") — and must NOT be the deployment-wide region list either, because a location
    // belongs to ONE site's page tree (S1: no cross-site resolution).
    expect(source).not.toContain("regionsForLocale");
    expect(source).not.toContain("configuredRegionIds");
  });

  it("the Location selector delegates routing to the pure core resolver (locale jump + unspecified)", () => {
    const source = readComponent("location-switcher.tsx");
    expect(source).toContain("resolveLocationDestination");
    expect(source).toContain("regionDefaultLocale");
    expect(source).toContain("unspecifiedDestination");
  });

  it("region-aware navigation is a shared client component delegating to the core resolver", () => {
    const source = readComponent("context-nav-links.tsx");
    expect(source).toContain("resolveNavHref");
    expect(source).toContain("@/core/regional-pages");
    // No component may inline a hard-coded `/${locale}${item.href}` rewrite.
    expect(source).not.toContain("item.href === \"/\"");
  });

  it("P0-5 — the site layer delegates LINK SEMANTICS to the shared NavItem primitive (one link-rendering path)", () => {
    const source = readComponent("context-nav-links.tsx");
    // The consumer composes the shared primitive and renders NO link itself:
    expect(source).toContain('from "@/components/ui/nav-item"');
    expect(source).toContain("<NavItem");
    expect(source).not.toContain('from "next/link"');
    expect(source).not.toContain('target="_blank"');
    // It still OWNS the context NavItem must not: URL/region resolution + active computation.
    expect(source).toContain("resolveNavHref");
    expect(source).toContain("pathname.toLowerCase() === link.href.toLowerCase()");
  });

  it("primary navigation holds INTERNAL routes only (locations are selectors, never nav links)", () => {
    const config = JSON.parse(
      readFileSync(syntheticDeploymentConfigFile, "utf8"),
    ) as { navigation?: { href: string }[] };
    const hrefs = (config.navigation ?? []).map((entry) => entry.href);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, `nav href ${href} must be an internal route`).toMatch(/^\//);
    }
    // FS1 — operating regions are a SELECTOR, never navigation entries. This is
    // the boundary the old Connect-centric assertion protected, stated generically
    // so it holds for any adopter's configuration.
    expect(config).not.toHaveProperty("regionPages");
    expect(JSON.stringify(config)).not.toContain("/toronto");
  });

  it("the one page route excludes the static Connect and Contact route slugs", () => {
    const page = readFileSync(path.join(APP_DIRECTORY, "[[...segments]]", "server-composition.tsx"), "utf8");
    // S1 — the dedicated page chrome (connect / contact / home) is folded INTO the ONE
    // catch-all route, which names those reserved slugs so exactly one route serves each.
    expect(page).toContain("CONNECT_ROUTE_PATH");
    expect(page).toContain("CONTACT_ROUTE_PATH");
    expect(page).toContain('"connect"');
    expect(page).toContain('"contact"');
  });

  it("the Connect page and switchers never read global business contact location data", () => {
    const page = readFileSync(
      path.join(APP_DIRECTORY, "[[...segments]]", "dedicated-pages.tsx"),
      "utf8",
    );
    expect(page).toContain("siteConfig.connect");
    expect(page).not.toContain("siteConfig.business");
    expect(page).not.toContain("resolveTimezone");
  });
});

describe("Phase M refinement — footer Connect UX boundaries", () => {
  const COMPONENTS_DIRECTORY = path.join(process.cwd(), "src", "components", "site");

  function readComponent(name: string): string {
    return readFileSync(path.join(COMPONENTS_DIRECTORY, name), "utf8");
  }

  it("the footer delegates ALL resolution to the shared resolver components (no duplicate logic)", () => {
    const footer = readComponent("site-footer.tsx");
    // The Connect heading link + method links go through the shared
    // URL-authoritative components; the footer itself never parses the URL or
    // constructs regional hrefs.
    expect(footer).toContain("ContextConnectHeading");
    expect(footer).toContain("context-connect-heading");
    expect(footer).toContain("ContextNavLinks");
    expect(footer).toContain("connectMethodLabel");
    expect(footer).not.toContain("usePathname");
    expect(footer).not.toContain("parseRegionalPath");
    expect(footer).not.toContain("resolveNavHref");
    expect(footer).not.toContain("${locale}${");
  });

  it("the footer has no /connect or /contact list items (heading IS the link; Message Us is the method)", () => {
    const footer = readComponent("site-footer.tsx");
    expect(footer).not.toContain('href: "/connect"');
    expect(footer).not.toContain('href: "/contact"');
    expect(footer).toContain('href: method.href');
  });

  it("the Connect heading resolves through the same core resolver the header uses", () => {
    const heading = readComponent("context-connect-heading.tsx");
    expect(heading).toContain("resolveNavHref");
    expect(heading).toContain("pathContextOr");
    expect(heading).toContain("@/core/regional-pages");
    // No hand-constructed regional URL building in the heading component.
    expect(heading).not.toContain("regionalPath(");
    expect(heading).not.toContain("unspecifiedDestination");
  });

  it("connection-method labels come from ONE shared helper (same source for page + footer)", () => {
    const page = readFileSync(
      path.join(APP_DIRECTORY, "[[...segments]]", "dedicated-pages.tsx"),
      "utf8",
    );
    const footer = readComponent("site-footer.tsx");
    for (const source of [page, footer]) {
      expect(source).toContain("connectMethodLabel");
    }
  });

  it("the language switcher uses the shared display-name helper (never English (English))", () => {
    const switcher = readComponent("language-switcher.tsx");
    expect(switcher).toContain("displayNameWithEnglish");
    expect(switcher).toContain("@/core/display-labels");
  });

  it("the location selector receives display names (never duplicates English)", () => {
    const switcher = readComponent("location-switcher.tsx");
    expect(switcher).toContain("regionLabels");
  });
});

describe("Phase D — design-system boundaries", () => {
  it("presentational code consumes semantic tokens only (no raw color literals)", () => {
    // Components and pages must never carry raw color values or hardcoded
    // status-color utilities; globals.css is the single source. Exemptions are
    // deliberate assets/mirrors:
    //  - [site]/[locale]/opengraph-image.tsx  → generated brand image (fixed brand colors);
    //  - [[...segments]]/layout.tsx  → viewport theme-color mirrors the --background
    //    token per scheme (must be static literals for the metadata API).
    const forbidden = [
      /#[0-9a-fA-F]{3,8}\b/,
      /text-red-|border-red-|bg-red-|text-emerald-|bg-accent\/50/,
      /focus-visible:outline/,
    ];
    const exempt = new Set([
      path.join(APP_DIRECTORY, "[site]", "[locale]", "opengraph-image.tsx"),
      // M16 — the SAME brand artwork, extracted so the public boundary and the per-host internal boundary
      // (the hostname-selected Spoke's own OpenGraph route) render ONE view.
      path.join(APP_DIRECTORY, "[site]", "[locale]", "opengraph-image-view.tsx"),
      path.join(APP_DIRECTORY, "[[...segments]]", "layout.tsx"),
      // M17 — the retired internal page tree (`/~spoke/[segment]/...`) no longer exists: the public
      // catch-all IS the page identity, and the Spoke reaches it on a private upstream header.
    ]);

    for (const directory of [path.join(srcDirectory, "components"), APP_DIRECTORY]) {
      for (const file of listTypeScriptFiles(directory)) {
        if (exempt.has(file)) continue;
        const source = readFileSync(file, "utf8");
        const relative = path.relative(process.cwd(), file);
        for (const pattern of forbidden) {
          expect(
            pattern.test(source),
            `${relative} matches ${pattern}; raw colors belong in src/app/globals.css`,
          ).toBe(false);
        }
      }
    }
  });

  it("the theme stays CSS/system-only (no client toggle contract)", () => {
    const globals = readFileSync(path.join(srcDirectory, "app", "globals.css"), "utf8");
    expect(globals).toContain("@media (prefers-color-scheme: dark)");
    expect(globals).not.toContain("data-theme");
    // No new client-side theme surface: the layout remains a Server Component.
    const layout = readFileSync(
      path.join(APP_DIRECTORY, "[[...segments]]", "layout.tsx"),
      "utf8",
    );
    expect(layout).not.toContain('"use client"');
  });

  it("P1-4 — Button + Section are the SINGLE shared primitive path (no residual duplicated class strings)", () => {
    const primaryActionClass =
      "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2";
    const pageFrameClass = "mx-auto max-w-page px-4 py-12";

    // (1) The two demonstrated Button consumers delegate to the shared primitive
    //     and carry NO duplicated primary-action class literal.
    for (const rel of ["[[...segments]]/error.tsx", "components/site/contact-form.tsx"]) {
      const file = path.join(rel.startsWith("components") ? srcDirectory : APP_DIRECTORY, rel);
      const source = readFileSync(file, "utf8");
      expect(source, `${rel} must delegate to the shared Button`).toContain(
        'from "@/components/ui/button"',
      );
      expect(source, `${rel} must not duplicate the primary-action class`).not.toContain(
        primaryActionClass,
      );
    }

    // (2) Every page-frame consumer delegates to the shared Section: the raw
    //     frame class string must not appear in any app page or site component.
    for (const directory of [APP_DIRECTORY, path.join(srcDirectory, "components", "site")]) {
      for (const file of listTypeScriptFiles(directory)) {
        const source = readFileSync(file, "utf8");
        expect(
          source,
          `${path.relative(process.cwd(), file)} must use <Section> instead of the raw page-frame class`,
        ).not.toContain(pageFrameClass);
      }
    }
  });

  it("P1-7 — Grid + Stack consumers delegate to the shared primitives", () => {
    // The connect method grid and the header alignment stack must compose the shared
    // `<Grid>`/`<Stack>` primitives instead of inlining the raw layout classes.
    // S1 — the connect method grid lives in the route folder's dedicated page chrome.
    const gridConsumers = [
      path.join(APP_DIRECTORY, "[[...segments]]", "dedicated-pages.tsx"),
    ];
    const stackConsumers = [
      path.join(srcDirectory, "components", "site", "site-header.tsx"),
    ];
    for (const file of [...gridConsumers, ...stackConsumers]) {
      const source = readFileSync(file, "utf8");
      expect(source, `${path.relative(process.cwd(), file)} must use <Grid>/<Stack>`).toMatch(
        /from "@\/components\/ui\/(grid|stack)"/,
      );
    }
    // No raw `grid gap-… sm:grid-cols-…` listing class string remains in any app page
    // or site component (the grid.tsx doc-comment is excluded).
    const collectionGrid = /<ul className="(mt-8 )?grid gap-[0-9]+ sm:grid-cols-/;
    for (const directory of [APP_DIRECTORY, path.join(srcDirectory, "components", "site")]) {
      for (const file of listTypeScriptFiles(directory)) {
        const source = readFileSync(file, "utf8");
        expect(
          source,
          `${path.relative(process.cwd(), file)} must not inline the raw collection-grid class`,
        ).not.toMatch(collectionGrid);
      }
    }
  });

  it("P2-8 — the contact-form field errors delegate to the shared FieldError primitive", () => {
    // The contact form must compose the shared `<FieldError>` instead of
    // inlining the raw `mt-1 text-sm text-destructive` error paragraph.
    const source = readFileSync(
      path.join(srcDirectory, "components", "site", "contact-form.tsx"),
      "utf8",
    );
    expect(source).toMatch(/from "@\/components\/ui\/field-error"/);
    expect(source).not.toMatch(/<p className="mt-1 text-sm text-destructive">/);
  });

  it("P2-11 — NavItem composes the shared NavBadge for its badge chip", () => {
    // NavItem must use the shared `<NavBadge>` (same `nav-item-badge` class
    // contract) instead of inlining a duplicate badge `<span>`.
    const source = readFileSync(
      path.join(srcDirectory, "components", "ui", "nav-item.tsx"),
      "utf8",
    );
    expect(source).toMatch(/from "\.\/nav-badge"/);
    expect(source).not.toMatch(/<span className="nav-item-badge">\{badge\}<\/span>/);
  });

  it("P2-12 — page/app consumers compose the shared Heading for the page-title contract", () => {
    // No page-level module under [[...segments]] may inline the raw page-title h1 classes; the
    // demonstrated title consumers must compose `<Heading level={1} tone="title">`.
    // S1 — the route folder holds the ONE catch-all route AND the dedicated page chrome it
    // composes (home / connect / contact), so both are page-level consumers.
    const pageFiles = listTypeScriptFiles(path.join(APP_DIRECTORY, "[[...segments]]")).filter(
      (file) => file.endsWith("dedicated-pages.tsx") || file.endsWith("server-composition.tsx"),
    );
    let composing = 0;
    let raw = 0;
    for (const file of pageFiles) {
      const source = readFileSync(file, "utf8");
      if (source.includes("<Heading level={1} tone=\"title\">")) composing++;
      if (source.includes('<h1 className="text-3xl font-bold tracking-tight"')) raw++;
      expect(
        source,
        `${path.relative(process.cwd(), file)} must not inline the raw page-title h1 classes`,
      ).not.toContain('<h1 className="text-3xl font-bold tracking-tight"');
    }
    expect(pageFiles.length).toBe(2);
    expect(composing).toBe(pageFiles.length);
    expect(raw).toBe(0);
  });
});
describe("Phase S — SEO & structured-data boundaries", () => {
  it("the pure SEO metadata helpers are framework- and config-free", () => {
    const source = readFileSync(
      path.join(srcDirectory, "core", "seo-metadata.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from ["']next/);
    expect(source).not.toMatch(/from ["']react/);
    expect(source).not.toMatch(/from ["']@\/adapters/);
    expect(source).not.toMatch(/from ["']@\/config/);
  });

  it("structured data consumes the same business-resolution seam as the visible UI", () => {
    const globalData = readFileSync(
      path.join(srcDirectory, "components", "site", "structured-data.tsx"),
      "utf8",
    );
    const businessInfo = readFileSync(
      path.join(srcDirectory, "components", "site", "business-info.tsx"),
      "utf8",
    );
    // Global JSON-LD and the footer NAP share the SAME resolver — no
    // independent copy that could drift from the visible identity.
    expect(globalData).toContain("resolveBusinessForLocale");
    expect(businessInfo).toContain("resolveBusinessForLocale");
  });
});

describe("Phase T — trust & publishing primitive boundaries (A1E: now PAGES)", () => {
  it("keeps the retired collection modules and components out of the tree", () => {
    // The trust/publishing collections are GONE: testimonials, portfolio, posts and
    // offerings are authored as PAGES, so a returning core module, presentation
    // component or adapter would be a second, competing content model.
    for (const name of ["testimonials.ts", "portfolio.ts", "posts.ts", "offerings.ts"]) {
      expect(existsSync(path.join(srcDirectory, "core", name)), name).toBe(false);
    }
    for (const name of [
      "testimonial-card.tsx",
      "testimonial-list.tsx",
      "portfolio-card.tsx",
      "portfolio-list.tsx",
      "portfolio-detail.tsx",
      "post-card.tsx",
      "post-list.tsx",
      "post-detail.tsx",
      "offering-card.tsx",
      "offering-list.tsx",
      "offering-detail.tsx",
      "offering-structured-data.tsx",
      "offering-action-label.ts",
    ]) {
      expect(existsSync(path.join(srcDirectory, "components", "site", name)), name).toBe(false);
    }
    // …and the collection STORE that served them, with its port.
    expect(existsSync(path.join(srcDirectory, "adapters", "content", "fs-page-content-repository.ts"))).toBe(
      false,
    );
    expect(existsSync(path.join(srcDirectory, "application", "page-content-repository.ts"))).toBe(
      false,
    );
  });

  it("renders every page through the ONE safe renderer", () => {
    // A page body is always rendered by `SafeMarkdownContent`: the trusted collection
    // renderer exists for reviewed source content, and no page route may reach it.
    for (const route of ["server-composition.tsx", "dedicated-pages.tsx"]) {
      const source = readFileSync(path.join(APP_DIRECTORY, "[[...segments]]", route), "utf8");
      expect(source, route).toContain("SafeMarkdownContent");
      expect(source, route).not.toContain('from "@/components/site/markdown-content"');
    }
  });
});

describe("Phase UI-03 — shared UI primitives boundaries", () => {
  const UI_COMPONENTS_DIRECTORY = path.join(srcDirectory, "components", "ui");
  const UI_COMPONENT_FILES = listTypeScriptFiles(UI_COMPONENTS_DIRECTORY);

  it("the shared UI primitives are configuration-, core-, adapter- and app-free", () => {
    expect(UI_COMPONENT_FILES.length).toBeGreaterThan(0);
    for (const file of UI_COMPONENT_FILES) {
      const source = readFileSync(file, "utf8");
      const display = file.slice(file.indexOf("components"));
      expect(source, `${display} must not import @/config`).not.toMatch(/from ["']@\/config/);
      expect(source, `${display} must not import @/core`).not.toMatch(/from ["']@\/core/);
      expect(source, `${display} must not import @/adapters`).not.toMatch(/from ["']@\/adapters/);
      expect(source, `${display} must not import @/app`).not.toMatch(/from ["']@\/app/);
      expect(source, `${display} must not import siteConfig`).not.toContain("siteConfig");
      expect(source, `${display} must not import ResolvedUiConfig`).not.toContain("ResolvedUiConfig");
      // Only framework/`next` primitives and sibling (`./`) imports are allowed.
      // `react-dom` is permitted for the Drawer's modal portal (createPortal):
      // the SAME package as the already-allowed `react-dom/server`, a pure React
      // primitive with no config/core/adapter/app leak. UI-10 mount-at-document-
      // root needs it so the modal truly overlays every shell region.
      const nonSiblingNonNext = extractImportSpecifiers(file).filter((spec) =>
        !spec.startsWith("./") && !spec.startsWith("next") && !["react", "react-dom", "react-dom/server"].includes(spec),
      );
      expect(nonSiblingNonNext, `${display} imports outside the allowed framework set`).toEqual([]);
    }
  });

  it("server primitives declare no callback/event-handler props (NavItem stays serializable)", () => {
    const navItem = readFileSync(path.join(UI_COMPONENTS_DIRECTORY, "nav-item.tsx"), "utf8");
    expect(navItem).not.toMatch(/on(Click|Activate|Change|Open|Close|Toggle)\?/);
    expect(navItem).not.toContain("use client");
  });
});

describe("Phase UI-04 — shell engine boundaries", () => {
  const SHELL_DIRECTORY = path.join(srcDirectory, "components", "shell");
  const SHELL_FILES = listTypeScriptFiles(SHELL_DIRECTORY);

  it("the shell engine components import no configuration or adapters and receive intent via props", () => {
    expect(SHELL_FILES.length).toBeGreaterThan(0);
    for (const file of SHELL_FILES) {
      const source = readFileSync(file, "utf8");
      const display = file.slice(file.indexOf("components"));
      expect(source, `${display} must not import @/config`).not.toMatch(/from ["']@\/config/);
      expect(source, `${display} must not import @/adapters`).not.toMatch(/from ["']@\/adapters/);
      expect(source, `${display} must not import siteConfig`).not.toContain("siteConfig");
      expect(source, `${display} must not import @/app`).not.toMatch(/from ["']@\/app/);
    }
  });

  it("the shell engine stays preset-agnostic (no preset-name literals)", () => {
    for (const file of SHELL_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/"adaptive"|"classic"|"focus"|"workspace"|"immersive"/);
    }
  });
});

describe("Phase UI-05 — adaptive preset boundaries", () => {
  const SHELL_DIRECTORY = path.join(srcDirectory, "components", "shell");
  const UI_CORE_DIRECTORY = path.join(srcDirectory, "core", "ui");

  it("the shell engine branches only on vocabulary/structural values — never preset identity", () => {
    for (const file of ["shell-engine.tsx", "shell-bottom-bar.tsx", "shell-mobile-nav.tsx", "index.ts"]) {
      const source = readFileSync(path.join(SHELL_DIRECTORY, file), "utf8");
      expect(source, file).not.toMatch(/preset\s*===\s*["'][a-z]/);
      expect(source, file).not.toMatch(/\.preset/);
    }
  });

  it("R1 — the retired bottom-bar overflow rule is NOT a platform constant any more", () => {
    const coreIndex = readFileSync(path.join(UI_CORE_DIRECTORY, "index.ts"), "utf8");
    const shellCore = readFileSync(path.join(UI_CORE_DIRECTORY, "shell.ts"), "utf8");
    // The owner retired "first four + More": the bar renders EVERY destination and wraps, so the limit and
    // the split rule were removed rather than left as dead compatibility logic beside the new presentation.
    expect(coreIndex).not.toContain("splitBottomNavItems");
    expect(coreIndex).not.toContain("BOTTOM_NAV_PRIMARY_LIMIT");
    expect(shellCore).not.toContain("BOTTOM_NAV_PRIMARY_LIMIT =");
    expect(shellCore).not.toContain("export function splitBottomNavItems");
    // …and the retirement is DOCUMENTED where the rule used to live, so a reader learns why it is gone.
    expect(shellCore).toContain("THE RETIRED");
  });

  it("the engine receives config-derived context (locale, pageBindings) via props — no config import", () => {
    const engine = readFileSync(path.join(SHELL_DIRECTORY, "shell-engine.tsx"), "utf8");
    const bottomBar = readFileSync(path.join(SHELL_DIRECTORY, "shell-bottom-bar.tsx"), "utf8");
    for (const [name, source] of [["shell-engine.tsx", engine], ["shell-bottom-bar.tsx", bottomBar]] as const) {
      expect(source, name).not.toMatch(/from ["']@\/config/);
      expect(source, name).not.toContain("siteConfig");
    }
  });
});

describe("Phase UI-06 — classic preset is purely declarative", () => {
  const SHELL_DIRECTORY = path.join(srcDirectory, "components", "shell");

  it("the shell engine contains zero classic-specific logic (source-scan)", () => {
    for (const file of ["shell-engine.tsx", "shell-bottom-bar.tsx", "shell-mobile-nav.tsx", "index.ts"]) {
      const source = readFileSync(path.join(SHELL_DIRECTORY, file), "utf8");
      expect(source, file).not.toMatch(/classic/);
    }
  });

  it("the top-bar composition is data, not code — no branch in the core", () => {
    const shellCore = readFileSync(path.join(srcDirectory, "core", "ui", "shell.ts"), "utf8");
    expect(shellCore).not.toMatch(/classic/);
  });
});

describe("Phase UI-07 — focus preset stays fully declarative at the architectural boundary", () => {
  const SHELL_DIRECTORY = path.join(srcDirectory, "components", "shell");

  it("the shell engine contains zero focus-specific logic (source-scan for preset-name literals)", () => {
    for (const file of ["shell-engine.tsx", "shell-bottom-bar.tsx", "shell-mobile-nav.tsx", "index.ts"]) {
      const source = readFileSync(path.join(SHELL_DIRECTORY, file), "utf8");
      // Quoted preset-name literals are forbidden (plain prose like "focus-trap"
      // in comments is not a code branch).
      expect(source, file).not.toMatch(/["']focus["']/);
    }
  });

  it("the minimal-header composition is data, not code — no branch in the core decision layer", () => {
    const shellCore = readFileSync(path.join(srcDirectory, "core", "ui", "shell.ts"), "utf8");
    expect(shellCore).not.toMatch(/["']focus["']/);
  });

  it("the `prominent` VOCABULARY BRANCH lives in the shared CTA capability — never preset identity", () => {
    const engine = readFileSync(path.join(SHELL_DIRECTORY, "shell-engine.tsx"), "utf8");
    const ctaPrimitive = readFileSync(path.join(srcDirectory, "components", "ui", "cta.tsx"), "utf8");
    // P0-2: the presence/prominence semantics converged into ONE shared
    // capability (ui/cta.tsx), which branches on the `prominent` vocabulary
    // VALUE — never preset identity. The engine consumes that capability.
    expect(ctaPrimitive).toMatch(/style\s*===\s*["']prominent["']/);
    expect(ctaPrimitive).not.toMatch(/preset\s*===\s*["'][a-z]+["']/);
    expect(engine).not.toMatch(/preset\s*===\s*["']focus["']/);
    expect(engine).not.toMatch(/preset\s*===\s*["'][a-z]+["']/);
  });
});

describe("Phase UI-08 — workspace preset stays fully declarative at the architectural boundary", () => {
  const SHELL_DIRECTORY = path.join(srcDirectory, "components", "shell");

  it("the shell engine contains zero workspace-specific logic (source-scan for preset-name literals)", () => {
    for (const file of ["shell-engine.tsx", "shell-bottom-bar.tsx", "shell-mobile-nav.tsx", "index.ts"]) {
      const source = readFileSync(path.join(SHELL_DIRECTORY, file), "utf8");
      expect(source, file).not.toMatch(/["']workspace["']/);
    }
  });

  it("the shell decision core branches only on vocabulary/structural values — never the workspace preset", () => {
    const shellCore = readFileSync(path.join(srcDirectory, "core", "ui", "shell.ts"), "utf8");
    expect(shellCore).not.toMatch(/["']workspace["']/);
  });

  it("the sidebar-drawer composition is data, not code (no workspace branch in core)", () => {
    const defaults = readFileSync(path.join(srcDirectory, "core", "ui", "defaults.ts"), "utf8");
    expect(defaults).toMatch(/collapsible:\s*true/); // declaration only
    const shellCore = readFileSync(path.join(srcDirectory, "core", "ui", "shell.ts"), "utf8");
    expect(shellCore).not.toMatch(/["']workspace["']/);
  });
});

describe("Phase UI-09 — immersive preset stays fully declarative at the architectural boundary", () => {
  const SHELL_DIRECTORY = path.join(srcDirectory, "components", "shell");

  it("the shell engine contains zero immersive-specific logic (source-scan for preset-name literals)", () => {
    for (const file of ["shell-engine.tsx", "shell-bottom-bar.tsx", "shell-mobile-nav.tsx", "index.ts"]) {
      const source = readFileSync(path.join(SHELL_DIRECTORY, file), "utf8");
      expect(source, file).not.toMatch(/["']immersive["']/);
    }
  });

  it("the shell decision core branches only on vocabulary/structural values — never the immersive preset", () => {
    const shellCore = readFileSync(path.join(srcDirectory, "core", "ui", "shell.ts"), "utf8");
    expect(shellCore).not.toMatch(/["']immersive["']/);
  });

  it("the floating-overlay composition is data, not code (no immersive branch in core)", () => {
    const vocabulary = readFileSync(path.join(srcDirectory, "core", "ui", "vocabulary.ts"), "utf8");
    expect(vocabulary).toMatch(/["']floating["']/); // vocabulary value only
    const shellCore = readFileSync(path.join(srcDirectory, "core", "ui", "shell.ts"), "utf8");
    expect(shellCore).not.toMatch(/["']immersive["']/);
  });
});

describe("Phase UI-10 — the shared behavioral/accessibility contract stays preset-agnostic", () => {
  const UI_COMPONENTS_DIRECTORY = path.join(srcDirectory, "components", "ui");

  it("the Drawer modal primitive (focus/inert/backdrop/scroll) contains zero preset-name literals", () => {
    const drawer = readFileSync(path.join(UI_COMPONENTS_DIRECTORY, "drawer.tsx"), "utf8");
    for (const preset of ["classic", "adaptive", "focus", "workspace", "immersive"]) {
      expect(drawer, `drawer must not contain "${preset}"`).not.toMatch(new RegExp(`["']${preset}["']`));
    }
  });

  it("the shared ContentNavLinks consumer (active semantics) contains zero preset-name literals", () => {
    const consumer = readFileSync(
      path.join(srcDirectory, "components", "site", "context-nav-links.tsx"),
      "utf8",
    );
    for (const preset of ["classic", "adaptive", "focus", "workspace", "immersive"]) {
      expect(consumer, `context-nav-links must not contain "${preset}"`).not.toMatch(new RegExp(`["']${preset}["']`));
    }
  });

  it("the shell mobile-nav composes drawer/overlay only via the resolved vocabulary (never preset identity)", () => {
    const source = readFileSync(path.join(srcDirectory, "components", "shell", "shell-mobile-nav.tsx"), "utf8");
    for (const preset of ["classic", "adaptive", "focus", "workspace", "immersive"]) {
      expect(source, `shell-mobile-nav must not contain "${preset}"`).not.toMatch(new RegExp(`["']${preset}["']`));
    }
    // It composes the two client dialog PATTERNS structurally (B1: trigger owns
    // the id; panel uses the `${id}-panel` relationship and is named by trigger).
    expect(source).toContain('aria-controls={`${id}-panel`}');
    expect(source).toContain(`id={\`\${id}-panel\`}`);
  });
});

describe("Phase UI-01 — UI architecture contract boundaries", () => {
  const UI_CORE_DIRECTORY = path.join(srcDirectory, "core", "ui");
  const UI_CORE_MODULES = ["vocabulary.ts", "presentation.ts", "index.ts"];
  const UI_CORE_RESOLUTION_MODULES = ["defaults.ts", "resolve.ts", "shell.ts", "controls.ts"];

  it("the UI vocabulary and presentation contracts are framework-, config- and adapter-free", () => {
    for (const name of UI_CORE_MODULES) {
      const source = readFileSync(path.join(UI_CORE_DIRECTORY, name), "utf8");
      expect(source, name).not.toMatch(/from ["']next/);
      expect(source, name).not.toMatch(/from ["']react/);
      expect(source, name).not.toMatch(/from ["']zod/);
      expect(source, name).not.toMatch(/from ["']@\/adapters/);
      expect(source, name).not.toMatch(/from ["']@\/config/);
      expect(source, name).not.toContain("siteConfig");
    }
  });

  it("the UI resolution machinery is framework-free and adapter-free; only a type-only config import is allowed (UI-02", () => {
    for (const name of UI_CORE_RESOLUTION_MODULES) {
      const source = readFileSync(path.join(UI_CORE_DIRECTORY, name), "utf8");
      // No framework / zod / adapters / runtime config imports.

      expect(source, name).not.toMatch(/from ["']next/);
      expect(source, name).not.toMatch(/from ["']react/);
      expect(source, name).not.toMatch(/from ["']zod/);
      expect(source, name).not.toMatch(/from ["']@\/adapters/);
      expect(source, name).not.toContain("siteConfig");
      // The ONLY sanctioned config coupling is a TYPE-ONLY import (erased at
      // compile time), so runtime values never flow core ← config. The regex
      // allows `import type { ... } from "@/config/..."` but bans runtime
      // `import { ... } from "@/config/..."` and `import ... = require(...`.
      const runtimeConfigImport = source.match(/import\s+(?!type\b)[^"']*?from\s+["']@\/config["']/);
      expect(runtimeConfigImport, `${name} must not import config VALUES at runtime`).toBeNull();
      const requireConfig = source.match(/require\(\s*["']@\/config/);
      expect(requireConfig, `${name} must not require config at runtime`).toBeNull();
      // And every config import must be type-only (guards slip-through).
      const configImport = source.match(/from\s+["']@\/config[^"']*["']/g);
      for (const match of (configImport ?? [])) {
        // Ensure the import statement containing this specifier starts with `import type`。
        const stmtStart = Math.max(0, source.lastIndexOf("import", source.indexOf(match)));
        const importStmt = source.slice(stmtStart, source.indexOf(match) + match.length);
        expect(importStmt.trim().startsWith("import type"), `${name}: config import must be type-only`).toBe(true);
      }
    }
  });
});


describe("D2 — footer long-content robustness (source contract)", () => {
  const COMPONENTS_DIRECTORY = path.join(process.cwd(), "src", "components", "site");

  function readComponent(name: string): string {
    return readFileSync(path.join(COMPONENTS_DIRECTORY, name), "utf8");
  }

  it("the footer grid carries a wrap rule so long unbreakable strings (e.g. a long email) wrap within their column", () => {
    const footer = readComponent("site-footer.tsx");
    // The reusable footer must never rely on the *content* being short. The grid
    // wrapper applies `break-words` (overflow-wrap: break-word via Tailwind) so
    // a legitimate long email/phone/nav/business-name token wraps instead of
    // bleeding into an adjacent column or forcing horizontal page overflow.
    expect(footer).toContain('break-words');
  });

  it("the footer copyright spans the full width on desktop so it reads as one coherent line", () => {
    const footer = readComponent("site-footer.tsx");
    // On lg the footer is a 4-column grid; the copyright is the 5th child. It
    // must span all four columns (`lg:col-span-4`) rather than a single 192px
    // column, which would wrap a normal business name to multiple lines.
    expect(footer).toContain("lg:col-span-4");
  });
});
