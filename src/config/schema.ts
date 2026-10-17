import { z } from "zod";

import { isCalendarDate, normalizePageRegionBindings } from "@/core/region";
import { isIanaTimeZone } from "@/core/business-hours";
// The ONE content-slug rule. A `pageBindings` slug and a legal-document slug must
// both name a real content file, so they consume the same authority the page-source
// contract and the content repository use — never a restated copy of the regex.
import { CONTENT_SLUG_PATTERN } from "@/core/page-content";
import { LOCALE_PATTERN } from "@/core/locale";
// R1 — the ONE vocabulary for the optional site-wide notice (mode/tone). The schema and the shell's
// resolver (`@/core/notice`) share it, so no component can treat a mode or a tone the build refused.
import { SITE_NOTICE_MODES, SITE_NOTICE_TONES } from "@/core/notice";
// LOC1 — the ONE shape rule and the ONE set of cross-reference rules for a Site's
// OPTIONAL Location-selection policy. The schema applies the same functions the
// resolver and the route boundary use, so none of the three can disagree.
import {
  locationSelectionIssue,
  locationSelectionIssues,
} from "@/core/location-selection";
import { resolveSites, SiteConfigurationError, type SiteSet } from "@/core/site";
import { normalizeSiteCode, siteCodeIssue } from "@/core/site-code";
import { LOCALE_PATH_KEY_PATTERN } from "@/core/site-locale";
import {
  CONTENT_WIDTHS,
  CTA_ACTIONS,
  CTA_STATES,
  CTA_STYLES,
  COLOR_HEX_PATTERN,
  DESKTOP_NAVIGATION_PATTERNS,
  ICON_ASSET_PATTERN,
  ICON_POSITIONS,
  MENU_MODES,
  MOBILE_NAVIGATION_PATTERNS,
  NAV_REGIONS,
  PRESENTATION_HEADERS,
  PRESENTATION_HEROES,
  PRESENTATION_RHYTHMS,
  PRESENTATION_SURFACES,
  PRESENTATION_TYPOGRAPHIES,
  SHELL_VARIANTS,
  SHELL_LAYOUTS,
  TABLET_NAVIGATION_PATTERNS,
  THEME_MODES,
  THEME_RADII,
  UI_DENSITIES,
} from "@/core/ui";

import { hubMembershipIssuesForAuthoredSites } from "./hub-membership";

/**
 * Schema contract for `site.config.json`.
 *
 * The JSON file is edited by humans and downstream clones; this schema is
 * what makes a bad edit fail fast at build time with an actionable
 * message instead of producing a broken site.
 */

const localeCode = z
  .string()
  .regex(
    LOCALE_PATTERN,
    "must be a language tag such as 'en', 'fr-CA' or 'zh-Hans' (two or three lowercase " +
      "letters, then optional alphanumeric subtags of 2–8 characters)",
  );

export const localeConfigSchema = z.object({
  code: localeCode,
  label: z.string().min(1, "must not be empty"),
  /**
   * Phase M refinement — the language's canonical English name, shown
   * in bracket after the native `label` in the Language selector when they
   * differ. Explicit configuration; never inferred.
   */
  englishLabel: z.string().min(1, "must not be empty").optional(),
  /**
   * R1B — the SITE's own words for this locale: the sentence a search engine
   * or social preview shows for this locale's ROOT page (`/<site>/<locale>`),
   * where no page-level summary exists to speak for it.
   *
   * It exists because `site.description` is ONE string while a deployment may
   * speak several languages: the locale root's metadata description is the
   * site's by contract (see `[[...segments]]/page.tsx`), so a translated locale
   * root would otherwise advertise `site.description` in another language.
   * Absent → `site.description` (the documented single-language behaviour, and
   * why adding this leaf changes no existing deployment).
   */
  description: z.string().min(1, "must not be empty").optional(),
});

/**
 * FS-4 — canonical asset configuration (absolute URLs, validated; defaulted).
 *
 * P6-2C/P6-2D established the generic branding asset ROLES
 * (`logo-header` / `logo-footer` / `sidebar-open` / `sidebar-close` /
 * `favicon`) and their real consumers:
 *  - `logo`       → `logo-header` (JSON-LD `Organization.logo` **and**, since
 *                   P6-3B, the rendered header brand mark);
 *  - `favicon`    → `favicon` (browser tab icon, `metadata.icons.icon`);
 *  - `logoFooter` → `logo-footer` (composed into the footer, P6-2D);
 *  - `banners`    → page banners (P6-3B — replaces the former `logoTitle`
 *                   "title logo" concept with a per-page banner record).
 * `sidebar-open`/`sidebar-close` are NOT part of this block — they resolve
 * through the separate plain-filename icon-asset contract
 * (`ui.navigation.sidebar.open/close.icon`, `src/config/assets.ts`).
 */
