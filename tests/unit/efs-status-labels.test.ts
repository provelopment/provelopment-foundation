import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { efsScheduleStatusLabels } from "@/app/[[...segments]]/efs-status-labels";
import type { EfsView } from "@/app/[[...segments]]/efs-request";
import type { SpokeRuntimeContext } from "@/config/installation-runtime";
import { getDictionary } from "@/config/i18n";
import { dictionarySchema, type Dictionary } from "@/config/i18n/dictionary";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";
import type { SiteConfig } from "@/config/site-config";

/**
 * `GEO-02-R03` — THE COMPUTED-STATUS DICTIONARY BINDING
 * ======================================================
 *
 * Proves the three corrected rules through the REAL consumer and the REAL registry — no mocked
 * resolution order:
 *
 *   A  the lookup uses the locale PATH KEY (`de-de`), not the canonical tag (`de-DE`);
 *   B  an applicable dictionary is required — exact, or the language base, never the unrelated
 *      default-locale substitution;
 *   C  an invalid Installation configuration stays a validation error instead of being swallowed.
 *
 * The fixtures are authored neutrally and qualified: `en-001`, `de-DE`, `fr-FR`. The reference
 * Installation is only READ as a structural template for a valid dictionary, and its own language
 * declarations are never touched.
 */

/** The reference dictionary, used only as a guaranteed-valid STRUCTURE (validated below). */
const base = getDictionary("en");

/** The five labels the status consumer needs, per authored language. */
const LABELS = {
  en: { open: "Open", closed: "Closed", hoursLabel: "Business hours" },
  de: { open: "Geoeffnet", closed: "Geschlossen", hoursLabel: "Oeffnungszeiten" },
  fr: { open: "Ouvert", closed: "Ferme", hoursLabel: "Horaires" },
  "de-AT": { open: "Offen (AT)", closed: "Zu (AT)", hoursLabel: "Zeiten (AT)" },
} as const;

