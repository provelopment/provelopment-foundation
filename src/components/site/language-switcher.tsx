"use client";

import { usePathname, useRouter } from "next/navigation";

import { displayNameWithEnglish } from "@/core/display-labels";
import { bindingsForSite, localesAvailableInLocation, regionalPath, resolveLocaleDestination } from "@/core/regional-pages";
import { pathContextOr, siteLocalePath, sitePath, sitePrefixPath, siteSupportsLocalePath } from "@/core/site";
import { useClientRouting } from "./client-routing-context";

interface LanguageSwitcherProps {
  /**
   * The current document's locale PATH KEY (`en`, `fr-ca`) — the value the URL names and the
   * key the dictionary is looked up by.
   */
  readonly locale: string;
  /** Accessible label, localized via the active locale's dictionary. */
  readonly label: string;
}

const LOCALE_COOKIE = "NEXT_LOCALE";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Records the negotiated locale in a cookie (module-scope helper). */
function writeLocaleCookie(nextLocale: string): void {
  document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

/**
 * Language dropdown shown in the header.
 *
 * S1 — A LANGUAGE SWITCH STAYS INSIDE THE CURRENT SITE. The site is read from the URL
 * (authoritative, exactly like the region), so:
 *
 *  - the options are THAT site's locales, never every locale of the deployment: a visitor of
 *    the Canada site is offered English (Canada) and French (Canada), not France French;
 *  - the destination keeps the site, replaces the locale and preserves the page — the URL is
 *    built from the site's own locale path, so a language switch can never leave its site;
 *  - a locale the site does not serve is not offered (never a dead link, never a silent site
 *    change);
 *  - in a REGIONAL context the same region is preserved when the target locale is bound to
 *    it, and the deterministic regional fallback is used otherwise (landing → first
 *    configured page) — still inside the same site.
 *
 * LOC3 — AND IN A LOCATION, ONLY THE LANGUAGES THAT LOCATION SERVES. The option set is filtered by the ONE
 * accepted regional rule (`localesAvailableInLocation` → `resolveLocaleDestination`), so:
 *
 *  - the GLOBAL state (`context.region === null`) still offers the site's entire language set — the whole
 *    point of a Worldwide or otherwise Location-less context;
 *  - a SELECTED LOCATION offers only its own usable languages (a one-language Location offers one option),
 *    and the language currently being read is never dropped from its own selector;
 *  - an option that could not reach a destination — or that would silently move the visitor to another
 *    Location — is never rendered, so no language is ever presented as functional without a destination.
 *
 * The site's own fallback policy decides what answers when the target locale has no copy of
 * the page: that is a locale fallback WITHIN the site, which the page-source contract
 * permits. A cross-site lookup is never performed to satisfy a language request.
 */
export function LanguageSwitcher({ locale, label }: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  // M14 — the routing facts arrive from the SERVER's projection for the CURRENT Spoke: this site, this
  // site's locales, this site's bindings. No configuration is read here and no Spoke can be selected.
  const routing = useClientRouting();

  const context = pathContextOr(
    routing.siteSet,
    routing.pageBindings,
    pathname ?? "/",
    locale,
  );
  const site = context.site;
  const sitePrefix = sitePrefixPath(site);
  const entries = bindingsForSite(routing.pageBindings, site.code);
  const current = context.localePath;
  // LOC3 — THE LANGUAGES THIS CONTEXT CAN ACTUALLY REACH. In the GLOBAL state nothing is filtered (the
  // site's whole language set, exactly as before). In a LOCATION the accepted regional rule decides:
  // `localesAvailableInLocation` keeps a language only when this Location is bound to it and the existing
  // destination resolver can place the visitor there — so an option that would do nothing, or that would
  // silently change the Location, is never rendered. The language being read is always kept.
  const region = context.region;
  const routeSlug = context.routePath === "" ? null : context.routePath;
  const offeredPaths =
    region === null
      ? null
      : new Set(
          localesAvailableInLocation({
            entries,
            siteLocalePaths: site.locales.map((locale) => locale.path),
            region,
            currentSlug: routeSlug,
            currentLocalePath: current,
          }),
        );

  function handleChange(nextLocale: string) {
    // A language switch stays INSIDE this site: a locale the site does not serve is never
    // offered, and a stale DOM value cannot reach it either.
    if (nextLocale === current || !siteSupportsLocalePath(site, nextLocale)) {
      return;
    }

    writeLocaleCookie(nextLocale);

    if (context.region) {
      const destination = resolveLocaleDestination(
        entries,
        nextLocale,
        context.region,
        context.routePath === "" ? null : context.routePath,
      );
      if (destination) {
        router.push(
          regionalPath(nextLocale, destination.region, destination.slug, sitePrefix),
        );
      }
      return;
    }

    // Same route path, same site, new locale — any fallback happens INSIDE this site.
    router.push(sitePath(site, nextLocale, context.routePath) ?? siteLocalePath(site, nextLocale));
  }

  const defaultLocale = site.defaultLocale;
  /**
   * The CONTEXT's display label for a locale PATH KEY (`en`, `fr-ca`): projected by the server through the
   * ONE display-name rule (S1/M14), with the path key itself as the last resort — the same fallback this
   * selector always had for a key the registry does not name.
   */
  const registryLabel = (localePath: string): string =>
    routing.localeLabels[localePath] ?? localePath;
  const sortedLocales = [...site.locales]
    .filter(({ path: localePath }) => offeredPaths === null || offeredPaths.has(localePath))
    .sort((a, b) => {
      if (a.path === defaultLocale) return -1;
      if (b.path === defaultLocale) return 1;
      return registryLabel(a.path).localeCompare(registryLabel(b.path), "en", { sensitivity: "base" });
    });

  return (
    <select
      aria-label={label}
      data-selector="language"
      value={current}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
    >
      {sortedLocales.map(({ path: localePath, label: siteLabel }) => (
        <option key={localePath} value={localePath}>
          {siteLabel === undefined ? registryLabel(localePath) : displayNameWithEnglish(siteLabel)}
        </option>
      ))}
    </select>
  );
}

/**
 * GEO-04 R10 — ONE OFFERED LANGUAGE OF AN EFS PUBLICATION.
 *
 * Every field is a PUBLIC FACT the EFS compositor already proved: `value` is the representation's standards
 * tag (`hreflang`, e.g. `de-DE`) and `href` is that representation's OWN canonical address, taken verbatim
 * from `view.alternates`. Nothing here can re-resolve a destination.
 */
export interface EfsLanguageOption {
  /** The standards tag (`hreflang`) — the `<option>` value and the "is this the current language" test. */
  readonly value: string;
  /** Visitor-facing label, resolved once by the compositor. */
  readonly label: string;
  /** The published alternate's canonical address, rendered VERBATIM. */
  readonly href: string;
}

/**
 * GEO-04 R10 — THE EFS LANGUAGE CONTROL.
 *
 * WHY IT IS A SEPARATE COMPONENT. The legacy control above derives its whole answer CLIENT-side: it reads
 * `usePathname()`, `pathContextOr`, `bindingsForSite`, `siteSupportsLocalePath` and `resolveLocaleDestination`
 * to rebuild a destination from the current URL. The EFS shell deliberately composes NO
 * `ClientRoutingProvider`, so `useClientRouting()` would throw there — and the hooks cannot be made
 * conditional. Splitting the component is the only hook-safe shape: `useRouter` is the single hook this one
 * uses, and it needs no provider.
 *
 * WHAT IT DELIBERATELY DOES NOT DO — and why each omission is a capability PRESERVED, not dropped:
 *
 *   - it does not filter or complete the option set. `view.alternates` is already EXACTLY the published
 *     representations of THIS Page, so a locale merely declared in the binding can never appear here. That is
 *     strictly stronger than the legacy `site.locales` filter, which had to prove availability itself;
 *   - it does not write the `NEXT_LOCALE` cookie. Under EFS the URL is the SOLE locale authority, and a cookie
 *     would introduce a second one that could disagree with the address the visitor is actually on.
 *
 * The presentation is byte-identical to the legacy control (`<select data-selector="language">`, the same
 * classes), so the header's contextual row is unchanged for a visitor.
 */
export function EfsLanguageSwitcher({
  current,
  label,
  options,
}: {
  /** The CURRENT representation's standards tag (`hreflang`). */
  readonly current: string;
  /** Accessible label, localized by the compositor from THIS Spoke's dictionary. */
  readonly label: string;
  readonly options: readonly EfsLanguageOption[];
}) {
  const router = useRouter();

  function handleChange(next: string) {
    // Choosing the language already being read is a no-op, exactly like the legacy control.
    if (next === current) return;
    const option = options.find((candidate) => candidate.value === next);
    if (option === undefined) return;
    // The destination is a PUBLISHED alternate address — never rebuilt, never prefixed, never folded.
    router.push(option.href);
  }

  return (
    <select
      aria-label={label}
      data-selector="language"
      value={current}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}