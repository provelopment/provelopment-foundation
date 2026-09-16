import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadDictionaryRegistry } from "@/config/i18n/registry";

const tempDirectories: string[] = [];

function makeDictionary(overrides: Record<string, unknown> = {}) {
  return {
    home: { tagline: "t", description: "d" },
    sections: { about: "a", contact: "c", connect: "c", navigate: "n" },
    navigation: {
      primaryLabel: "p",
      footerLabel: "f",
      moreMenu: "m",
      showSidebar: "s",
      hideSidebar: "s",
      items: { "/": "Home" },
    },
    notFound: { title: "n", message: "m", returnHome: "r" },
    error: { title: "e", message: "e", tryAgain: "e", returnHome: "e" },
    language: { label: "l" },
    location: { label: "lo", unspecified: "u" },
    connect: { heading: "c", demoNotice: "c", demoBadge: "c", methods: { message: "m" } },
    business: { open: "o", closed: "c", noHours: "h", hoursLabel: "hh", hoursTimeZoneLabel: "tz" },
    a11y: { skipToContent: "s" },
    contact: {
      heading: "c",
      nameLabel: "c",
      emailLabel: "c",
      subjectLabel: "c",
      messageLabel: "c",
      submit: "c",
      sending: "c",
      honeypotLabel: "c",
      success: "c",
      demoNotice: "c",
      unconfigured: "c",
      configError: "c",
      sendError: "c",
      errors: { name: "c", email: "c", subject: "c", message: "c" },
    },
    offerings: {
      heading: "c",
      emptyState: "c",
      backToOfferings: "c",
      featured: "c",
      deliverables: "c",
      faq: "c",
      externalCta: "c",
      disclaimerTitle: "c",
      disclaimerBody: "c",
      currencyNotice: "c",
    },
    legal: {
      heading: "c",
      disclaimer: "c",
      labels: { privacy: "Privacy Policy" },
    },
    ...overrides,
  };
}

function makeTempDirectory(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "provelopment-i18n-"));
  tempDirectories.push(dir);
  return dir;
}

function writeDictionary(dir: string, locale: string, dict: unknown = makeDictionary()): void {
  writeFileSync(path.join(dir, `${locale}.json`), JSON.stringify(dict, null, 2), "utf8");
}

afterEach(() => {
  for (const dir of tempDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadDictionaryRegistry (data-driven locale discovery)", () => {
  it("discovers dictionaries from the directory instead of a hard-coded list", () => {
    const dir = makeTempDirectory();
    writeDictionary(dir, "en", makeDictionary({ language: { label: "EN" } }));
    writeDictionary(dir, "fr", makeDictionary({ language: { label: "FR" } }));

    const registry = loadDictionaryRegistry({
      directory: dir,
      declaredLocales: ["en", "fr"],
      defaultLocale: "en",
    });

    expect(registry.get("fr").language.label).toBe("FR");
    expect(registry.get("en").language.label).toBe("EN");
  });

  it("picks up a newly added locale file without any code change", () => {
    const dir = makeTempDirectory();
    writeDictionary(dir, "en", makeDictionary({ language: { label: "EN" } }));

    // Not configured/registered yet: get() falls back to the default.
    const before = loadDictionaryRegistry({
      directory: dir,
      declaredLocales: ["en"],
      defaultLocale: "en",
    });
    expect(before.get("es").language.label).toBe("EN");

    // Adding the data file alone makes the locale resolvable: proof that the
    // available set comes from the data surface, not a registration list.
    writeDictionary(dir, "es", makeDictionary({ language: { label: "ES" } }));
    const after = loadDictionaryRegistry({
      directory: dir,
      declaredLocales: ["en", "es"],
      defaultLocale: "en",
    });
    expect(after.get("es").language.label).toBe("ES");
  });

  it("fails clearly when a configured locale has no dictionary file", () => {
    const dir = makeTempDirectory();
    writeDictionary(dir, "en");

    expect(() =>
      loadDictionaryRegistry({
        directory: dir,
        declaredLocales: ["en", "ja"],
        defaultLocale: "en",
      }),
    ).toThrow(/ja/);
  });

  it("fails clearly on malformed dictionary JSON", () => {
    const dir = makeTempDirectory();
    writeFileSync(path.join(dir, "bad.json"), "{ not json", "utf8");

    expect(() =>
      loadDictionaryRegistry({
        directory: dir,
        declaredLocales: ["en"],
        defaultLocale: "en",
      }),
    ).toThrow(/not valid JSON/);
  });

  it("fails clearly on a dictionary that violates the Zod schema", () => {
    const dir = makeTempDirectory();
    writeDictionary(dir, "en", { oops: true });

    expect(() =>
      loadDictionaryRegistry({
        directory: dir,
        declaredLocales: ["en"],
        defaultLocale: "en",
      }),
    ).toThrow(/dictionary schema/);
  });

  it("preserves default-locale fallback for locales that are not configured", () => {
    const dir = makeTempDirectory();
    writeDictionary(dir, "en");

    const registry = loadDictionaryRegistry({
      directory: dir,
      declaredLocales: ["en"],
      defaultLocale: "en",
    });

    expect(registry.get("sv").a11y.skipToContent).toBe("s");
  });
});