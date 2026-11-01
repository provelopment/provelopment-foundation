import { createElement } from "react";

import { renderWithRouting } from "../support/client-routing";
import { describe, expect, it, vi } from "vitest";

let mockPath = "/ww/en";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

import { ContextNavLinks, type ContextNavLink } from "@/components/site/context-nav-links";

const links: readonly ContextNavLink[] = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "https://example.com", label: "External" },
];

function render() {
    return renderWithRouting(createElement(ContextNavLinks, { locale: "en", links }));
}

/**
 * UI-10 B2 — active navigation semantics in the shared ContextNavLinks consumer.
 *
 * The consumer feeds the ≥md header nav, the aside (sidebar) bands, the mobile
 * drawer/overlay children, and the footer — so one fix propagates across every
 * placement. `aria-current="page"` must land on the ACTIVE INTERNAL link only,
 * using the same route comparison as the bottom navigation; external links never
 * carry it.
 */
describe("ContextNavLinks — active navigation semantics (UI-10 B2)", () => {
    it("marks the active internal page with aria-current and nothing else", () => {
        mockPath = "/ww/en";
        const html = render();
        expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(1);
        // Home ("/") resolves to "/ww/en" and is current (either attribute order):
        expect(html).toMatch(
            /href="\/ww\/en"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/ww\/en"/,
        );
    });

    it("marks a deep internal page and NEVER an external link", () => {
        mockPath = "/ww/en/about";
        const html = render();
        expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(1);
        expect(html).toMatch(
            /href="\/ww\/en\/about"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/ww\/en\/about"/,
        );
        // The external link is present, opens a new tab, but carries no aria-current:
        expect(html).toContain("https://example.com");
        expect(html).toContain('target="_blank"');
        expect(html).not.toMatch(/href="https:[^"]+"[^>]*?aria-current="page"/);
    });

    it("marks no link current when the pathname matches nothing", () => {
        mockPath = "/ww/en/unknown";
        const html = render();
        expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(0);
    });

    /**
     * D43 / R04-C33-R02 — a Page route's LETTER CASE is not identity.
     *
     * `/ww/en/About` serves the `/ww/en/about` Page (D43), so the accessibility contract has to
     * follow the PAGE: the typed casing may differ from the emitted address and the visitor must
     * still be told where they are. The comparison is folded; nothing about the destination is.
     */
    it("marks the same Page current when only the Page letter case differs (D43)", () => {
        mockPath = "/ww/en/About";
        const html = render();
        // Exactly the About item is current — the same single marker the canonical address produces:
        expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(1);
        expect(html).toMatch(
            /href="\/ww\/en\/about"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/ww\/en\/about"/,
        );
        // The shared item-wrapper marker lands on the same item:
        expect(html.match(/<li class="aria-current-page">/g) ?? []).toHaveLength(1);
        // The GENERATED href is untouched: no casing was "repaired" in the DOM, and Home is not current.
        expect(html).toContain('href="/ww/en/about"');
        expect(html).not.toMatch(/href="\/ww\/en\/About"/);
        expect(html).not.toMatch(/href="\/ww\/en"[^>]*aria-current="page"/);
        // Externals are still never current, whatever the pathname says.
        expect(html).not.toMatch(/href="https:[^"]*"[^>]*aria-current="page"/);
    });

    it("does not invent a current Page for a different word in a different case (D43 folds letters, not words)", () => {
        mockPath = "/ww/en/Aboutt";
        expect(render().match(/aria-current="page"/g) ?? []).toHaveLength(0);
        mockPath = "/ww/en/about/extra";
        expect(render().match(/aria-current="page"/g) ?? []).toHaveLength(0);
    });
});

/**
 * P0-5 — link-semantics convergence: the rendered LINK contract is the shared
 * `NavItem` primitive (internal Next Link, external new-tab + rel=noreferrer,
 * `aria-current="page"`, and the badge chip). ContextNavLinks keeps only the
 * URL/region-aware context — resolution, active computation, list composition.
 */
/**
 * P5-5A — contract hardening acceptance of the configurable navigation-item
 * surface THROUGH the shared context renderer:
 *  - icon flows to a replaceable /assets/<name> <img> (ui-nav-item-icon),
 *  - disabled renders aria-disabled + non-navigable + stays in DOM,
 *  - sortByRegion orders deterministic top → middle → bottom.
 */