/** A valid dictionary whose `business` labels belong to ONE authored language. */
function dictionaryFor(language: keyof typeof LABELS): Dictionary {
  const dictionary = {
    ...base,
    business: { ...base.business, ...LABELS[language] },
  } as Dictionary;
  // The template must remain a VALID dictionary: if the released schema ever grows, this fails here
  // rather than producing an install that the registry would reject for an unrelated reason.
  const parsed = dictionarySchema.safeParse(dictionary);
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  return dictionary;
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * A real, disposable dictionary tree plus the configuration that describes it.
 *
 * `files` are the authored dictionaries BY PATH KEY. `declared` is what the Spoke's configuration
 * enables — a declared locale without a file is a loud Installation failure, exactly as the
 * released registry specifies, and `defaultLocale` is whichever language the Spoke falls back to.
 */
function installation(options: {
  files: Record<string, Dictionary>;
  declared?: readonly string[];
  defaultLocale?: string;
  /** The locale PATH KEYS the presentation Site serves — wider than `declared` when it only holds
   *  site+locale overrides, which the registry validates against exactly this list. */
  siteLocales?: readonly string[];
}) {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-status-labels-"));
  temporaryDirectories.push(root);
  const dictionaryRoot = path.join(root, "config", "i18n");
  mkdirSync(dictionaryRoot, { recursive: true });
  for (const [localeKey, dictionary] of Object.entries(options.files)) {
    writeFileSync(
      path.join(dictionaryRoot, `${localeKey}.json`),
      `${JSON.stringify(dictionary, null, 2)}\n`,
      "utf8",
    );
  }
  const declared = options.declared ?? Object.keys(options.files);
  const defaultLocale = options.defaultLocale ?? declared[0];
  const servedLocales = options.siteLocales ?? declared;
  const siteConfig = {
    url: "https://portal.example",
    name: "Configured Brand",
    defaultLocale,
    locales: declared.map((code) => ({ code, label: code })),
    sites: [
      {
        code: "main",
        label: "Main",
        locales: servedLocales.map((code) => ({ path: code, canonical: code })),
        defaultLocale,
        fallback: true,
        isDefault: true,
        locationSelection: null,
      },
    ],
    hubs: [],
    sitePageOverrides: {},
    contact: {},
    socialLinks: [],
    navigation: [],
    business: { contact: {}, locations: [] },
    regions: {},
    pageBindings: [],
  } as unknown as SiteConfig;
  const context = {
    id: "labels-spoke",
    runtimeSegment: "labels-spoke",
    canonicalHostname: "portal.example",
    hostnameClaims: ["portal.example"],
    siteConfig,
    resources: {
      spokeRoot: root,
      dictionaryRoot,
      dictionaryOverrideRoot: path.join(dictionaryRoot, "sites"),
      markdownPagesRoot: path.join(root, "content"),
      jsonPagesRoot: path.join(root, "content"),
      assetSourceRoot: path.join(root, "content"),
    },
    runtimeAssetNamespaces: [],
  } as unknown as SpokeRuntimeContext;
  return context;
}

/** The minimum view the consumer reads: the published language, the profile, and the context. */
function viewFor(
  context: SpokeRuntimeContext,
  options: {
    locale: string;
    localeKey: string;
    presentationSiteCode?: string;
  },
): EfsView {
  return {
    context,
    locale: options.locale,
    localeKey: options.localeKey,
    publication: {
      id: "labels-publication",
      spokeId: "labels-spoke",
      ...(options.presentationSiteCode === undefined
        ? {}
        : { presentationSiteCode: options.presentationSiteCode }),
      entityId: "e_00000000000000000000000009",
      facetId: "acme",
      bindings: [],
    },
  } as unknown as EfsView;
}

describe("R03-A/1 — an authored exact dictionary for the published language", () => {
  it("uses the authored `en-001` dictionary for an `en-001` representation", () => {
    const context = installation({
      files: { "en-001": dictionaryFor("en"), en: dictionaryFor("de") },
      declared: ["en-001", "en"],
      defaultLocale: "en",
    });
    const labels = efsScheduleStatusLabels(
      viewFor(context, { locale: "en-001", localeKey: "en-001", presentationSiteCode: "main" }),
    );
    // The EXACT dictionary wins over both the language base and the default locale.
    expect(labels).toEqual({ hoursLabel: "Business hours", open: "Open", closed: "Closed" });
  });

  it("honours a site override for the exact (site, locale) pair", () => {
    const context = installation({
      // A SHARED dictionary must exist for an override to refine it (the registry's own rule), so the
      // Austrian labels differ from the shared German ones the override replaces.
      files: { en: dictionaryFor("en"), "de-at": dictionaryFor("de") },
      declared: ["en", "de-at"],
      defaultLocale: "en",
      siteLocales: ["en", "de-at"],
    });
    const overrideRoot = path.join(
      (context.resources as unknown as { dictionaryOverrideRoot: string }).dictionaryOverrideRoot,
      "main",
    );
    mkdirSync(overrideRoot, { recursive: true });
    writeFileSync(
      path.join(overrideRoot, "de-at.json"),
      `${JSON.stringify(dictionaryFor("de-AT"), null, 2)}\n`,
      "utf8",
    );
    const labels = efsScheduleStatusLabels(
      viewFor(context, { locale: "de-AT", localeKey: "de-at", presentationSiteCode: "main" }),
    );
    expect(labels?.hoursLabel).toBe("Zeiten (AT)");
  });
});

describe("R03-B/2 — the language-base dictionary, which is legitimate", () => {
  it("uses `en` for `en-001` when no exact dictionary is authored", () => {
    const context = installation({
      files: { en: dictionaryFor("en") },
      declared: ["en"],
      defaultLocale: "en",
    });
    const labels = efsScheduleStatusLabels(
      viewFor(context, { locale: "en-001", localeKey: "en-001", presentationSiteCode: "main" }),
    );
    expect(labels).toEqual({ hoursLabel: "Business hours", open: "Open", closed: "Closed" });
  });
});

describe("R03-A/3 — canonical case must not force a fallback", () => {
  it("resolves an authored `de-de` dictionary for a `de-DE` representation with no `de` file", () => {
    const context = installation({
      files: { "de-de": dictionaryFor("de"), en: dictionaryFor("en") },
      declared: ["de-de", "en"],
      defaultLocale: "en",
    });
    // `locale` is the canonical tag `de-DE`; the PATH KEY is `de-de`. Only the path key can match the
    // dictionary file and the registry's lowercase keys — and the default locale here is ENGLISH, so
    // any fallback would be immediately visible as English labels.
    const labels = efsScheduleStatusLabels(
      viewFor(context, { locale: "de-DE", localeKey: "de-de", presentationSiteCode: "main" }),
    );
    expect(labels).toEqual({ hoursLabel: "Oeffnungszeiten", open: "Geoeffnet", closed: "Geschlossen" });
  });
});

describe("R03-B/4 — an unrelated default language is refused, not substituted", () => {
  it("emits NO labels for `fr-FR` when only English dictionaries exist", () => {
    const context = installation({
      files: { en: dictionaryFor("en") },
      declared: ["en"],
      defaultLocale: "en",
    });
    const view = viewFor(context, {
      locale: "fr-FR",
      localeKey: "fr-fr",
      presentationSiteCode: "main",
    });
    // The registry's `get` WOULD answer — in English. That substitution is exactly what the consumer
    // must refuse, so the two answers are asserted side by side.
    const wouldBeEnglish = dictionaryAccessForRuntimeContext(context).get("fr-fr", "main");
    expect(wouldBeEnglish.business.hoursLabel).toBe("Business hours");

    expect(efsScheduleStatusLabels(view)).toBeUndefined();
  });
});


describe("R03-C/5 — an Installation failure stays a validation error", () => {
  it("propagates a declared locale that has no dictionary file", () => {
    const context = installation({
      files: { en: dictionaryFor("en") },
      // `de-de` is ENABLED but has no dictionary: the released registry refuses the whole registry.
      declared: ["en", "de-de"],
      defaultLocale: "en",
    });
    // Not `undefined`: a missing dictionary for an enabled locale is an Installation defect, and a
    // blanket `catch` would have turned it into a silent "no status".
    expect(() =>
      efsScheduleStatusLabels(
        viewFor(context, { locale: "de-DE", localeKey: "de-de", presentationSiteCode: "main" }),
      ),
    ).toThrow(/dictionary/i);
  });

  it("propagates a malformed dictionary file", () => {
    const context = installation({
      files: { en: dictionaryFor("en") },
      declared: ["en"],
      defaultLocale: "en",
    });
    // A structurally invalid dictionary, written where the registry will find it.
    writeFileSync(
      path.join(
        (context.resources as unknown as { dictionaryRoot: string }).dictionaryRoot,
        "en.json",
      ),
      `${JSON.stringify({ navigation: "not-an-object" }, null, 2)}\n`,
      "utf8",
    );
    expect(() =>
      efsScheduleStatusLabels(
        viewFor(context, { locale: "en-001", localeKey: "en-001", presentationSiteCode: "main" }),
      ),
    ).toThrow();
  });
});

describe("R03-B/6 — the authored language is independent of Site, prefix, place and timezone", () => {
  it("labels the same representation identically whatever the Site, prefix, address or zone say", () => {
    const context = installation({
      files: { "de-de": dictionaryFor("de"), en: dictionaryFor("en") },
      declared: ["de-de", "en"],
      defaultLocale: "en",
    });
    const base = viewFor(context, {
      locale: "de-DE",
      localeKey: "de-de",
      presentationSiteCode: "main",
    });
    const decorated = {
      ...base,
      // Everything a geographic or Site-derived guess could have used, deliberately contradictory.
      site: { id: "berlin", pages: [] },
      facet: { id: "germany" },
      binding: { host: "north.example", prefix: ["de"], locales: ["de-DE", "en-001"] },
      canonical: "https://north.example/de/de-DE/about",
      properties: {
        get: (key: string) =>
          ({
            timezone: { value: "Asia/Tokyo", public: true, state: "declared" },
            "contact.address": { value: "1 Example Street", public: true, state: "declared" },
            "site.label": { value: "Berlin", public: true, state: "declared" },
          })[key],
      },
    } as unknown as EfsView;

    const undecorated = efsScheduleStatusLabels(base);
    const withExtras = efsScheduleStatusLabels(decorated);
    expect(withExtras).toEqual(undecorated);
    expect(withExtras).toEqual({
      hoursLabel: "Oeffnungszeiten",
      open: "Geoeffnet",
      closed: "Geschlossen",
    });
  });

  it("needs no presentation Site at all — the EFS-only boundary still labels by language", () => {
    const context = installation({
      files: { "de-de": dictionaryFor("de") },
      declared: ["de-de"],
      defaultLocale: "de-de",
    });
    const labels = efsScheduleStatusLabels(
      viewFor(context, { locale: "de-DE", localeKey: "de-de" }),
    );
    expect(labels?.hoursLabel).toBe("Oeffnungszeiten");
  });
});