export const siteAssetsSchema = z.object({
  /** Structured-data + header brand logo (JSON-LD `ImageObject`) — the `logo-header` role. */
  logo: z
    .url("must be an absolute URL including protocol, e.g. https://example.com/assets/logo-header.svg")
    .optional(),
  /** Open Graph / social sharing image (defaults to the generated per-locale route). */
  ogImage: z
    .url("must be an absolute URL including protocol, e.g. https://example.com/assets/og-image.png")
    .optional(),
  /** Browser favicon / icon — the `favicon` role. */
  favicon: z
    .url("must be an absolute URL including protocol, e.g. https://example.com/assets/favicon.svg")
    .optional(),
  /**
   * P6-2C — the `logo-footer` role (absolute URL); composed into the footer.
   */
  logoFooter: z
    .url("must be an absolute URL including protocol, e.g. https://example.com/assets/logo-footer.svg")
    .optional(),
  /**
   * P6-3B — the `banner-*` role (absolute URL). A PAGE banner record keyed by
   * PAGE SLUG: `""` or `"home"` = the home page; `"about"` = the About page;
   * etc. A page with NO entry renders NO banner (no placeholder, no reserved
   * space, never another page's banner). The rendered height is derived from
   * the supplied graphic (no fixed height, no structural padding).
   */
  banners: z
    .record(
      z.string(),
      z.url("must be an absolute URL including protocol, e.g. https://example.com/assets/banner-home.jpg"),
    )
    .optional(),
  /**
   * P12-BG — the `background-*` role (absolute URL). A DECORATIVE background
   * record keyed by PAGE ROLE: the reserved key `"all"` is the GLOBAL
   * background, and any other key (`"home"`, `"about"`, …) is the PAGE-SPECIFIC
   * background for that page family. Resolution is `background-<page>` →
   * `background-all` → none, so a page with NO entry (and no global) renders NO
   * graphic background at all — no placeholder, never another page's graphic.
   * The graphic layers OVER the flat `ui.theme.background` colour; it never
   * replaces it (see globals.css — `.ui-page-background`).
   */
  backgrounds: z
    .record(
      z.string(),
      z.url(
        "must be an absolute URL including protocol, e.g. https://example.com/assets/background-all.jpg",
      ),
    )
    .optional(),
  /**
   * P12-FG — the optional `footer-graphic` role (absolute URL): ONE global
   * DECORATIVE footer graphic / watermark, layered behind the footer content.
   * It is deliberately NOT the footer identity mark: `logoFooter` (the
   * `logo-footer` role) stays the independent footer logo. Absent (or
   * configured-but-missing) → no decorative layer at all.
   */
  footerGraphic: z
    .url("must be an absolute URL including protocol, e.g. https://example.com/assets/footer-graphic.png")
    .optional(),
  /**
   * P12-HG — the optional `header-graphic` role (absolute URL): ONE global
   * DECORATIVE header band / structural graphic layer, painted as the header's
   * OWN background so it always sits behind the header's logo, navigation,
   * switchers and mobile trigger (`globals.css` —
   * `.ui-site-header[data-ui-header-graphic]`).
   *
   * It is deliberately NOT the header identity mark: `logo` (the `logo-header`
   * role) stays the independent header brand link. It is also NOT the page
   * banner: `banners` is a PAGE-SPECIFIC region rendered ABOVE the whole shell,
   * while this role is GLOBAL and belongs TO the header. Absent (or
   * configured-but-missing) → no decorative band at all.
   */
  headerGraphic: z
    .url("must be an absolute URL including protocol, e.g. https://example.com/assets/header-graphic.svg")
    .optional(),
  /**
   * P12-SG — the optional `status-graphic` role (absolute URL): ONE optional
   * global DECORATIVE status graphic, rendered by BOTH status surfaces
   * (`src/app/[locale]/error.tsx` and `src/app/[locale]/not-found.tsx`) in one
   * deterministic in-flow box above the status heading
   * (`src/components/site/status-graphic.tsx` → `.ui-status-graphic`).
   *
   * It is ONE role, not two: the audit proved the two surfaces render the SAME
   * status frame (`<Section className="py-24 text-center">` with an
   * `h1`/`p`/action rhythm), so one replaceable graphic serves both truthfully —
   * independent artwork per route would duplicate config and code with no
   * adopter-facing benefit.
   *
   * It is deliberately NOT an error icon, NOT semantic status communication and
   * NOT a replacement for the status heading: the status pages stay completely
   * understandable and operable without it. It is also independent of the page
   * background, the `banners` region, and the header/footer graphic roles.
   * Absent (or configured-but-missing) → no graphic at all.
   */
  statusGraphic: z
    .url("must be an absolute URL including protocol, e.g. https://example.com/assets/status-graphic.svg")
    .optional(),
  /**
   * FOUNDATION-UI-R1F — the optional `logo-compact` role (absolute URL): the COMPACT header artwork the
   * browser selects BY VIEWPORT WIDTH below 600 CSS pixels, while `logo` (the `logo-header` role) is selected
   * at and above that width.
   *
   * It is a HEADER-PRESENTATION ALTERNATIVE, never a second organisation identity: `logo` remains the ONE
   * authority for structured data (`Organization.logo`) and for every other consumer, and a deployment that
   * configures no compact artwork is unchanged at every width (the browser is handed ONE source).
   *
   * It is OPTIONAL and it is NOT a primary logo: a compact alternative is only meaningful as the narrow-width
   * reading of a configured primary brand mark, so configuring one WITHOUT `logo` is refused below with an
   * actionable message (never silently ignored, never rendered as the identity).
   *
   * Artwork is authored and installed exactly like every other role (see BRAND_ASSETS.md): the file lives in
   * `content/assets/**` and is served from the runtime namespace that owns it, so a configured compact asset
   * that cannot be served fails the build (`src/config/assets.ts`,
   * `assertConfiguredCompactLogoAvailableFor`) instead of becoming a broken responsive image. FOUNDATION-UI-R1G
   * makes that rule complete: runtime artwork is always DELIVERED from this deployment's own origin (a configured
   * origin is canonical source identity, never a delivery instruction), so the value must be on that origin, and a
   * path that addresses generated artwork must name a namespace this context may serve and a file THAT namespace
   * holds. The template itself ships no compact artwork and configures none — the role is absent by default.
   */
  logoCompact: z
    .url("must be an absolute URL including protocol, e.g. https://example.com/assets/logo-compact.svg")
    .optional(),
})
  .superRefine((assets, ctx) => {
    // FOUNDATION-UI-R1F — A COMPACT LOGO IS AN ALTERNATIVE, NOT AN IDENTITY. It exists so a wide primary
    // mark can be replaced by a compact reading of the same brand on a narrow viewport; with no primary mark
    // there is nothing to be an alternative TO, and the header would have to invent an identity from it. The
    // refusal is the schema's (not the renderer's), so the adopter is told at validation time, in the same
    // place every other configuration mistake is reported.
    if (assets.logoCompact !== undefined && assets.logo === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["logoCompact"],
        message:
          '"site.assets.logoCompact" is the compact ALTERNATIVE to the primary brand logo, so it requires ' +
          '"site.assets.logo": configure the primary logo as well — or drop "logoCompact" and let the text ' +
          "brand be the identity at every width.",
      });
    }
  });

export const siteSettingsSchema = z.object({
  url: z
    .url("must be an absolute URL including protocol, e.g. https://example.com")
    .refine((url) => !url.endsWith("/"), "must not end with a trailing slash"),
  name: z.string().min(1, "must not be empty"),
  tagline: z.string().min(1, "must not be empty"),
  description: z.string().min(1, "must not be empty"),
  /**
   * Phase S — optional brand logo (absolute URL). Consumed by JSON-LD
   * structured data (`logo`). Does NOT replace the generated OpenGraph image.
   */
  logo: z
    .url("must be an absolute URL including protocol, e.g. https://example.com/logo.png")
    .optional(),
  /**
   * FS-4 — canonical visual asset configuration. Every value is an OPTIONAL
   * absolute URL; absent keys fall back to the shipped Foundation default
   * asset (see public/assets/). Defaults are predictable and replaceable both
   * in place and via configuration.
   */
  assets: siteAssetsSchema.optional(),
});

export const i18nConfigSchema = z
  .object({
    defaultLocale: localeCode,
    locales: z.array(localeConfigSchema).min(1, "must list at least one locale"),
  })
  .refine(
    (i18n) => i18n.locales.some((locale) => locale.code === i18n.defaultLocale),
    {
      message: "defaultLocale must match the code of one entry in locales",
    },
  );

export const contactConfigSchema = z.object({
  email: z.email().optional(),
  phone: z.string().min(1).optional(),
  /**
   * Optional per-locale customer-facing contact overrides (Phase I), keyed by
   * BCP-47 locale code. A locale is a customer context, not a country mapping;
   * locale-specific values win over the global/default values.
   */
  locales: z
    .record(
      localeCode,
      z.object({
        email: z.email().optional(),
        phone: z.string().min(1).optional(),
      }),
    )
    .optional(),
});

const weekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm in 24-hour format");

/**
 * Validates a real IANA timezone identifier using the runtime's `Intl`
 * timezone table (the authoritative, cross-platform list — not a hand-written
 * zone list). Node/ICU throws for unknown identifiers, so a typo in config
 * fails validation at build time with an actionable message. Single
 * implementation lives in `src/core/business-hours`.
 */
const ianaTimeZoneSchema = z.string().refine(isIanaTimeZone, {
  message:
    "must be a valid IANA timezone identifier, e.g. 'Asia/Jakarta' or 'America/New_York'",
});

const addressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  region: z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
});

/**
 * How a location address is presented on pages (Phase I). `local` shows only
 * the native/local form; `local-international` shows native PLUS a Latin form
 * and therefore requires `addressInternational`.
 */
const addressPresentationModeSchema = z.enum(["local", "local-international"]);

const geoCoordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const openIntervalSchema = z
  .object({
    days: z.array(weekdaySchema).min(1, "must list at least one day"),
    open: timeSchema,
    close: timeSchema,
  })
  // A 24h/continuous schedule is intentionally ambiguous in this model
  // (a full-day interval would be 00:00–24:00, not expressible), so reject
  // `open === close`. Overnight (`close < open`) is fully supported.
  .refine((i) => i.open !== i.close, "open and close must differ");

