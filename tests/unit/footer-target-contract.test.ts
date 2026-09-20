import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/en" }));

import {
  ContextNavLinks,
  type ContextNavLink,
} from "@/components/site/context-nav-links";
import {
  FOOTER_LINK_CLASS,
  FOOTER_TARGET_CLASS,
} from "@/components/site/footer-link-class";

/**
 * VIS2S — THE SHARED FOOTER LINK TARGET CONTRACT
 *
 * WHY THIS SUITE EXISTS
 * ---------------------
 * Every footer link was a plain inline text anchor with no minimum box, so each one
 * measured exactly ONE LINE TALL (21px) and the narrowest — a short label such as
 * `Help` — measured 36×21. Reachability therefore depended on how many characters a
 * label happened to have, which no visitor can be asked to compensate for.
 *
 * The floor applied here is the one the shared shell already uses for the header
 * brand and the mobile navigation trigger, `inline-flex min-h-11 min-w-11
 * items-center`, where Tailwind's `11` is `2.75rem` = **44px**.
 *
 * The suite proves the CONTRACT, never one particular label:
 *   · the floor carries `min-h-11`/`min-w-11` and is composed, not duplicated;
 *   · EVERY rendered footer link carries it — asserted on the shortest label that
 *     exposed the defect and on a long one, so a future copy change cannot silently
 *     re-open it;
 *   · every interactive footer path (the navigation lists, the legal links, the
 *     Connect heading link, the business-info links) goes through the shared floor
 *     instead of a bare hover-only class;
 *   · the treatment adds NO typography — the footer does not become bulky.
 */

const ROOT = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(ROOT, ...segments), "utf8");
const SITE = ["src", "components", "site"];

/** The worst case the defect was measured on, plus a long label and an external one. */
const LINKS: readonly ContextNavLink[] = [
  { href: "/help", label: "Help" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "https://example.com", label: "GitHub" },
];

/** The footer's own list rendering: the shared component plus the footer's link class. */
const renderFooterList = () =>
  renderToStaticMarkup(
    ContextNavLinks({ locale: "en", links: LINKS, linkClassName: FOOTER_LINK_CLASS }),
  );

describe("VIS2S — the shared footer link target contract", () => {
  it("A. the floor IS the programme's ≥44px treatment (min-h-11 / min-w-11 = 2.75rem)", () => {
    expect(FOOTER_TARGET_CLASS).toContain("inline-flex");
    expect(FOOTER_TARGET_CLASS).toContain("min-h-11");
    expect(FOOTER_TARGET_CLASS).toContain("min-w-11");
    expect(FOOTER_LINK_CLASS).toContain(FOOTER_TARGET_CLASS);
  });

  it("B. EVERY rendered footer link carries the floor, whatever its label length", () => {
    const html = renderFooterList();
    const anchors = html.match(/<a\b[^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThanOrEqual(1);

    for (const anchor of anchors) {
      expect(anchor).toContain("min-h-11");
      expect(anchor).toContain("min-w-11");
    }
  });

  it("C. site-footer.tsx routes every list AND its legal links through the shared floor", () => {
    const source = read(...SITE, "site-footer.tsx");

    // Connect methods, social, the optional footer group, the primary group.
    const listUsages = source.match(/\blinkClassName=\{FOOTER_LINK_CLASS\}/g) ?? [];
    expect(listUsages.length).toBeGreaterThanOrEqual(4);

    // The legal documents are footer links too (exactly one legal list).
    const legalUsages = source.match(/\bclassName=\{FOOTER_LINK_CLASS\}/g) ?? [];
    expect(legalUsages).toHaveLength(1);

    // No footer link may fall back to a bare hover-only class.
    expect(source).not.toContain('linkClassName="hover:text-primary"');
    expect(source).not.toContain('className="hover:text-primary"');
  });

  it("D. the Connect heading link and the business-info links carry the same floor", () => {
    const heading = read(...SITE, "context-connect-heading.tsx");
    expect(heading).toContain("FOOTER_TARGET_CLASS");
    expect(heading).toMatch(/linkClass = `\$\{FOOTER_TARGET_CLASS\}/);

    const info = read(...SITE, "business-info.tsx");
    expect((info.match(/FOOTER_LINK_CLASS/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(info).not.toContain('className="hover:text-primary"');
  });

  it("E. the floor adds NO typography — footer links keep their visual size", () => {
    for (const value of [FOOTER_TARGET_CLASS, FOOTER_LINK_CLASS]) {
      expect(value).not.toMatch(/text-(xs|sm|base|lg|xl)/);
      expect(value).not.toMatch(/font-(bold|semibold|medium)/);
    }
  });
});
