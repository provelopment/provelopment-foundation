import { describe, expect, it } from "vitest";

import {
  isPublicationQualifiedLocale,
  localeTagIssue,
  parseAcceptLanguage,
  publicationLocaleIssue,
  selectEntryLocale,
} from "@/core/efs/locales";

/**
 * `GEO-01` R02 §3.7 negotiation table, corrected by `GEO-01` R03 §3 and implemented under
 * `GEO-03` R03.
 *
 * Fixtures are synthetic and fully qualified: this increment must not require the still unmigrated
 * reference Installation to change in order to prove the contract.
 */
const select = (input: {
  supported: readonly string[];
  defaultLocale: string;
  explicit?: string;
  cookie?: string;
  acceptLanguage?: string | null;
}) => selectEntryLocale(input);

describe("EFS language negotiation (GEO-01 NG-1 … NG-16)", () => {
  it("NG-1 selects the sole qualified representation that a general preference extends", () => {
    expect(select({ supported: ["en-001"], defaultLocale: "en-001", acceptLanguage: "en" })).toEqual({
      kind: "selected",
      locale: "en-001",
      source: "accept-language",
    });
  });

  it("NG-2 never synthesizes en-GB: the preference is unresolved and the default answers", () => {
    // `en-GB` is not a prefix OF `en-001`, and `en-001` is not an extension of it.
    expect(
      select({ supported: ["en-001"], defaultLocale: "en-001", acceptLanguage: "en-GB" }),
    ).toEqual({ kind: "selected", locale: "en-001", source: "default" });
  });

  it("NG-3 lets the authored default disambiguate two qualifying candidates", () => {
    expect(
      select({ supported: ["en-001", "en-GB"], defaultLocale: "en-001", acceptLanguage: "en" }),
    ).toEqual({ kind: "selected", locale: "en-001", source: "accept-language" });
  });

  it("NG-4 never resolves ambiguity by an arbitrary pick", () => {
    // `de-DE` is authored and is the declared default; NG-16 below forbids a default outside `L`,
    // so the design table's NG-4 cannot carry a non-member `D` without contradicting it.
    const result = select({
      supported: ["en-001", "en-GB", "de-DE"],
      defaultLocale: "de-DE",
      acceptLanguage: "en",
    });
    expect(result).toEqual({ kind: "selected", locale: "de-DE", source: "default" });
    const locale = result.kind === "selected" ? result.locale : "";
    expect(["en-001", "en-GB"]).not.toContain(locale);
  });

  it("NG-5 negotiates a script-qualified representation", () => {
    expect(
      select({ supported: ["zh-Hans", "zh-Hant"], defaultLocale: "zh-Hant", acceptLanguage: "zh" }),
    ).toEqual({ kind: "selected", locale: "zh-Hant", source: "accept-language" });
  });

  it("NG-6′ selects the authored default between two region-qualified candidates", () => {
    expect(
      select({ supported: ["de-DE", "de-AT"], defaultLocale: "de-AT", acceptLanguage: "de" }),
    ).toEqual({ kind: "selected", locale: "de-AT", source: "accept-language" });
  });

  it("NG-6″ negotiates a representation that carries BOTH a region and a variant", () => {
    // `de-DE-1996` is qualified and published, and takes part in ordinary language negotiation:
    // the variant is preserved rather than dropped to reach a shorter candidate.
    expect(publicationLocaleIssue("de-DE-1996")).toBeNull();
    expect(
      select({
        supported: ["de-DE", "de-DE-1996"],
        defaultLocale: "de-DE-1996",
        acceptLanguage: "de",
      }),
    ).toEqual({ kind: "selected", locale: "de-DE-1996", source: "accept-language" });
  });

  it("NG-7 invents no preference from a wildcard or an empty header", () => {
    for (const acceptLanguage of [null, undefined, "", "*", " , "]) {
      expect(
        select({ supported: ["en-001", "de-DE"], defaultLocale: "en-001", acceptLanguage }),
      ).toEqual({ kind: "selected", locale: "en-001", source: "default" });
    }
  });

  it("NG-8 treats a well-formed unpublished preference as harmless", () => {
    expect(
      select({ supported: ["en-001"], defaultLocale: "en-001", acceptLanguage: "xx-YY" }),
    ).toEqual({ kind: "selected", locale: "en-001", source: "default" });
  });

  it("NG-9 filters an extension tag out of the preference list instead of failing the request", () => {
    expect(parseAcceptLanguage("en-US-u-ca-gregory")).toEqual([]);
    expect(
      select({
        supported: ["en-001"],
        defaultLocale: "en-001",
        acceptLanguage: "en-US-u-ca-gregory",
      }),
    ).toEqual({ kind: "selected", locale: "en-001", source: "default" });
  });

  it("NG-10 gives a valid cookie preference precedence over Accept-Language", () => {
    expect(
      select({
        supported: ["en-001", "fr-CA"],
        defaultLocale: "en-001",
        cookie: "NEXT_LOCALE=fr-CA",
        acceptLanguage: "en-001",
      }),
    ).toEqual({ kind: "selected", locale: "fr-CA", source: "cookie" });
  });

  it("NG-11 lets an unsupported cookie fall through instead of erroring", () => {
    expect(
      select({
        supported: ["en-001"],
        defaultLocale: "en-001",
        cookie: "NEXT_LOCALE=it-IT",
        acceptLanguage: "en-001",
      }),
    ).toEqual({ kind: "selected", locale: "en-001", source: "accept-language" });
  });

  it("NG-12 refuses to upgrade an explicit path segment with the general-preference rule", () => {
    expect(select({ supported: ["en-001"], defaultLocale: "en-001", explicit: "en" })).toEqual({
      kind: "rejected",
      reason: 'Unsupported explicit locale "en".',
    });
  });

  it("NG-13 matches an explicit segment case-insensitively", () => {
    expect(select({ supported: ["en-001"], defaultLocale: "en-001", explicit: "EN-001" })).toEqual({
      kind: "selected",
      locale: "en-001",
      source: "explicit",
    });
  });

  it("NG-14 is pure: identical inputs produce identical selections", () => {
    const input = {
      supported: ["en-001", "de-DE", "zh-Hans"],
      defaultLocale: "en-001",
      cookie: "NEXT_LOCALE=de",
      acceptLanguage: "zh,de;q=0.8",
    };
    expect(select(input)).toEqual(select(input));
    expect(select(input)).toEqual(select({ ...input }));
  });

  it("NG-15 keeps every result inside the authored supported set", () => {
    const supported = ["en-001", "de-DE", "fr-CA"];
    for (const acceptLanguage of ["en", "de-AT", "fr", "fr-FR", "zz", "de-DE-1996"]) {
      const result = select({ supported, defaultLocale: "en-001", acceptLanguage });
      expect(result.kind).toBe("selected");
      if (result.kind === "selected") expect(supported).toContain(result.locale);
    }
  });

  it("NG-16 refuses a declared default that is not in the supported set", () => {
    expect(() =>
      select({ supported: ["en-001"], defaultLocale: "de-DE", acceptLanguage: "en" }),
    ).toThrow(/not supported/);
  });
});

