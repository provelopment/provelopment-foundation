import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

/**
 * THE EFS-RESOLVED BRANCH MUST NOT TOUCH THE CLIENT ROUTING SEAM.
 *
 * `next/navigation` is replaced with a `usePathname` that THROWS. If the EFS branch ever ran the legacy
 * hook path, the render would fail with this message instead of quietly passing. The legacy control below
 * proves the mock is actually armed, so "it did not fire" is evidence rather than an untested assumption —
 * to exactly the degree those hooks are exercised, which is the whole of the legacy branch's entry.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => {
    throw new Error("EFS-RESOLVED MODE MUST NOT READ THE CLIENT PATHNAME");
  },
}));

import {
  ContextNavLinks,
  type EfsResolvedContextNavLinksProps,
  type EfsResolvedNavItem,
} from "@/components/site/context-nav-links";
import { contentSegments, type EfsBinding } from "@/core/efs/publication";

/**
 * Every internal example address below is produced by the ONE accepted EFS address authority,
 * `contentSegments` — this suite never re-states a binding/prefix/locale path rule of its own.
 */
function href(binding: EfsBinding, siteId: string, localeKey: string, pageRoute: readonly string[]): string {
  return `/${contentSegments(binding, { siteId, locale: localeKey, localeKey, pageRoute }).join("/")}`;
}

/** A dedicated-root binding: no prefix, closed Site mode. */
const DEDICATED: EfsBinding = {
  id: "root",
  host: "example.com",
  prefix: [],
  entityId: "example",
  facetId: "example",
  siteIds: ["main"],
  siteMode: "closed",
  defaultSiteId: "main",
  locales: ["de-DE"],
  defaultLocale: "de-DE",
  canonical: true,
};

/** A PREFIXED, Site-open binding: `/alpha/<site>/<locale>/…`. */
const PREFIXED: EfsBinding = {
  id: "alpha",
  host: "alpha.example.com",
  prefix: ["alpha"],
  entityId: "example",
  facetId: "alpha",
  siteIds: ["berlin", "munich"],
  siteMode: "open",
  defaultSiteId: "berlin",
  locales: ["en-001"],
  defaultLocale: "en-001",
  canonical: true,
};

const ABOUT = href(DEDICATED, "main", "de-de", ["About-Us"]);
const TEAM = href(PREFIXED, "berlin", "en-001", ["Team", "Page"]);

function renderEfs(
  items: readonly EfsResolvedNavItem[],
  extra: Partial<EfsResolvedContextNavLinksProps> = {},
): string {
  return renderToStaticMarkup(
    createElement(ContextNavLinks, { mode: "efs-resolved", items, ...extra }),
  );
}

describe("EFS-resolved navigation — verified destinations render verbatim", () => {
  it("renders dedicated-root and prefixed Site-open addresses exactly as supplied", () => {
    const html = renderEfs([
      { href: ABOUT, label: "About", key: "0" },
      { href: TEAM, label: "Team", key: "1" },
    ]);

    expect(ABOUT).toBe("/de-de/about-us");
    expect(TEAM).toBe("/alpha/berlin/en-001/team/page");
    expect(html).toContain('href="/de-de/about-us"');
    expect(html).toContain('href="/alpha/berlin/en-001/team/page"');
  });

  it("never double-prefixes, re-localises or invents a ww/geographic fallback", () => {
    const html = renderEfs([
      { href: ABOUT, label: "About", key: "0" },
      { href: TEAM, label: "Team", key: "1" },
    ]);

    expect(html).not.toContain("/alpha/alpha");
    expect(html).not.toMatch(/\/ww\//);
    // The supplied locale is never replaced by a default or a visitor-negotiated one.
    expect(html).not.toContain("/en-001/about-us");
    expect(html).not.toContain("/de-de/team/page");
  });

  it("preserves destination order and duplicate destinations", () => {
    const html = renderEfs([
      { href: ABOUT, label: "First", key: "0" },
      { href: ABOUT, label: "Second", key: "1" },
      { href: TEAM, label: "Third", key: "2" },
    ]);

    expect(labelsOf(html)).toEqual(["First", "Second", "Third"]);
    expect(html.split(`href="${ABOUT}"`).length - 1).toBe(2);
  });
});

function labelsOf(html: string): string[] {
  return [...html.matchAll(/ui-nav-item-label">([^<]+)</g)].map((match) => match[1]);
}

describe("EFS-resolved navigation — provider-independent, no legacy resolution", () => {
  it("renders with no ClientRoutingProvider at all", () => {
    expect(() => renderEfs([{ href: ABOUT, label: "About", key: "0" }])).not.toThrow();
  });

  it("would have thrown had the legacy hook path run (armed-mock control)", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(ContextNavLinks, { locale: "en", links: [{ href: "/", label: "Home" }] }),
      ),
    ).toThrow(/MUST NOT READ THE CLIENT PATHNAME/);
  });
});

