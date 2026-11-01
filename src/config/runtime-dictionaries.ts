/**
 * ONE SPOKE'S RUNTIME DICTIONARY ACCESS (FOUNDATION-MULTISITE-S3F2A2-D1)
 * =====================================================================
 *
 *     SpokeRuntimeContext                     an EXPLICIT, immutable context — handed in, never resolved
 *     (its own resources + its own
 *      resolved configuration)
 *             └──────────────────┬──────────────────┘
 *         dictionaryAccessForRuntimeContext(context)
 *                                ↓
 *                       RuntimeDictionaryAccess      one immutable answer object, scoped to THAT context
 *
 * THE ONLY NEW FACT IS THE BINDING. The registry is composed by the accepted per-Spoke loader
 * (`./spoke-dictionaries`), which delegates to the ONE dictionary-registry loader — so dictionary
 * schema validation, declared-locale validation, the language-base fallback, the default locale, the
 * site+locale overrides and their refusal cases, and the missing-dictionary failures are all decided
 * there and restated nowhere.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It resolves no context, reads no configuration file, discovers no root and names no deployment
 * location: a caller must already hold the context it wants dictionaries for. It keeps no cache and
 * no selection state of any kind — there is no module-global registry and no Spoke→registry map, so
 * TWO contexts can be served in one process without influencing each other, and a context that is
 * discarded takes its dictionaries with it. The access object itself is the scope.
 *
 * The F1 booking-label invariant is applied HERE, at construction, by the ONE shared rule
 * (`./i18n/invariants`) over every EFFECTIVE (site, locale) dictionary of THIS context — so a
 * context whose enabled booking CTA would silently lose its label fails loudly when its access is
 * created, exactly as the compatibility binding fails at module load.
 *
 * ADDITIVE / UNWIRED FOR SELECTION (S3F2A2-D1, updated by `GEO-02-R03`). `@/config/i18n` remains the
 * running application's ACTIVE binding: nothing here chooses which Spoke a request reads, and
 * `src/app/sitemap.ts`, `src/app/robots.ts` and `src/proxy.ts` do not import this module. Its ONE
 * runtime consumer is the EFS Page path, which already holds a VERIFIED `SpokeRuntimeContext` for the
 * request and needs that Spoke's OWN dictionaries: `src/app/[[...segments]]/efs-status-labels.ts`
 * binds the computed-status labels through it. Choosing a Spoke remains S3F2B's work.
 *
 * SERVER/BUILD ONLY: its answers come from files, so it must never become reachable from a client chunk.
 */
import type { Locale } from "@/core/locale";
import { resolveSiteNotice } from "@/core/notice";

import type { Dictionary } from "./i18n/dictionary";
import {
  assertBookingLabelPresent,
  assertSiteNoticeCopyPresent,
  assertSpokeSwitcherLabelPresent,
} from "./i18n/invariants";
import type { SpokeRuntimeContext } from "./installation-runtime";
import { spokeSwitcherForRenderingSpoke } from "./spoke-routing";
import { loadSpokeDictionaryRegistry } from "./spoke-dictionaries";

/**
 * The dictionary answers of ONE runtime context, and the whole of its public surface.
 *
 * `get` keeps the accepted dictionary contract verbatim: the EFFECTIVE dictionary for a locale, with
 * the SITE's override applied when a site code is given, and the default-locale fallback for a
 * locale the context does not configure.
 */
export interface RuntimeDictionaryAccess {
  get(locale: Locale, siteCode?: string): Dictionary;
  /**
   * Whether `get` would answer from a dictionary that APPLIES to this locale (the site's override,
   * the exact dictionary, or its language base) rather than the unrelated default-locale fallback.
   *
   * Exposed for consumers that publish a fact IN the representation's own language: for those, the
   * default-locale substitution is a wrong answer rather than a graceful one. The predicate is the
   * registry's own (`DictionaryRegistry.applicable`) — no rule is restated here, and `get` keeps the
   * accepted fallback for every other consumer.
   */
  applicable(locale: Locale, siteCode?: string): boolean;
}

/**
 * Bind ONE explicit runtime context to its dictionaries.
 *
 * The registry is built ONCE, from that context's own resource roots and its own resolved
 * configuration, is validated exactly as any other registry is, and is then retained immutably
 * inside the returned access object: no later call rediscovers a root, re-reads a configuration or
 * consults any ambient state.
 */
export function dictionaryAccessForRuntimeContext(
  context: SpokeRuntimeContext,
): RuntimeDictionaryAccess {
  const registry = loadSpokeDictionaryRegistry(context.resources, context.siteConfig);

  // F1 — the SAME booking-label lock, over THIS context's own effective (site, locale) dictionaries,
  // under the SAME `<siteCode>/<localePath>` key convention the compatibility binding uses, so the two
  // bindings can never disagree about which keys an enabled booking CTA must cover.
  const effectiveDictionaries = new Map<string, Dictionary>();
  for (const site of context.siteConfig.sites) {
    for (const locale of site.locales) {
      effectiveDictionaries.set(
        `${site.code}/${locale.path}`,
        registry.get(locale.path, site.code),
      );
    }
  }
  assertBookingLabelPresent(
    effectiveDictionaries,
    context.siteConfig.bookingFeature,
    [...effectiveDictionaries.keys()],
  );

  // R1 — THE SITE-WIDE NOTICE COPY LOCK, over the SAME effective (site, locale) dictionaries. A Spoke that
  // PRESENTS the notice (`siteNotice.mode: "shown"`) must resolve its wording in every locale it serves, and
  // the diagnostic names the Spoke, the (Site, locale) key and the missing FIELD — so a blank notice is
  // impossible to publish and impossible to misdiagnose.
  assertSiteNoticeCopyPresent(
    effectiveDictionaries,
    resolveSiteNotice(context.siteConfig.siteNotice),
    `Spoke "${context.id}"`,
  );

  // R1 — THE CROSS-SPOKE SWITCHER LABEL LOCK. The control is chrome that appears on every page of the Spoke
  // that renders it, so the build's own routing description — the ONE authority that knows whether the
  // rendering Spoke receives a switcher at all — decides whether every served locale must be able to name
  // it. In an Installation authored with identified Spoke Hubs that is the OWNING Hub's own list; in a
  // flat/legacy one it is the Installation's, exactly as before (FOUNDATION-ID-M3-P3 §8). A Spoke that
  // receives no switcher checks nothing.
  assertSpokeSwitcherLabelPresent(
    effectiveDictionaries,
    spokeSwitcherForRenderingSpoke(context) !== null,
    `Spoke "${context.id}"`,
  );

  return Object.freeze({
    get: (locale: Locale, siteCode?: string): Dictionary => registry.get(locale, siteCode),
    applicable: (locale: Locale, siteCode?: string): boolean =>
      registry.applicable(locale, siteCode),
  });
}