describe("EFS preference parsing and subtag safety", () => {
  it("ranks by q and keeps original order on ties", () => {
    expect(parseAcceptLanguage("de;q=0.4, fr;q=0.9, en;q=0.4")).toEqual(["fr", "de", "en"]);
  });

  it("ignores zero-quality and malformed entries", () => {
    expect(parseAcceptLanguage("de;q=0, not_a_locale, fr;q=0.5")).toEqual(["fr"]);
  });

  it("compares complete subtags, never character strings", () => {
    // A character-prefix implementation would select `den-DE` for `de` and record the source as
    // `accept-language`; subtag comparison refuses, so the default answers.
    expect(
      select({ supported: ["den-DE", "en-001"], defaultLocale: "en-001", acceptLanguage: "de" }),
    ).toEqual({ kind: "selected", locale: "en-001", source: "default" });
    // The bare-language `den` fixture is withdrawn: `den` is not publication-qualified, so it can
    // never be a published representation and must not appear in a `supported` set.
  });

  it("accepts a bare-variant tag as a browser preference and refuses it as a publication", () => {
    // L-3: a preference is never published and never becomes a representation, so `de-1996` is a
    // legitimate thing for a browser to send even though it can never be authored as a Page.
    expect(localeTagIssue("de-1996")).toBeNull();
    expect(parseAcceptLanguage("de-1996, en;q=0.8")).toEqual(["de-1996", "en"]);
    expect(publicationLocaleIssue("de-1996")?.kind).toBe("unqualified");
    // With only qualified representations published, that preference resolves nothing and is never
    // upgraded into `de-DE` by invention.
    expect(
      select({ supported: ["de-DE"], defaultLocale: "de-DE", acceptLanguage: "de-1996" }),
    ).toEqual({ kind: "selected", locale: "de-DE", source: "default" });
  });

  it("preserves variants through syntax and negotiation", () => {
    expect(localeTagIssue("sl-rozaj-biske")).toBeNull();
    expect(localeTagIssue("de-DE-1996")).toBeNull();
    expect(
      select({
        supported: ["de-DE", "de-DE-1996"],
        defaultLocale: "de-DE-1996",
        acceptLanguage: "de-DE",
      }),
    ).toEqual({ kind: "selected", locale: "de-DE", source: "accept-language" });
  });

  it("never fails a request on a malformed cookie preference", () => {
    expect(
      select({
        supported: ["en-001"],
        defaultLocale: "en-001",
        cookie: "NEXT_LOCALE=not_a_locale",
        acceptLanguage: "en",
      }),
    ).toEqual({ kind: "selected", locale: "en-001", source: "accept-language" });
    expect(
      select({
        supported: ["en-001"],
        defaultLocale: "en-001",
        cookie: "NEXT_LOCALE=%E0%A4%A",
        acceptLanguage: "en",
      }),
    ).toEqual({ kind: "selected", locale: "en-001", source: "accept-language" });
  });
});


