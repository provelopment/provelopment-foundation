import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const value = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [value, () => undefined];
    },
    useEffect: () => undefined,
    useRef: () => ({ current: null }),
  };
});

import { SiteHeader } from "@/components/site/site-header";
import { ShellMobileNav } from "@/components/shell";
import { resolveUiConfig } from "@/core/ui";

/**
 * VIS1C — THE SHARED SHELL'S TOUCH-TARGET CONTRACT
 *
 * Two shared controls are the whole shell's interaction surface on a phone, and
 * both were sized by their ARTWORK rather than by their hit area:
 *
 *   · the mobile navigation trigger — the ONLY entry point to the drawer, sized
 *     by its `h-8 w-8` icon → a 32px target;
 *   · the brand/home link — the primary "go home" target, sized by the `h-8`
 *     lockup → a 32px target.
 *
 * This suite pins the CONTRACT (the rendered class set that produces >= 44x44)
 * and the two properties that must NOT change to achieve it: the artwork keeps its
 * visual scale, and the desktop/other patterns are untouched.
 *
 * It asserts the CONTRACT, not computed pixels: jsdom has no layout engine and
 * these stylesheets are not loaded here. The real PIXEL measurement is the
 * browser evidence recorded with the change; this suite is the regression guard
 * that stops the contract being removed in a later refactor.
 */

const SHELL_UI = {
  navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
} as const;

const mobileNavHtml = (): string =>
  renderToStaticMarkup(
    ShellMobileNav({
      pattern: "drawer",
      triggerLabel: "Show navigation",
      id: "shell-mobile-nav",
      className: "md:hidden",
      closeLabel: "Hide navigation",
      children: null,
    }),
  );

const headerHtml = (): string =>
  renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolveUiConfig(SHELL_UI) }));

/** The opening tag of the first element carrying `className`. */
function openingTagFor(html: string, className: string): string {
  const index = html.indexOf(className);
  expect(index, `expected an element carrying ${className}`).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", index);
  const end = html.indexOf(">", index);
  return html.slice(start, end + 1);
}

describe("VIS1C — shared shell touch targets", () => {
  it("gives the mobile navigation trigger a >= 44x44 hit area", () => {
    const tag = openingTagFor(mobileNavHtml(), "ui-shell-mobile-nav-trigger");
    expect(tag).toContain("min-h-11");
    expect(tag).toContain("min-w-11");
    // The control is a real button and stays the sole drawer trigger.
    expect(tag).toContain("<button");
    expect(tag).toContain('aria-controls="shell-mobile-nav-panel"');
    // Still phone-only: the >=md compositions are unaffected by this contract.
    expect(tag).toContain("md:hidden");
  });

  it("does NOT enlarge the trigger's artwork to reach the target size", () => {
    const html = mobileNavHtml();
    expect(html).toContain("ui-mobile-nav-icon h-8 w-8 shrink-0");
    expect(html).toContain("Show navigation");
  });

  it("keeps the desktop composition free of the mobile-only trigger", () => {
    // The trigger is `md:hidden`; a desktop render must not expose it.
    const html = headerHtml();
    expect(html).not.toContain("ui-shell-mobile-nav-trigger md:hidden");
  });
});

/**
 * THE BRAND LINK IS ASSERTED AT SOURCE, ON PURPOSE.
 *
 * The generic template ships NO logo (`site.config.json` configures no
 * `site.assets.logo`), so this module renders its TEXT brand fallback here and the
 * logo-branch link simply does not exist to render. Rather than mock the site's
 * configuration — which would test the mock, not the contract — this guard reads
 * the header module and pins the two properties that must hold together:
 *
 *   1. the `ui-site-header-brand` link carries the >= 44px hit-area contract;
 *   2. the lockup inside it keeps its `h-8` visual scale.
 *
 * The PIXEL proof for this control is the browser measurement recorded with the
 * change (a real site, a real logo, a real layout engine). This test is the
 * regression guard that stops either half being removed.
 */
describe("VIS1C — shared brand/home link contract (source guard)", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/site/site-header.tsx"),
    "utf8",
  );

  it("carries the >= 44px hit-area contract on the brand link", () => {
    const brand = source.slice(source.indexOf("ui-site-header-brand"));
    const classNameLine = brand.slice(0, brand.indexOf("\n"));
    expect(classNameLine).toContain("min-h-11");
    expect(classNameLine).toContain("min-w-11");
  });

  it("leaves the lockup artwork at its existing visual scale", () => {
    expect(source).toContain("ui-site-header-logo h-8 w-auto");
  });
});

