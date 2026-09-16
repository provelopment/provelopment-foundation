import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { resolveUiConfig } from "@/core/ui";
import { FOUNDATION_UI_DEFAULTS } from "@/core/ui/defaults";

/**
 * FS-5 — configuration-first presentation: the page/background color is a
 * validated `ui.theme.background` value that flows through resolution into the
 * existing `--background` CSS-token mechanism. Proves the four contract points:
 * default (absent → existing token), configured (value reaches the token),
 * resolver passthrough, and the layout wiring (no inline component styles, no
 * identity branch).
 */
describe("FS-5 — background color presentation (configuration-first)", () => {
  it("default: absent ui.theme.background preserves the Foundation background token", () => {
    const resolved = resolveUiConfig({});
    expect(resolved.theme.background).toBeUndefined();
  });

  it("configured: the hex value resolves and is carried on the resolved config", () => {
    const resolved = resolveUiConfig({ theme: { background: "#fafafa" } });
    expect(resolved.theme.background).toBe("#fafafa");
  });

  it("identity-free: the background is a config value, not an identity branch", () => {
    const explicit = resolveUiConfig({
      navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
      theme: { background: "#123456" },
    });
    expect(explicit.theme.background).toBe("#123456");
    expect(resolveUiConfig({ theme: { background: "#123456" } }).theme.background).toBe("#123456");
  });

  it("layout renders the configured value through the existing --background token", () => {
    const layout = readFileSync(
      path.join(process.cwd(), "src", "app", "[locale]", "layout.tsx"),
      "utf8",
    );
    // The configured value is emitted as the CSS custom property on the root
    // element (`--background`), consumed by `body { background: var(--background) }`
    // and the `bg-background` utilities — no inline component background styles.
    expect(layout).toContain("resolvedUi.theme.background");
    expect(layout).toContain("\"--background\": resolvedUi.theme.background");
  });

  it("the Foundation default theme table stays background-free (no drifting default)", () => {
    expect(FOUNDATION_UI_DEFAULTS.theme.background).toBeUndefined();
  });
});