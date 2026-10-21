import { describe, expect, it } from "vitest";

import {
  advertisedHreflang,
  canonicalLocaleTag,
  localePathKey,
  localeTagIssue,
  resolveRepresentation,
  selectEntryLocale,
} from "@/core/efs/locales";

describe("EFS localization target (D31 / O-2)", () => {
  it("uses conventional canonical case and lowercase path keys", () => {
    expect(canonicalLocaleTag("fr-ca")).toBe("fr-CA");
    expect(localePathKey("fr-CA")).toBe("fr-ca");
    expect(canonicalLocaleTag("en-001")).toBe("en-001");
    expect(localeTagIssue("not_a_locale")).not.toBeNull();
  });

  it("lets an explicit supported locale win over cookie and header", () => {
    const result = selectEntryLocale({
      supported: ["en-001", "fr", "fr-CA"],
      defaultLocale: "en-001",
      explicit: "fr-ca",
      cookie: "fr",
      acceptLanguage: "en-US,en;q=0.9",
    });
    expect(result).toEqual({ kind: "selected", locale: "fr-CA", source: "explicit" });
  });

  it("uses a valid explicit cookie before Accept-Language and the default", () => {
    expect(
      selectEntryLocale({
        supported: ["en-001", "fr"],
        defaultLocale: "en-001",
        cookie: "fr",
        acceptLanguage: "en-US",
      }),
    ).toEqual({ kind: "selected", locale: "fr", source: "cookie" });
    expect(
      selectEntryLocale({
        supported: ["en-001", "fr"],
        defaultLocale: "en-001",
        cookie: "theme=dark; NEXT_LOCALE=fr; session=abc",
        acceptLanguage: "en-US",
      }),
    ).toEqual({ kind: "selected", locale: "fr", source: "cookie" });
    expect(
      selectEntryLocale({
        supported: ["en-001", "fr"],
        defaultLocale: "en-001",
        acceptLanguage: "de,fr;q=0.8,en;q=0.2",
      }),
    ).toEqual({ kind: "selected", locale: "fr", source: "accept-language" });
    expect(
      selectEntryLocale({ supported: ["en-001", "fr"], defaultLocale: "en-001", acceptLanguage: "de" }),
    ).toEqual({ kind: "selected", locale: "en-001", source: "default" });
  });

  it("fails closed for an unsupported explicit locale", () => {
    expect(
      selectEntryLocale({
        supported: ["en-001", "fr"],
        defaultLocale: "en-001",
        explicit: "de",
      }),
    ).toEqual({ kind: "rejected", reason: 'Unsupported explicit locale "de".' });
  });

  it("renders an existing representation and never invents one", () => {
    const page = {
      pageId: "home",
      fallbackLocaleKey: "en-001",
      representations: [{ locale: "en-001" }, { locale: "fr" }, { locale: "fr-CA" }],
    };
    expect(resolveRepresentation(page, "fr", { allowFallback: true })).toEqual({
      kind: "render",
      representation: { locale: "fr" },
    });
    expect(resolveRepresentation(page, "fr-CA", { allowFallback: true })).toEqual({
      kind: "render",
      representation: { locale: "fr-CA" },
    });
    expect(resolveRepresentation(page, "de", { allowFallback: true })).toEqual({
      kind: "redirect",
      representation: { locale: "en-001" },
    });
  });

  it("refuses a missing translation when no same-Page fallback is authorized", () => {
    const page = { pageId: "home", representations: [{ locale: "en-001" }] };
    expect(resolveRepresentation(page, "fr", { allowFallback: true }).kind).toBe("not-found");
    expect(resolveRepresentation(page, "fr", { allowFallback: false }).kind).toBe("not-found");
  });

  it("advertises hreflang only for representations that exist", () => {
    const links = advertisedHreflang({
      pageId: "home",
      representations: [{ locale: "en-001" }, { locale: "fr-ca" }],
    });
    expect(links).toEqual([
      { hreflang: "en-001", localeKey: "en-001" },
      { hreflang: "fr-CA", localeKey: "fr-ca" },
    ]);
  });
});