const exceptionalHoursSchema = z
  .object({
    // ISO date YYYY-MM-DD (validated loosely; content owns correctness).
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
    closed: z.boolean().optional(),
    open: timeSchema.optional(),
    close: timeSchema.optional(),
  })
  // An exceptional entry must be a full override: either a closure
  // (`closed: true`) or a complete `open` + `close` interval. A partial pair
  // (only `open` or only `close`) is a config error — rejecting it avoids a
  // silent "closed that day" surprise from a typo'd entry.
  .refine(
    (entry) => entry.closed === true || (entry.open !== undefined && entry.close !== undefined),
    {
      message:
        "an exceptional-hours entry must be either closed: true or provide both open and close",
    },
  );

const businessHoursSchema = z.object({
  intervals: z.array(openIntervalSchema),
  exceptional: z.array(exceptionalHoursSchema),
});

const businessLocationLocaleOverrideSchema = z.object({
  /**
   * Per-field partial address. Unspecified fields fall back to the global
   * location address. `street`/`city` are required only when the whole address
   * is replaced; a partial override may set just the fields that vary.
   */
  address: addressSchema.partial().optional(),
  /**
   * Per-field partial Latin/international address (Phase I). When the location
   * has a base international address this merges onto it; otherwise it becomes
   * the international address for this locale.
   */
  addressInternational: addressSchema.partial().optional(),
  /** Display mode for this locale; falls back to the location's base mode. */
  addressMode: addressPresentationModeSchema.optional(),
  phone: z.string().min(1).optional(),
  geo: geoCoordsSchema.optional(),
});

const businessLocationSchema = z.object({
  id: z.string().min(1, "must not be empty"),
  name: z.string().min(1).optional(),
  address: addressSchema,
  /**
   * Optional Latin/international representation of the SAME place (Phase I),
   * for global/cross-border consumers. Owner-supplied — never generated.
   */
  addressInternational: addressSchema.optional(),
  /** How the address is presented on pages; defaults to "local". */
  addressMode: addressPresentationModeSchema.optional(),
  geo: geoCoordsSchema.optional(),
  phone: z.string().min(1).optional(),
  timezone: ianaTimeZoneSchema.optional(),
  hours: businessHoursSchema.optional(),
  /**
   * Optional per-locale NAP overrides (Phase G), keyed by BCP-47 locale code.
   * A locale is a visitor context, not a mapping to a country/geography; each
   * key is whatever the adopter decides to associate. Adding a locale is a
   * configuration/data change only — no `src/` platform code edit.
   */
  locales: z
    .record(localeCode, businessLocationLocaleOverrideSchema)
    .optional(),
});

const businessTypeSchema = z.enum([
  "Organization",
  "LocalBusiness",
  "ProfessionalService",
  "Restaurant",
  "Store",
]);

/**
 * Phase K — region operating context. Each region is independently clocked
 * (required IANA timezone), located, and scheduled; it never inherits
 * business/location defaults.
 */
const regionTimeIntervalSchema = z
  .object({
    open: timeSchema,
    close: timeSchema,
  })
  // Same 24h-ambiguity rule as the legacy interval model: a full-day schedule
  // would be 00:00–24:00 (not expressible here), so `open === close` is
  // rejected. Overnight (`close < open`) is fully supported.
  .refine((i) => i.open !== i.close, "open and close must differ");

const regionHolidaySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
      .refine(isCalendarDate, "must be a real calendar date"),
    name: z.string().min(1, "must not be empty"),
    closed: z.boolean().optional(),
    intervals: z.array(regionTimeIntervalSchema).optional(),
  })
  // A holiday must be a full override: either an explicit closed flag or one
  // or more special intervals. A listed holiday with neither is a config error
  // (and would otherwise silently read as closed).
  .refine(
    (entry) => entry.closed === true || (entry.intervals?.length ?? 0) > 0,
    {
      message:
        "a holiday must be either closed: true or provide at least one interval",
    },
  );

const regionHoursSchema = z
  .object({
    monday: z.array(regionTimeIntervalSchema).optional(),
    tuesday: z.array(regionTimeIntervalSchema).optional(),
    wednesday: z.array(regionTimeIntervalSchema).optional(),
    thursday: z.array(regionTimeIntervalSchema).optional(),
    friday: z.array(regionTimeIntervalSchema).optional(),
    saturday: z.array(regionTimeIntervalSchema).optional(),
    sunday: z.array(regionTimeIntervalSchema).optional(),
    holidays: z.array(regionHolidaySchema).optional(),
  })
  // An unknown key is a config typo that must fail loudly (e.g. a misspelled
  // weekday would otherwise be silently ignored and render as closed).
  .strict();

const regionSchema = z.object({
  timezone: ianaTimeZoneSchema,
  /** Canonical English display name (falls back to id when absent). */
  name: z.string().min(1).optional(),
  /** Short display label for the location selector (falls back to name/id). */
  label: z.string().min(1).optional(),
  /**
   * Phase M refinement — localized display names keyed by BCP-47 locale code.
   * `label`/`name` remain the canonical English display names; `labels[locale]`
   * is presentation data only (region identity/ids are language-neutral).
   */
  labels: z.record(localeCode, z.string().min(1)).optional(),
  /**
   * Phase M — deterministic locale chosen for this region when the visitor's
   * current locale is not bound to it (a location switch across an unsupported
   * language). Explicit configuration; never inferred from country/timezone/
   * browser. Validated at build time to be a configured locale AND bound to
   * the region.
   */
  defaultLocale: localeCode.optional(),
  address: addressSchema,
  addressInternational: addressSchema.optional(),
  addressMode: addressPresentationModeSchema.optional(),
  geo: geoCoordsSchema.optional(),
  phone: z.string().min(1).optional(),
  email: z.email().optional(),
  hours: regionHoursSchema,
  /** ISO 4217 currency code for this operating location (e.g. "AUD", "USD", "EUR"). */
  currency: z.string().min(3).max(3).optional(),
  /** Display symbol or prefix for the currency (e.g. "A$", "$", "€", "£", "¥"). */
  currencySymbol: z.string().min(1).optional(),
});

/**
 * A page-inventory entry: `{ locale, region }` is the regional landing
 * `/{locale}/{region}`; `{ locale, region, slug }` is a regional page
 * `/{locale}/{region}/{slug}`. Accepts the Phase K form `{ locale, slug,
 * region }` as well (slug === region is normalized to a landing by the
 * loader).
 */
const pageRegionBindingSchema = z.object({
  locale: localeCode,
  region: z.string().min(1, "must not be empty"),
  slug: z
    .string()
    .regex(CONTENT_SLUG_PATTERN, "must be a lowercase slug")
    .optional(),
  /**
   * S1 — the SITE whose page tree this regional binding belongs to. Absent → the default
   * site (the one whose `pathPrefix` is `""`), which keeps a single-site deployment
   * unchanged. A binding can never leak into another site: the route resolves regions
   * inside one site, and the site names its own bindings here.
   */
  site: z
    .string()
    .regex(CONTENT_SLUG_PATTERN, "must be a lowercase slug")
    .optional(),
});

