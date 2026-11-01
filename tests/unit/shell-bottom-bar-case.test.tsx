import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * R04-C33-R02 — the MOBILE BOTTOM BAR's active-item comparison (`D43`).
 *
 * The shared context navigation and this bar are the two consumers that decide "is this destination
 * the current page?" by comparing the pathname with a resolved href. `D43` made a Page route's LETTER
 * CASE non-identity, so a visitor at `/de-de/About` is on the same Page as `/de-de/about` — and the
 * accessibility marker has to say so. The bar is asserted SEPARATELY here because a fix in the shared
 * context component cannot cover it: it renders through its own `BottomNavigation` → `NavItem` path.
 *
 * The bar is rendered with its REAL shared primitives (no stubs beyond the platform hook), so these
 * assertions cover the shipped `aria-current` mechanism rather than a re-implementation of it.
 */

let mockPath: string | null = "/ww/en";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

import { ShellBottomBar, type ShellBottomBarLink } from "@/components/shell/shell-bottom-bar";
import { compatibilityClientRouting } from "../support/client-routing";

const links: readonly ShellBottomBarLink[] = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "https://example.com", label: "External" },
];

const render = (pathname: string | null): string => {
    mockPath = pathname;
    return renderToStaticMarkup(
        createElement(ShellBottomBar, {
            label: "Navigation",
            links,
            locale: "en",
            pageBindings: compatibilityClientRouting.pageBindings,
            siteSet: compatibilityClientRouting.siteSet,
        }),
    );
};

/** The hrefs of the anchors the shell announces as the current page. */
const activeHrefs = (html: string): readonly string[] =>
    (html.match(/<a\b[^>]*>/g) ?? [])
        .filter((anchor) => /aria-current="page"/.test(anchor))
        .map((anchor) => /href="([^"]*)"/.exec(anchor)?.[1] ?? "(none)");

/** The same markup with ONLY the active decoration removed — everything else must not move. */
const withoutActive = (html: string): string =>
    html.replace(/ aria-current="page"/g, "").replace(/<li class="aria-current-page">/g, "<li>");

describe("ShellBottomBar — D43 case-insensitive active item (R04-C33-R02)", () => {
    it("marks the destination the visitor is actually on (canonical address)", () => {
        const html = render("/ww/en/about");
        expect(activeHrefs(html)).toEqual(["/ww/en/about"]);
        // Every configured destination still renders, in configured order:
        expect((html.match(/<a\b/g) ?? []).length).toBe(3);
        expect(html.indexOf(">Home</span>")).toBeLessThan(html.indexOf(">About</span>"));
        expect(html.indexOf(">About</span>")).toBeLessThan(html.indexOf(">External</span>"));
    });

    it("marks the SAME destination when only the Page letter case differs (D43)", () => {
        const canonical = activeHrefs(render("/ww/en/about"));
        for (const typed of ["/ww/en/About", "/ww/en/ABOUT"]) {
            expect(activeHrefs(render(typed)), typed).toEqual(canonical);
        }
        // …and the emitted destination is still the lowercase one: nothing was rewritten to match.
        expect(render("/ww/en/About")).toContain('href="/ww/en/about"');
        expect(render("/ww/en/About")).not.toMatch(/href="\/ww\/en\/About"/);
    });

    it("changes nothing but the active marker (same markup, same links, same order)", () => {
        expect(withoutActive(render("/ww/en/About"))).toBe(withoutActive(render("/ww/en/about")));
        expect(withoutActive(render("/ww/en/ABOUT"))).toBe(withoutActive(render("/ww/en/about")));
    });

    it("leaves an unknown Page and an external destination unmarked", () => {
        expect(activeHrefs(render("/ww/en/unknown"))).toEqual([]);
        // D43 folds LETTERS, not words:
        expect(activeHrefs(render("/ww/en/Aboutt"))).toEqual([]);
        // An external destination can never become current, at any pathname:
        const mixed = render("/ww/en/About");
        expect(mixed).not.toMatch(/href="https:\/\/example\.com"[^>]*aria-current="page"/);
        expect(mixed).toContain('target="_blank"');
        expect(mixed).toContain('rel="noreferrer"');
    });

    it("keeps a missing pathname non-current (the existing null contract)", () => {
        expect(activeHrefs(render(null))).toEqual([]);
    });
});