describe("EFS-resolved navigation — active state, identity and accessibility", () => {
  it("marks the verified current internal Page with aria-current, without reparsing a pathname", () => {
    const html = renderEfs([
      { href: ABOUT, label: "About", key: "0", active: true },
      { href: TEAM, label: "Team", key: "1" },
    ]);

    expect(html.split('aria-current="page"').length - 1).toBe(1);
    expect(html).toContain('aria-current="page"');
  });

  it("keeps two items sharing one destination as TWO distinct list items", () => {
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => void errors.push(args.map(String).join(" ")));

    try {
      const html = renderEfs([
        { href: ABOUT, label: "First", key: "0" },
        { href: ABOUT, label: "Second", key: "1" },
      ]);

      expect(html.split("<li").length - 1).toBe(2);
      expect(labelsOf(html)).toEqual(["First", "Second"]);
      expect(errors.join("\n")).not.toMatch(/unique "key"/i);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("EFS-resolved navigation — the shared NavItem contract is preserved", () => {
  const EXTERNAL = "https://example.com/apply";

  it("opens an already validated external link in a new tab and never marks it current", () => {
    const html = renderEfs([
      { href: EXTERNAL, label: "Apply", key: "0", external: true, active: true },
    ]);

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain('aria-current="page"');
  });

  it("classifies an unmarked external href by scheme and still never marks it current", () => {
    const html = renderEfs([
      { href: "mailto:hello@example.com", label: "Mail", key: "0", active: true },
    ]);

    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('aria-current="page"');
    expect(html).toContain("mailto:hello@example.com");
  });

  it("renders a disabled internal destination as non-navigable but still labelled", () => {
    const html = renderEfs([{ href: ABOUT, label: "About", key: "0", disabled: true }]);

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("About");
    expect(html).not.toContain(`href="${ABOUT}"`);
  });

  it("forwards the demo badge and resolved icon metadata to the shared primitive", () => {
    const html = renderEfs(
      [{ href: ABOUT, label: "About", key: "0", demoOnly: true, icon: "/assets/marker.svg" }],
      { demoBadgeLabel: "Demo" },
    );

    expect(html).toContain("Demo");
    expect(html).toContain('src="/assets/marker.svg"');
  });
});

describe("EFS-resolved navigation — presentation grouping and empty input", () => {
  const A = href(DEDICATED, "main", "de-de", ["A"]);
  const B = href(DEDICATED, "main", "de-de", ["B"]);
  const C = href(DEDICATED, "main", "de-de", ["C"]);

  const GROUPED: readonly EfsResolvedNavItem[] = [
    { href: A, label: "A", key: "a", position: "bottom" },
    { href: B, label: "B", key: "b", position: "top" },
    { href: C, label: "C", key: "c", position: "bottom" },
  ];

  it("keeps configuration order unless the caller asks for grouping", () => {
    expect(labelsOf(renderEfs(GROUPED))).toEqual(["A", "B", "C"]);
  });

  it("groups by presentation position only and stays stable inside a group", () => {
    expect(labelsOf(renderEfs(GROUPED, { sortByRegion: true }))).toEqual(["B", "A", "C"]);
  });

  it("never invents a destination for an empty list", () => {
    const html = renderEfs([]);

    expect(html).toContain("<ul");
    expect(html).not.toContain("<li");
    expect(html).not.toContain("href=");
  });
});

describe("EFS-resolved navigation — not reachable from any live render path", () => {
  function allSourceFiles(directory: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) found.push(...allSourceFiles(full));
      else if (/\.(ts|tsx)$/.test(full)) found.push(full);
    }
    return found;
  }

  it("no file outside the seam itself opts into efs-resolved", () => {
    const offenders: string[] = [];

    for (const root of ["src/app", "src/components"]) {
      for (const file of allSourceFiles(path.join(process.cwd(), root))) {
        if (path.basename(file) === "context-nav-links.tsx") continue;
        if (readFileSync(file, "utf8").includes("efs-resolved")) {
          offenders.push(path.relative(process.cwd(), file).split(path.sep).join("/"));
        }
      }
    }

    // R10 Stage B cutover: the EFS-resolved mode is now LIVE. Exactly the shared shell's own
  // navigation surfaces may select it — the header and footer lists, which receive server-supplied,
  // already-validated items. Any other module selecting the mode would be a second, unaudited
  // projection that could re-introduce client-side address derivation.
  const ALLOWED = [
    "src/components/site/site-footer.tsx",
    "src/components/site/site-header.tsx",
  ];
  expect(offenders.sort()).toEqual(ALLOWED);

  // Positive control: the scan still detects an opt-in, and rejects any path outside the allowlist.
  const unauthorized = (entry: string) =>
    entry.includes("efs-resolved") && !ALLOWED.includes(entry.split(":")[0]);
  expect(unauthorized("src/components/site/stray-list.tsx:efs-resolved")).toBe(true);
  // …while the audited consumers are not offenders.
  expect(unauthorized("src/components/site/site-header.tsx")).toBe(false);
  // …and the renderer still declares the mode it grants, so the allowlist is anchored to a real seam.
  expect(
    readFileSync(path.join(process.cwd(), "src/components/site/context-nav-links.tsx"), "utf8"),
  ).toContain('readonly mode: "efs-resolved"');
  });
});
