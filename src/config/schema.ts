import { z } from "zod";

import { isCalendarDate } from "@/core/region";
import { isIanaTimeZone } from "@/core/business-hours";
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
  TABLET_NAVIGATION_PATTERNS,
  THEME_MODES,
  THEME_RADII,
  UI_DENSITIES,
} from "@/core/ui";

/**
 * Schema contract for `site.config.json`.
 *
 * The JSON file is edited by humans and downstream clones; this schema is
 * what makes a bad edit fail fast at build time with an actionable
 * message instead of producing a broken site.
 */

const localeCodePattern = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const localeCode = z
  .string()
  .regex(
    localeCodePattern,
    "must be a BCP 47-style locale code such as 'en' or 'pt-BR'",
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
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase slug")
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

/** Safe slug for a legal document (must match a `content/legal/` file). */
const legalSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const legalEntrySchema = z.object({
  slug: z
    .string()
    .regex(legalSlugPattern, "must be a lowercase slug, e.g. 'privacy' or 'terms-of-service'"),
  label: z.string().min(1, "must not be empty"),
});

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
  /**
   * Offerings catalog (Phase C). Boolean flag: when `true` the `/offerings`
   * routes are enabled and exposed (and included in the sitemap). Controlled
   * independently of `navigation[]` and of the presence of content.
   */
  offerings: z.boolean().optional(),
  /**
   * Testimonials collection (Phase T). Boolean flag: when `true` the
   * `/testimonials` listing route is enabled and exposed (and included in the
   * sitemap). Content existence is `content/testimonials/`; discoverability is
   * `navigation[]` — the same triple separation as offerings.
   */
  testimonials: z.boolean().optional(),
  /**
   * Portfolio / case studies collection (Phase T). When `true`, `/portfolio`
   * listing + `/portfolio/[slug]` detail routes are enabled and sitemapped.
   */
  portfolio: z.boolean().optional(),
  /**
   * Filesystem blog (Phase T). When `true`, `/blog` + `/blog/[slug]` detail +
   * per-locale static `/blog/rss.xml` are enabled. Draft posts (frontmatter
   * `draft: true`) are excluded from routes, sitemap, and RSS.
   */
  blog: z.boolean().optional(),
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
    cta: uiCtaSchema.optional(),
    theme: uiThemeSchema.optional(),
  })
  .strict();

export const siteConfigFileSchema = z.object({
  site: siteSettingsSchema,
  i18n: i18nConfigSchema,
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
   * UI system configuration (UI-01). Optional, intent-level contract
   * namespace; see ARCHITECTURE.md — UI System Architecture & Configuration
   * Contract. Validated here, consumed from UI-02 onwards; an absent block
   * changes nothing at runtime.
   */
  ui: uiConfigSchema.optional(),
});