describe("EFS publication qualification (GEO-03 R03 §4)", () => {
  it("accepts tags that carry an authored region or script", () => {
    for (const tag of ["en-001", "de-DE", "zh-Hans", "de-DE-1996", "pt-BR", "sr-Cyrl-RS"]) {
      expect(publicationLocaleIssue(tag)).toBeNull();
      expect(isPublicationQualifiedLocale(tag)).toBe(true);
    }
  });

  it("reports a syntactically valid but unqualified tag as unqualified, not malformed", () => {
    for (const tag of ["de", "de-1996", "sl-rozaj-biske", "zh"]) {
      expect(localeTagIssue(tag)).toBeNull();
      expect(publicationLocaleIssue(tag)?.kind).toBe("unqualified");
      expect(isPublicationQualifiedLocale(tag)).toBe(false);
    }
  });

  it("distinguishes a malformed tag from an unqualified one", () => {
    for (const tag of ["not_a_locale", "", " en", "e", "english-USA"]) {
      expect(publicationLocaleIssue(tag)?.kind).toBe("malformed");
    }
    expect(publicationLocaleIssue("de")?.kind).toBe("unqualified");
    expect(publicationLocaleIssue("not_a_locale")?.kind).not.toBe("unqualified");
  });

  it("never repairs a tag into qualification", () => {
    const issue = publicationLocaleIssue("de");
    expect(issue?.kind).toBe("unqualified");
    expect(issue && "reason" in issue ? issue.reason : "").toContain("no script or region");
    // Nothing is completed on the caller's behalf and no region is inferred from the language.
    expect(isPublicationQualifiedLocale("de")).toBe(false);
    expect(isPublicationQualifiedLocale("deu-DE")).toBe(true);
  });
});