const businessSchema = z
  .object({
    timezone: ianaTimeZoneSchema.optional(),
    type: businessTypeSchema.optional(),
    name: z.string().min(1).optional(),
    tagline: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    contact: contactConfigSchema.optional(),
    locations: z.array(businessLocationSchema).min(1, "must list at least one location").optional(),
    /**
     * Phase K — regional operating context. When present, each region is an
     * independent operational identity (timezone/address/hours/etc.); the
     * legacy global `locations`/`timezone`/`contact` path is NOT merged with
     * regions (deterministic precedence, documented in ARCHITECTURE.md).
     */
    regions: z.record(z.string().min(1, "must not be empty"), regionSchema).optional(),
    pages: z.array(pageRegionBindingSchema).optional(),
  })
  .superRefine((business, ctx) => {
    const hasRegions = business.regions !== undefined && Object.keys(business.regions).length > 0;
    const hasPages = (business.pages?.length ?? 0) > 0;
    if (hasPages && !hasRegions) {
      ctx.addIssue({
        code: "custom",
        path: ["pages"],
        message: "page→region bindings require a non-empty \"business.regions\" block",
      });
    }
  });

/**
 * P5-5 — plain configurable asset filename under `public/assets/` (icon/
 * image). Paths, traversal, query strings, and URLs are rejected; the adopter
 * replaces the file in place or swaps the validated filename. An explicit `""`
 * is NOT valid here — omit the key instead (empty means "no icon" only on
 * control leaves that model it, e.g. `ui.cta.icon`, `navigation.sidebar.*`).
 */
export const uiIconAssetSchema = z
  .string()
  .regex(
    ICON_ASSET_PATTERN,
    "must be a plain asset filename stored in public/assets/ (letters, digits, ., _, -) ending in .svg, .png, .webp, .jpg, .jpeg, .gif, or .ico — paths and URLs are not allowed",
  );

/**
 * P5-5 — a control's optional icon leaf. Unlike a content/asset reference, a
 * CONTROL icon may be an explicit `""` (meaning "render no icon; text-only")
 * or a valid asset filename. This is what makes the derived disabled state
 * (`icon: ""` + `text: ""` → control not rendered) expressible without an
 * invented boolean.
 */
export const uiControlIconSchema = z.union([z.literal(""), uiIconAssetSchema]);

/**
 * CONNECTIVITY ICON SEAM — social/profile destination (`socialLinks[]`).
 *
 * Connectivity is a CORE Provelopment Foundation capability (owner product
 * decision): the engine supports an OPTIONAL, generic icon/mark reference on
 * every connectivity item, expressed as a plain `public/assets/` filename that
 * is screened at RENDER time by the established availability rule
 * (`availableIconName` → `src/components/site/connectivity-links.ts`).
 *
 * Deliberately NOT part of the loud build-failure set: connectivity artwork is
 * SUPPLEMENTARY by contract (owner requirement — text remains authoritative), so
 * a name with no backing file must degrade to a text-only link. It must never
 * fail a build, error a page or drop a communication method; artwork may simply
 * be pending approval. The VALUE SHAPE is still validated loudly (paths, URLs,
 * traversal and query strings are rejected by `uiIconAssetSchema`), so the
 * adopter is never silently misconfigured — only "no file yet" is tolerated.
 *
 * Deliberately generic — there is NO platform-specific leaf (`whatsappIcon`,
 * `telegramIcon`, `linkedinIcon`, …) and NO closed platform vocabulary:
 * `platform` stays free-form deployment data and the engine never learns what
 * any platform means. It only understands "an optional asset belongs to this
 * connectivity item", so future platforms need no schema/engine change.
 *
 * The icon is SUPPLEMENTARY and DECORATIVE: `platform`/`label`/`href` remain
 * authoritative, and the item renders as a usable text link whether or not
 * artwork exists. Third-party platform marks stay a separate, trademark-gated
 * production question — this contract does not create, download or authorize any
 * mark.
 *
 * (Declared here, after the P5-5 icon-asset contract it reuses. `uiIconAssetSchema`
 * rejects URLs/paths — an absolute third-party/CDN mark URL is deliberately NOT
 * expressible through this seam.)
 */
export const socialLinkSchema = z.object({
  /** Free-form platform identity (deployment data; never an engine concept). */
  platform: z.string().min(1, "must not be empty"),
  label: z.string().min(1, "must not be empty"),
  href: z.url("must be an absolute URL including protocol"),
  /** Optional supplementary icon/mark asset (plain `public/assets/` filename). */
  icon: uiIconAssetSchema.optional(),
});

export const navigationItemSchema = z
  .object({
    label: z.string().min(1, "must not be empty"),
    href: z.string().min(1, "must not be empty"),
    /** P5-5 — optional navigation-item icon (plain public/assets filename). */
    icon: uiIconAssetSchema.optional(),
    /**
     * P6-3B — optional EXPANDED-state sidebar item icon (plain public/assets
     * filename). Overrides the expanded default (`sidebar-default-icon-open`).
     */
    iconOpen: uiIconAssetSchema.optional(),
    /**
     * P6-3B — optional COLLAPSED-state sidebar item icon (plain public/assets
     * filename). Overrides the collapsed default (`sidebar-default-icon-closed`).
     */
    iconClosed: uiIconAssetSchema.optional(),
    /** P5-5 — sidebar region group (top | middle | bottom; default middle). */
    position: z
      .enum(NAV_REGIONS, {
        message: `must be one of: ${NAV_REGIONS.join(", ")}`,
      })
      .optional(),
    /**
     * P5-5A (contract hardening) — semantically disabled navigation item:
     * rendered `aria-disabled="true"`, not navigable, removed from the tab
     * order, visually muted (see NavItem/globals.css). This field was
     * implemented/rendered/documented since P5-5 but MISSING from the schema,
     * so Zod silently STRIPPED it from validated configuration — the documented
     * capability did not actually reach the renderer. It is now validated
     * (and round-trips), exactly like every other navigation leaf.
     */
    disabled: z.boolean().optional(),
  })
  .strict();

/** Safe method id for the `connect.methods` list (must be URL-friendly). */
const connectMethodIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Phase M — a single connection mode exposed by the Connect page. Labels and
 * hrefs are adopter-provided (a `mailto:`/`tel:`/`https:` external deep link,
 * or an internal page such as the Message form). `demoOnly` marks template
 * demonstration entries with a visible badge — the page never pretends an
 * integration exists.
 */
const connectMethodSchema = z
  .object({
    id: z
      .string()
      .regex(connectMethodIdPattern, "must be a lowercase slug, e.g. 'whatsapp'"),
    label: z.string().min(1, "must not be empty"),
    href: z.string().min(1, "must not be empty"),
    /**
     * CONNECTIVITY ICON SEAM — the SAME generic optional icon contract as
     * `socialLinkSchema.icon` (one seam serving both connectivity families,
     * never two icon systems): a plain `public/assets/` filename that is
     * purely supplementary/decorative and screened at RENDER time, so a missing
     * file degrades to the method's authoritative text link — it never fails a
     * build, never errors and never hides a method. No platform is named here;
     * `id` and `label` remain free-form deployment data.
     */
    icon: uiIconAssetSchema.optional(),
    demoOnly: z.boolean().optional(),
  })
  .refine(
    (method) => method.href.startsWith("/") || /^[a-z]+:/i.test(method.href),
    {
      message: "href must be an internal route ('/...') or an absolute deep link ('mailto:', 'tel:', 'https:', ...)",
    },
  );

export const connectConfigSchema = z
  .object({
    methods: z.array(connectMethodSchema).min(1, "must list at least one connection method"),
  })
  .refine(
    (connect) => new Set(connect.methods.map((method) => method.id)).size === connect.methods.length,
    {
      message: "connect.methods ids must be unique",
    },
  );