describe("ContextNavLinks — P5-5A configurable navigation items (icon / disabled / region)", () => {
    it("renders a configured item icon as the replaceable /assets asset", () => {
        mockPath = "/ww/en";
        const html = renderWithRouting(
            createElement(ContextNavLinks, {
                locale: "en",
                links: [{ href: "/about", label: "About", icon: "about.svg" }],
            }),
        );
        expect(html).toContain('src="/assets/about.svg"');
        expect(html).toContain("ui-nav-item-icon");
        expect(html).toContain("ui-nav-item--has-icon");
        expect(html).toContain(">About</span>"); // the label remains the accessible name
    });

    it("renders a disabled item as aria-disabled, NOT navigable, but still in the DOM", () => {
        mockPath = "/ww/en";
        const html = renderWithRouting(
            createElement(ContextNavLinks, {
                locale: "en",
                links: [{ href: "/legacy", label: "Legacy", disabled: true }],
            }),
        );
        expect(html).toContain('aria-disabled="true"');
        expect(html).toContain(">Legacy</span>");
        // Disabled items must not become navigable links:
        expect(html).not.toMatch(/<a[^>]*href="[^"]*legacy/);
    });

    it("orders by region top → middle → bottom deterministically when sortByRegion is set", () => {
        mockPath = "/ww/en";
        const shuffled: readonly ContextNavLink[] = [
            { href: "/bottom1", label: "B1", position: "bottom" },
            { href: "/top2", label: "T2", position: "top" },
            { href: "/mid1", label: "M1" }, // undefined → middle (default)
            { href: "/mid2", label: "M2", position: "middle" },
            { href: "/top1", label: "T1", position: "top" },
        ];
        const html = renderWithRouting(createElement(ContextNavLinks, { locale: "en", links: shuffled, sortByRegion: true }));
        // Contract: groups are ordered top → middle → bottom, STABLE within each
        // group (configured relative order preserved — the shuffle put top2
        // before top1, so the top group renders T2 then T1).
        const order = ["T2", "T1", "M1", "M2", "B1"];
        let lastIndex = -1;
        for (const label of order) {
            const at = html.indexOf(`>${label}</span>`);
            expect(at).toBeGreaterThan(lastIndex);
            lastIndex = at;
        }
        // Without sortByRegion the configuration order is untouched.
        const unsorted = renderWithRouting(createElement(ContextNavLinks, { locale: "en", links: shuffled }));
        const first = unsorted.indexOf(">B1</span>");
        expect(first).toBeGreaterThan(-1);
    });
});

describe("ContextNavLinks — P0-5 shared link path", () => {
    it("renders the demo badge through the shared nav-item-badge chip (not a second badge implementation)", () => {
        mockPath = "/ww/en";
        const html = renderWithRouting(
            createElement(ContextNavLinks, {
                locale: "en",
                links: [{ href: "/contact", label: "Message Us", demoOnly: true }],
                demoBadgeLabel: "Demo",
            }),
        );
        // Label preserved and the single badge chip is the shared NavItem badge:
        expect(html).toContain("Message Us");
        expect(html.match(/class="nav-item-badge"/g) ?? []).toHaveLength(1);
        expect(html).not.toMatch(/rounded bg-accent|inline-flex items-center gap-1\.5/);
    });

    it("the active internal item's li carries the shared aria-current-page marker (NavItem path)", () => {
        mockPath = "/ww/en/about";
        const html = render();
        // Only NavItem emits the `aria-current-page` marker on the item wrapper.
        expect(html.match(/<li class="aria-current-page">/g) ?? []).toHaveLength(1);
        expect(html).toContain('href="/ww/en/about"');
    });

    it("every rendered item is an li>a pair via NavItem (no direct a/Link in the consumer)", () => {
        mockPath = "/ww/en";
        const html = render();
        // Three configured links → three <li> wrappers, each containing exactly one anchor.
        expect(html.match(/<li/g) ?? []).toHaveLength(3);
        expect(html.match(/<a /g) ?? []).toHaveLength(3);
    });
});

/**
 * P5-6 — duplicate-destination identity. Two navigation entries sharing one
 * `href` is VALID configuration; React identity comes from `key` (the
 * position-derived key stamped by `getSiteNavLinks`), NEVER from `href`.
 * Locks: every same-href entry renders; each keeps its own label/icon/disabled
 * state; sorting by region keeps both entries correctly ordered.
 */
describe("ContextNavLinks — P5-6 duplicate-href identity", () => {
  it("renders every same-href entry with its own label", () => {
    mockPath = "/ww/en";
    const html = renderWithRouting(
      createElement(ContextNavLinks, {
        locale: "en",
        links: [
          { href: "/pricing", label: "Alpha", key: "nav:0" },
          { href: "/pricing", label: "Beta", key: "nav:1" },
        ],
      }),
    );
    expect(html).toContain(">Alpha</span>");
    expect(html).toContain(">Beta</span>");
    expect(html.match(/href="\/ww\/en\/pricing"/g) ?? []).toHaveLength(2);
  });

  it("keeps each same-href entry's own icon, disabled state and region under sort", () => {
    mockPath = "/ww/en";
    const html = renderWithRouting(
      createElement(ContextNavLinks, {
        locale: "en",
        links: [
          { href: "/pricing", label: "Alpha", icon: "alpha.svg", position: "top", key: "nav:0" },
          { href: "/pricing", label: "Beta", icon: "beta.svg", position: "bottom", disabled: true, key: "nav:1" },
          { href: "/mid", label: "Mid", icon: "mid.svg", key: "nav:2" },
        ],
        sortByRegion: true,
      }),
    );
    // Beta (disabled) is the span[aria-disabled] item with its OWN icon + label.
    const betaSpan = html.indexOf('aria-disabled="true"');
    expect(betaSpan).toBeGreaterThan(-1);
    expect(html.indexOf('src="/assets/beta.svg"')).toBeGreaterThan(betaSpan);
    expect(html.slice(betaSpan).includes("Beta")).toBe(true);
    // Region sort: Alpha(top) → Mid(middle) → Beta(bottom); both duplicates present.
    const alphaLink = html.indexOf('href="/ww/en/pricing"');
    const midText = html.indexOf(">Mid</span>");
    const betaText = html.indexOf(">Beta</span>");
    expect(alphaLink).toBeGreaterThan(-1);
    expect(midText).toBeGreaterThan(alphaLink);
    expect(betaText).toBeGreaterThan(midText);
    // Alpha (enabled) keeps its OWN icon.
    expect(html.indexOf('src="/assets/alpha.svg"')).toBeGreaterThan(-1);
  });
});