/**
 * Safe slug for a legal document (must match a `content/legal/` file).
 *
 * A legal slug IS a content slug — it names a file exactly as a page slug does —
 * so the rule is the ONE core authority, aliased here for the local concept name.
 */
const legalSlugPattern = CONTENT_SLUG_PATTERN;

export const legalEntrySchema = z.object({
  slug: z
    .string()
    .regex(legalSlugPattern, "must be a lowercase slug, e.g. 'privacy' or 'terms-of-service'"),
  label: z.string().min(1, "must not be empty"),
});

/**
 * The OPTIONAL secondary / footer navigation group.
 *
 * A footer group is a DISTINCT navigation concern, and this block is the only
 * surface that expresses it. It is deliberately separate from:
 *
 *  - `navigation[]`     — the PRIMARY navigation (menu, sidebar, bottom bar);
 *  - `connect.methods[]`— connection/contact METHODS (email, phone, messaging);
 *  - `socialLinks[]`    — profile/connectivity destinations;
 *  - `legal[]`          — policy documents.
 *
 * It exists so a site can surface contextual destinations (Home, How It Works,
 * About, Help, the source repository) in the footer WITHOUT misrepresenting them
 * as contact methods — which is exactly what using `connect.methods` as a footer
 * group forced.
 *
 * What this block deliberately does NOT do:
 *  - it does not alter the primary navigation in any way;
 *  - it does not create or imply routes — a footer link is a link, never
 *    evidence that a page exists;
 *  - it does not drive sitemap discovery (route discovery reads the CONTENT
 *    model, never navigation config);
 *  - its heading is never a link.
 *
 * Items reuse the established `navigationItemSchema`, so there is ONE link
 * contract (internal vs external href, optional decorative icon, `disabled`
 * semantics) rather than a second parallel link model. The sidebar-only leaves
 * (`position`, `iconOpen`, `iconClosed`) are accepted for shape-compatibility
 * but have no meaning in a footer group and are ignored by the footer renderer.
 */
/**
 * R1 — THE OPTIONAL SITE-WIDE NOTICE (generic shell chrome).
 *
 * An OPT-IN message the shell presents on EVERY page of the Spoke that enables it — the capability an
 * adopter uses when every visitor must be told something (a demonstration site carries fictitious business
 * information, a service is interrupted, an offer applies site-wide) WITHOUT copying that message into each
 * page's authored content. The WORDS are not here: they are localized copy, read from the dictionary
 * (`siteNotice.title` / `siteNotice.body`, see `@/config/i18n/dictionary`), and a Spoke that enables the
 * notice without copy for a locale it serves is REFUSED at build time (`@/config/runtime-dictionaries` →
 * `assertSiteNoticeCopyPresent`) rather than publishing a blank notice.
 *
 * R2 adds ONE optional leaf, `replacesDemoNotices`: the adopter's explicit statement that this presented
 * notice REPLACES the page-level introductory demonstration notices some page chrome would otherwise render
 * — the one beside a demonstration contact form and the one on the Connect page. A Spoke that declares it
 * presents ONE introductory notice per page; a Spoke that does not declares nothing and keeps every one of
 * those notices, so an existing installation is byte-identical. The refinement below refuses the opt-in
 * beside a notice that is NOT presented, because replacement without a notice removes a warning instead of
 * consolidating it.
 *
 * The vocabulary itself lives in the pure domain (`@/core/notice`), so the schema, the loader, the resolver
 * and the tests cannot drift about what a mode, a tone or the replacement opt-in is.
 */
export const siteNoticeSchema = z
  .object({
    /** `shown` presents the notice; `hidden` silences it while its wording stays authored. */
    mode: z.enum(SITE_NOTICE_MODES, { message: "supported modes: shown, hidden" }),
    /**
     * INTENT, never a colour: `information` (the default) or `attention`. The shell maps a tone onto
     * accessible markup and an existing design token — no adopter-specific styling enters the platform.
     */
    tone: z.enum(SITE_NOTICE_TONES, { message: "supported tones: information, attention" }).optional(),
    /**
     * R2 — THE REPLACEMENT OPT-IN. `true` declares that THIS notice STANDS IN FOR the page-level introductory
     * demonstration notices some page chrome would otherwise render, so a page presents ONE introductory
     * notice (the banner) instead of two. Absent or `false` leaves every one of those notices exactly as it
     * was, which is why no existing installation changes.
     *
     * Meaningful ONLY for a PRESENTED notice — see the refinement below, which refuses it beside `hidden`.
     */
    replacesDemoNotices: z.boolean().optional(),
  })
  .strict()
  .superRefine((notice, ctx) => {
    if (notice.replacesDemoNotices === true && notice.mode !== "shown") {
      ctx.addIssue({
        code: "custom",
        path: ["replacesDemoNotices"],
        message:
          '"replacesDemoNotices": true requires "mode": "shown" — only a notice that is actually presented ' +
          "can stand in for the page-level introductory notices. Present the notice, or drop the opt-in.",
      });
    }
  });

export const footerNavigationSchema = z
  .object({
    /** The group heading. OPTIONAL, plain text, never a link. */
    heading: z.string().min(1, "must not be empty").optional(),
    /** The group's links, rendered in configuration order. */
    items: z.array(navigationItemSchema).min(1, "must list at least one item"),
  })
  .strict();

export const featuresConfigSchema = z.object({
  /** Optional functionality, each consumed by its own adapter. */
  analytics: z
    .object({
      provider: z.enum(["vercel", "none"], {
        message: "supported providers: vercel, none",
      }),
    })
    .optional(),
  /**
   * Maps directions seam (Phase H). `google` produces a keyless "Get
   * directions" deep link from the locale-resolved location; `none` (or
   * absent) disables it. No API key is required for a deep-link provider.
   */
  maps: z
    .object({
      provider: z.enum(["google", "none"], {
        message: "supported providers: google, none",
      }),
    })
    .optional(),
  /**
   * Booking action seam (Phase H). Deliberately a STATIC external action:
   * `external-url` deep-links to the adopter's public booking destination,
   * supplied by `url`. `none` (or absent) disables it. `external-url` requires
   * a url — a configured provider with a missing url fails the build.
   */
  booking: z
    .object({
      provider: z.enum(["external-url", "none"], {
        message: "supported providers: external-url, none",
      }),
      url: z
        .url("must be an absolute URL including protocol, e.g. https://example.com")
        .optional(),
    })
    .superRefine((booking, ctx) => {
      if (booking.provider === "external-url" && !booking.url) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: 'provider "external-url" requires a booking url',
        });
      }
    })
    .optional(),
  /**
   * Contact inquiry capability. `stub` is the explicit demo default; `webhook`
   * requires the webhook endpoint be configured via environment variables at
   * runtime (never stored in this file — secrets are environment-backed and
   * read only by the contact server action in `src/app/contact-actions.ts`).
   */
  contact: z
    .object({
      provider: z.enum(["webhook", "stub"], {
        message: "supported providers: webhook, stub",
      }),
      fields: z
        .object({
          subject: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * UI system configuration namespace (UI-01 — Architecture & Contract).
 *
 * Optional, intent-level configuration (roadmap §11). Every single value is
 * OPTIONAL: an absent `ui` block and an empty `{}` block both parse
 * successfully. The contract fixes NO default leaf and nothing injects one —
 * resolution (defaults + overrides) is a UI-02 responsibility, and the
 * Foundation ships exactly ONE canonical presentation whose values are the
 * defaults.
 *
 * The retired `ui.preset` selection key is deliberately NOT part of this schema:
 * a config that still carries it is rejected as an unknown key (the `.strict()`
 * block below), so a stale or copy-pasted key can never silently select another
 * presentation.
 *
 * The allowed values derive from `src/core/ui/vocabulary.ts`. Unknown keys are
 * rejected loudly (a config typo must never be silently ignored — same
 * convention as the region schedule), and unknown enum values fail with the
 * full expected list in the message.
 *
 * The block is validated here but NOT consumed by rendering until later
 * phases; during the UI-01 transition an absent or partial block changes
 * nothing at runtime.
 */

const shellVariantMessage = `must be one of: ${SHELL_VARIANTS.join(", ")}`;

const uiShellSchema = z
  .object({
    header: z.enum(SHELL_VARIANTS, { message: shellVariantMessage }).optional(),
    footer: z.enum(SHELL_VARIANTS, { message: shellVariantMessage }).optional(),
    /**
     * P0-1 — declarative sidebar capability. Optional; only `collapsible`
     * exists today. The sidebar's PRESENCE is expressed by the resolved
     * navigation composition (aside slots), never duplicated here.
     */
    sidebar: z
      .object({
        collapsible: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * P5-5 — one icon+text disclosure control (e.g. the sidebar open/close).
 *
 * Explicit `""` semantics (documented + tested): a MISSING text falls back to
 * the localized dictionary label; `text: ""` means "no visible text (icon
 * only)"; a MISSING icon falls back to the shipped asset; `icon: ""` means
 * "no icon (text only)". When BOTH `icon: ""` and `text: ""` are set the
 * control is not rendered at all (derived disabled state — no invented
 * boolean).
 */
const uiSidebarControlSchema = z
  .object({
    icon: uiControlIconSchema.optional(),
    text: z.string().optional(),
  })
  .strict();

/** P5-5 — the shared three-state menu/control presentation mode. */
const uiMenuModeSchema = z
  .enum(MENU_MODES, { message: `must be one of: ${MENU_MODES.join(", ")}` })
  .optional();

/** P5-5 — sidebar presentation intent (mode + open/close disclosure content). */
const uiSidebarSchema = z
  .object({
    mode: uiMenuModeSchema,
    open: uiSidebarControlSchema.optional(),
    close: uiSidebarControlSchema.optional(),
  })
  .strict();

/** P5-5 — a menu surface's shared presentation mode (top / bottom). */
const uiMenuSurfaceSchema = z
  .object({
    mode: uiMenuModeSchema,
  })
  .strict();

const uiNavigationSchema = z
  .object({
    desktop: z
      .enum(DESKTOP_NAVIGATION_PATTERNS, {
        message: `must be one of: ${DESKTOP_NAVIGATION_PATTERNS.join(", ")}`,
      })
      .optional(),
    tablet: z
      .enum(TABLET_NAVIGATION_PATTERNS, {
        message: `must be one of: ${TABLET_NAVIGATION_PATTERNS.join(", ")}`,
      })
      .optional(),
    mobile: z
      .enum(MOBILE_NAVIGATION_PATTERNS, {
        message: `must be one of: ${MOBILE_NAVIGATION_PATTERNS.join(", ")}`,
      })
      .optional(),
    /** P5-5 — sidebar presentation (mode + open/close disclosure content). */
    sidebar: uiSidebarSchema.optional(),
    /** P5-5 — ≥md top-navigation menu presentation mode. */
    top: uiMenuSurfaceSchema.optional(),
    /** P5-5 — mobile bottom-navigation menu presentation mode. */
    bottom: uiMenuSurfaceSchema.optional(),
  })
  .strict();

const uiContentSchema = z
  .object({
    width: z
      .enum(CONTENT_WIDTHS, {
        message: `must be one of: ${CONTENT_WIDTHS.join(", ")}`,
      })
      .optional(),
  })
  .strict();

/** P5-3 — generalized presentation intent (closed vocabulary, shared by the engine). */
const uiPresentationSchema = z
  .object({
    typography: z
      .enum(PRESENTATION_TYPOGRAPHIES, {
        message: `must be one of: ${PRESENTATION_TYPOGRAPHIES.join(", ")}`,
      })
      .optional(),
    rhythm: z
      .enum(PRESENTATION_RHYTHMS, {
        message: `must be one of: ${PRESENTATION_RHYTHMS.join(", ")}`,
      })
      .optional(),
    surface: z
      .enum(PRESENTATION_SURFACES, {
        message: `must be one of: ${PRESENTATION_SURFACES.join(", ")}`,
      })
      .optional(),
    header: z
      .enum(PRESENTATION_HEADERS, {
        message: `must be one of: ${PRESENTATION_HEADERS.join(", ")}`,
      })
      .optional(),
    hero: z
      .enum(PRESENTATION_HEROES, {
        message: `must be one of: ${PRESENTATION_HEROES.join(", ")}`,
      })
      .optional(),
  })
  .strict();

const uiCtaSchema = z
  .object({
    enabled: z.boolean().optional(),
    action: z
      .enum(CTA_ACTIONS, { message: `must be one of: ${CTA_ACTIONS.join(", ")}` })
      .optional(),
    /**
     * Adopter-provided visible label. P5-5: an explicit `""` is valid and means
     * "icon-only CTA" (the accessible name then comes from `action`); a MISSING
     * label with an icon counts as icon-only as well. An enabled CTA with
     * neither label nor icon + href renders nothing.
     */
    label: z.string().optional(),
    /**
     * Adopter-owned CTA destination (UI-07 D1). Optional and NEVER inferred:
     * the Foundation does not derive a route from `action` or invent one. An
     * enabled CTA without label+href renders nothing (engine invariant).
     */
    href: z.string().min(1, "must not be empty").optional(),
    style: z
      .enum(CTA_STYLES, { message: `must be one of: ${CTA_STYLES.join(", ")}` })
      .optional(),
    /** P5-5 — optional CTA icon (plain public/assets filename; "" = none). */
    icon: uiControlIconSchema.optional(),
    /** P5-5 — icon placement within the CTA ("start" leading, "end" trailing). */
    iconPosition: z
      .enum(ICON_POSITIONS, {
        message: `must be one of: ${ICON_POSITIONS.join(", ")}`,
      })
      .optional(),
    /** P5-5 — semantic CTA state ("default" | "disabled"). */
    state: z
      .enum(CTA_STATES, {
        message: `must be one of: ${CTA_STATES.join(", ")}`,
      })
      .optional(),
  })
  .strict();

const uiThemeSchema = z
  .object({
    mode: z
      .enum(THEME_MODES, { message: `must be one of: ${THEME_MODES.join(", ")}` })
      .optional(),
    radius: z
      .enum(THEME_RADII, { message: `must be one of: ${THEME_RADII.join(", ")}` })
      .optional(),
    /**
     * FS-5 — adopter-owned page/background color as a constrained hex value
     * (`#rgb`, `#rrggbb`, or `#rrggbbaa`), matching the `--background` design
     * token. Absent → the existing token renders. Constrained (not arbitrary
     * CSS) so a bad value can never inject unsafe CSS.
     */
    background: z
      .string()
      .regex(
        COLOR_HEX_PATTERN,
        "must be a hex color: #rgb, #rrggbb, or #rrggbbaa (e.g. #fafafa)",
      )
      .optional(),
  })
  .strict();

/**
 * N2 — the optional visitor-selectable shell layout presentation.
 *
 * Strict and cross-checked: `default` must be a member of the shipped layout
 * vocabulary (never a free-form name), and enabling the switcher while ALSO
 * configuring `navigation.desktop`/`navigation.tablet`/`navigation.mobile` is
 * REFUSED, because a layout IS those three leaves (NAV1A) — two answers to one
 * question is a contradiction, not a preference, and the Foundation fails loudly
 * instead of silently picking one.
 */
const uiLayoutSwitcherSchema = z
  .object({
    enabled: z.boolean().optional(),
    default: z
      .enum(SHELL_LAYOUTS, { message: `must be one of: ${SHELL_LAYOUTS.join(", ")}` })
      .optional(),
  })
  .strict();

export const uiConfigSchema = z
  .object({
    shell: uiShellSchema.optional(),
    navigation: uiNavigationSchema.optional(),
    density: z
      .enum(UI_DENSITIES, { message: `must be one of: ${UI_DENSITIES.join(", ")}` })
      .optional(),
    content: uiContentSchema.optional(),
    /** P5-3 — generalized presentation intent (Foundation defaults supply the rest). */
    presentation: uiPresentationSchema.optional(),
    /** N2 — the optional visitor-selectable shell layout presentation. */
    layoutSwitcher: uiLayoutSwitcherSchema.optional(),
    cta: uiCtaSchema.optional(),
    theme: uiThemeSchema.optional(),
  })
  .strict()
  .refine(
    (ui) =>
      ui.layoutSwitcher?.enabled !== true ||
      (ui.navigation?.desktop === undefined &&
        ui.navigation?.tablet === undefined &&
        ui.navigation?.mobile === undefined),
    {
      message:
        "the layout switcher defines ui.navigation.desktop/tablet/mobile itself, so setting " +
        "ui.layoutSwitcher.enabled: true together with ui.navigation.desktop, " +
        "ui.navigation.tablet or ui.navigation.mobile is ambiguous — remove those leaves " +
        "(the layouts supply them), or leave ui.layoutSwitcher.enabled unset",
      path: ["layoutSwitcher", "enabled"],
    },
  );

/**
 * S1 — a SITE: an independent page/configuration context.
 *
 * The site id is the folder name under each authoring root and never appears in a URL by
 * itself: the PUBLIC URL comes from `pathPrefix`. The locale leaves are the site's own
 * locale policy — what it serves, which locale answers by default, and whether that default
 * may stand in for the others.
 *
 * Every leaf except `id` is optional, and the defaults are the single-site ones: an adopter
 * who declares `sites: [{ "id": "main" }]` (or declares no `sites` block at all) gets the
 * deployment's default locale and every declared locale, at the deployment's own URLs.
 * Coherence (unique ids and prefixes, a prefix that is not also a locale code, exactly one
 * empty prefix when several sites exist, membership of `i18n.locales`) is enforced by the
 * SAME core resolver the runtime uses, so validation can never disagree with resolution.
 */
/**
 * S1 — ONE SITE OF THE DEPLOYMENT.
 *
 * A site is identified by a recognized two-letter COUNTRY CODE (`ca`, `fr`, `ch`, `id`, `jp`),
 * or by Foundation's reserved `ww` for a Worldwide / Global site. The code is LOWERCASE and
 * case-exact: it is simultaneously the content folder (`content/pages/<mode>/<code>/…`) and the
 * first URL segment (`/ca/en/about`), so `CA` is refused with an actionable message rather than
 * silently normalised. This field is validated by the SAME core authority the runtime uses
 * (`@/core/site-code`), so the message an author sees is the message the resolver would give.
 *
 * The locale leaves are the site's own policy — the locale PATH KEYS it serves (in either
 * authoring style: the simple `"fr"`, which a country site derives to that country's variant,
 * or the explicit `{ "path": "fr-fr" }` with an optional standards-facing `canonical` tag),
 * which locale answers by default, and whether that default may stand in for the others.
 *
 * Every leaf except `code` is optional, and the defaults are the single-site ones: an adopter
 * who declares `sites: [{ "code": "ww" }]` (or declares no `sites` block at all) gets the
 * deployment's default locale and every declared locale, at `/<code>/<locale>/…` URLs.
 *
 * Coherence (recognized lowercase codes, no duplicate sites, no duplicate EFFECTIVE locale,
 * membership of `i18n.locales`, a declared `defaultSite`) is enforced by the SAME core resolver
 * the runtime uses, so validation can never disagree with resolution — see `resolveSites`.
 */
const siteLocaleEntrySchema = z.union([
  z
    .string()
    .regex(LOCALE_PATH_KEY_PATTERN, "must be a lowercase locale path key such as \"fr\" or \"fr-ca\""),
  z
    .object({
      path: z
        .string()
        .regex(
          LOCALE_PATH_KEY_PATTERN,
          "must be a lowercase locale path key such as \"fr\" or \"fr-ca\"",
        ),
      /** An explicit standards-facing tag (`fr-FR`), overriding the derived one. */
      canonical: z.string().min(1, "must not be empty").optional(),
      label: z.string().min(1, "must not be empty").optional(),
    })
    .strict(),
]);

const siteConfigEntrySchema = z
  .object({
    code: z.string().superRefine((value, ctx) => {
      const issue = siteCodeIssue(value);
      if (issue !== null) ctx.addIssue({ code: "custom", message: issue });
    }),
    label: z.string().min(1, "must not be empty").optional(),
    locales: z.array(siteLocaleEntrySchema).min(1, "must list at least one locale").optional(),
    defaultLocale: z
      .string()
      .regex(LOCALE_PATH_KEY_PATTERN, "must be one of this site's locale path keys (lowercase)")
      .optional(),
    fallback: z.boolean().optional(),
    /**
     * LOC1/LOC2 — THIS SITE'S OPTIONAL LOCATION-SELECTION POLICY.
     *
     * STRUCTURAL TYPING ONLY. This leaf says "a block of this shape may be authored here" and nothing
     * more: the ONE SHAPE rule (`mode === "required"`, a non-empty `default`, and — LOC2 — a
     * `localeDefaults` object of non-empty entries) belongs to the ONE authority,
     * `@/core/location-selection` (`locationSelectionIssue`), and is applied below — so the message an
     * author sees is the message the resolver gives. The CROSS-REFERENCE rules (the default must be a
     * configured Location of THIS Site's own inventory with a usable landing destination, and each LOC2
     * refinement must be a locale THIS Site serves whose Location has a landing IN THAT EXACT locale) are
     * applied by the same module in the file-level refinement.
     *
     * The refinement KEYS are typed with the ONE locale authority (`LOCALE_PATH_KEY_PATTERN`), never a
     * second locale parser; whether the Site actually serves that locale is a cross-reference rule, not a
     * shape rule, and lives in the module with the rest of them.
     *
     * ABSENT is a first-class state: a Site that declares no policy keeps the established optional
     * behaviour exactly, and a policy without `localeDefaults` keeps the LOC1 behaviour exactly, so no
     * existing configuration becomes required-Location and none needs migrating.
     */
    locationSelection: z
      .object({
        mode: z.string().optional(),
        default: z.string().optional(),
        localeDefaults: z
          .record(
            z
              .string()
              .regex(
                LOCALE_PATH_KEY_PATTERN,
                "must be a lowercase locale path key such as \"fr\" or \"fr-ca\"",
              ),
            z.string().min(1, "must name a Location of this site"),
          )
          .optional(),
      })
      .strict()
      .superRefine((value, ctx) => {
        const issue = locationSelectionIssue(value);
        if (issue !== null) ctx.addIssue({ code: "custom", message: issue });
      })
      .optional(),
    /**
     * S3B — THE HUB THIS SITE BELONGS TO (optional).
     *
     * STRUCTURAL TYPING ONLY. This leaf says "a string may be authored here" and nothing more: every
     * SEMANTIC rule about Hub identity — a blank or whitespace-only id, the reserved `implicit` id,
     * and the all-or-none rule for explicit membership — belongs to the ONE authority, `@/core/spoke`
     * (`hubMembershipIssues`), and is applied below through the ONE config-layer seam
     * (`./hub-membership`). No such rule is restated here, so the schema and the pure domain cannot
     * drift apart.
     *
     * An authored ownership relationship only: a Hub has no URL segment, no hostname, no filesystem
     * path and no asset namespace, so this leaf is an opaque identity and never a location.
     */
    hub: z.string().optional(),
    /**
     * S1E2 — THIS SITE'S PAGE-FACING OVERRIDES.
     *
     * A site owns an independent page tree, so the concerns that point INTO that tree may differ
     * per site. Each leaf below is validated by the SAME schema as its shared counterpart, and an
     * absent leaf simply inherits the shared value (`navigation`, `footerNavigation`, `legal`,
     * `connect` at the top level) — a present leaf REPLACES it wholesale, which is what lets
     * Canada and France expose genuinely different navigation over one shared configuration file.
     *
     * Nothing is duplicated: design/theme (`ui`), assets, contact details, feature flags and the
     * deployment's identity stay SHARED, and a site entry never restates them.
     */
    navigation: z
      .array(navigationItemSchema)
      .min(1, "must list at least one item")
      .optional(),
    footerNavigation: footerNavigationSchema.optional(),
    legal: z.array(legalEntrySchema).optional(),
    connect: connectConfigSchema.optional(),
    /**
     * S1E3 — this site's PAGE DESTINATION for the shell CTA. Presentation (label, style, state)
     * stays shared in `ui.cta`; only the destination may differ per site, because a destination is
     * a page in THAT site's tree. An internal destination is resolved inside the active site+locale
     * like every other navigation href.
     */
    ctaHref: z
      .string()
      .min(1, "must not be empty")
      .refine((href) => href.startsWith("/") || /^[a-z]+:/i.test(href), {
        message: "must be an internal path (starting with /) or an absolute URL including protocol",
      })
      .optional(),
  })
  .strict();

export const siteConfigFileSchema = z
  .object({
    site: siteSettingsSchema,
    i18n: i18nConfigSchema,
  /**
   * S1 — the deployment's sites, in configuration order. Absent/empty → ONE implicit site
   * `ww` (the Worldwide site), so a deployment that never thinks about sites keeps a working
   * configuration at `/<code>/<locale>/…` URLs.
   */
  sites: z.array(siteConfigEntrySchema).optional(),
  contact: contactConfigSchema,
  socialLinks: z.array(socialLinkSchema),
  navigation: z.array(navigationItemSchema),
  business: businessSchema.optional(),
  features: featuresConfigSchema.optional(),
  /** Phase M — configurable connection modes exposed on the Connect page. */
  connect: connectConfigSchema.optional(),
  /**
   * Optional legal documents (Phase D). Each entry must have canonical content
   * under `content/legal/<defaultLocale>/<slug>.md` to be exposed; content
   * alone never exposes a route.
   */
  legal: z.array(legalEntrySchema).optional(),
  /**
   * Optional SECONDARY / footer navigation group — a distinct navigation
   * concern from `navigation[]`, `connect.methods`, `socialLinks` and `legal`.
   * Absent → no footer group is rendered (every existing site is unaffected).
   */
  footerNavigation: footerNavigationSchema.optional(),
  /**
   * R1 — the OPTIONAL SITE-WIDE NOTICE this Spoke presents to every visitor on every page (generic shell
   * chrome). Absent → no notice, no markup and no attribute, so every existing installation is unchanged.
   * A Spoke that enables it must resolve its localized copy for every locale it serves; that requirement is
   * enforced where the dictionaries are loaded (`@/config/runtime-dictionaries`).
   */
  siteNotice: siteNoticeSchema.optional(),
  /**
   * UI system configuration (UI-01). Optional, intent-level contract
   * namespace; see ARCHITECTURE.md — UI System Architecture & Configuration
   * Contract. Validated here, consumed from UI-02 onwards; an absent block
   * changes nothing at runtime.
   */
  ui: uiConfigSchema.optional(),
})
  .superRefine((file, ctx) => {
    // S1 — site coherence is checked by the SAME core resolver the runtime uses
    // (`@/core/site`), so configuration validation and resolution cannot disagree: one
    // implementation, one set of messages.
    const locales = file.i18n.locales.map((locale) => locale.code);
    let sites: SiteSet | null = null;
    try {
      sites = resolveSites({
        input: file.sites,
        defaultLocale: file.i18n.defaultLocale,
        locales,
      });
    } catch (error) {
      if (error instanceof SiteConfigurationError) {
        for (const issue of error.issues) {
          ctx.addIssue({ code: "custom", path: ["sites"], message: issue });
        }
      } else {
        throw error;
      }
    }

    if (sites === null) return;

    // S3B — Hub membership. The authored `sites[].hub` leaves are read through the ONE config-layer
    // seam (`./hub-membership`), which also feeds the loader, so validation and normalization cannot
    // disagree. Every rule is the accepted pure mechanism's: no hub anywhere → one implicit Hub (so
    // an existing configuration is untouched); ANY hub → EVERY Site must declare one; a blank id and
    // the reserved `implicit` id are refused.
    for (const issue of hubMembershipIssuesForAuthoredSites(sites.sites, file.sites)) {
      ctx.addIssue({ code: "custom", path: ["sites"], message: issue });
    }

    // Regional bindings (locations) belong to ONE site's page tree: a binding must name a
    // declared site that actually serves the binding's locale, so a regional page can never
    // resolve inside another site's tree.
    const bindings = file.business?.pages ?? [];
    bindings.forEach((binding, index) => {
      const site = sites.sites.find((entry) => entry.code === (binding.site ?? sites.defaultSite.code));
      if (site === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["business", "pages", index, "site"],
          message: `unknown site "${binding.site}" (declare it in "sites")`,
        });
        return;
      }
      if (!site.locales.some((locale) => locale.path === binding.locale)) {
        ctx.addIssue({
          code: "custom",
          path: ["business", "pages", index, "locale"],
          message:
            `site "${site.code}" does not serve locale "${binding.locale}" ` +
            `(it serves: ${site.locales.map((locale) => locale.path).join(", ")})`,
        });
      }
    });

    // LOC1 — A REQUIRED LOCATION POLICY MUST BE HONOURABLE. The default must be an operating Location
    // configured in `business.regions`, must belong to THIS Site's own Location inventory, and must have
    // a usable landing destination in this Site; a Site that binds no Location at all cannot require one.
    // The rules are `@/core/location-selection`'s (the same functions the loader asserts with), applied
    // to the SAME normalized bindings the runtime resolves with — never a restated copy, and never a
    // runtime 404: an unhonourable policy is refused here, at configuration/build time.
    const normalizedBindings = normalizePageRegionBindings(
      file.business?.pages,
      sites.defaultSite.code,
    );
    for (const issue of locationSelectionIssues({
      sites: sites.sites,
      regions: file.business?.regions ?? {},
      bindings: normalizedBindings,
    })) {
      const index =
        file.sites?.findIndex((entry) => normalizeSiteCode(entry.code) === issue.siteCode) ?? -1;
      ctx.addIssue({
        code: "custom",
        path: index >= 0 ? ["sites", index, "locationSelection"] : ["sites"],
        message: issue.message,
      });
    }
  });