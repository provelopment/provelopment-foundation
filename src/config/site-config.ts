import type { Business } from "@/core/business";
import type { ContactFeatureConfig } from "@/core/contact-inquiry";
import type { LegalConfigEntry } from "@/core/legal";
import type { AuthoredSiteNotice } from "@/core/notice";
import type { AuthoredLocationSelection } from "@/core/location-selection";
import type { OperationalRegion, PageRegionBinding } from "@/core/region";
import type { ResolvedSite } from "@/core/site";
import type { Hub } from "@/core/spoke";
import type {
  ContentWidth,
  CtaAction,
  CtaState,
  CtaStyle,
  DesktopNavigationPattern,
  IconPosition,
  MenuMode,
  MobileNavigationPattern,
  NavRegion,
  ShellLayout,
  ShellVariant,
  TabletNavigationPattern,
  ThemeMode,
  ThemeRadius,
  UiDensity,
} from "@/core/ui";

export interface LocaleConfig {
  /** BCP 47-style code such as `en` or `nl`. */
  readonly code: string;
  /** Human-readable name of the locale (native form), for language switchers. */
  readonly label: string;
  /**
   * Phase M refinement — canonical English name of the language. The Language
   * selector shows `label` followed by `englishLabel` in brackets when they
   * differ (`Français (French)`); never `English (English)`.
   */
  readonly englishLabel?: string;
  /**
   * R1B — the SITE's own words for this locale (see `localeConfigSchema`): the
   * description this locale's root page advertises when no page-level summary
   * exists. Absent → the deployment's `site.description`.
   */
  readonly description?: string;
}

export interface SocialLink {
  /** Free-form platform identity (deployment data; never an engine concept). */
  readonly platform: string;
  readonly label: string;
  readonly href: string;
  /**
   * CONNECTIVITY ICON SEAM — optional supplementary icon/mark asset (plain
   * `public/assets/` filename). One generic leaf for every platform: the engine
   * never names WhatsApp/Telegram/LinkedIn/etc., it only resolves "an optional
   * asset belongs to this connectivity item". Decorative only — `label`/`href`
   * stay authoritative and the link renders as text with or without artwork.
   */
  readonly icon?: string;
}

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  /** P5-5 — optional navigation-item icon (plain `public/assets/` filename). */
  readonly icon?: string;
  /**
   * P6-3B — optional EXPANDED-state sidebar item icon (plain `public/assets/`
   * filename). Falls back to `icon`, then the shipped default dot.
   */
  readonly iconOpen?: string;
  /**
   * P6-3B — optional COLLAPSED-state sidebar item icon (plain `public/assets/`
   * filename). Falls back to `icon`, then the shipped default plus.
   */
  readonly iconClosed?: string;
  /** P5-5 — sidebar region group (`top` | `middle` | `bottom`; default `middle`). */
  readonly position?: NavRegion;
  /** P5-5 — semantically disabled state (`aria-disabled`, not navigable). */
  readonly disabled?: boolean;
}

/** Phase M — a single connection mode exposed on the Connect page. */
export interface ConnectMethod {
  /** Stable slug id (unique within `connect.methods`). */
  readonly id: string;
  /** Adopter-provided human label, e.g. "WhatsApp". */
  readonly label: string;
  /** Internal route (`/contact`) or absolute deep link (`mailto:`, `tel:`, `https:`…). */
  readonly href: string;
  /**
   * CONNECTIVITY ICON SEAM — the SAME generic optional icon leaf as
   * `SocialLink.icon` (one seam serving both connectivity families). Plain
   * `public/assets/` filename; supplementary and decorative only, so the method
   * stays a complete text link when no artwork is configured.
   */
  readonly icon?: string;
  /** Marks template demonstration entries with a visible badge. */
  readonly demoOnly?: boolean;
}

/** Phase M — the Connect page's configurable connection inventory. */
export interface ConnectConfig {
  readonly methods: readonly ConnectMethod[];
}

/**
 * The OPTIONAL secondary / footer navigation group.
 *
 * A distinct navigation concern from the primary `navigation`, from
 * `connect.methods` (connection methods), from `socialLinks` (profile
 * destinations) and from `legal` (policy documents). It lets a site surface
 * contextual footer destinations — Home, How It Works, About, Help, the source
 * repository — without misrepresenting them as contact methods.
 *
 * It never affects the primary navigation, never creates a route, never drives
 * sitemap discovery, and its heading is never a link.
 */
export interface FooterNavGroup {
  /** The group heading. Optional, plain text, never a link. */
  readonly heading?: string;
  /** The group's links, rendered in configuration order. */
  readonly items: readonly NavigationItem[];
}

export interface ContactConfig {
  readonly email?: string;
  readonly phone?: string;
}

export interface AnalyticsConfig {
  readonly provider: "vercel" | "none";
}

/** `features.maps` — a keyless directions-deep-link provider. */
export interface MapsConfig {
  readonly provider: "google" | "none";
}

/** `features.booking` — a static external booking action. */
export interface BookingConfig {
  readonly provider: "external-url" | "none";
  readonly url?: string;
}

/**
 * UI system configuration (UI-01 — Architecture & Contract).
 *
 * Intent-level configuration namespace (roadmap §11): values describe the
 * desired UX personality, never pixels. The block is OPTIONAL — an absent
 * `ui` key (or an empty object) is valid and changes nothing at the CONTRACT
 * surface. The RESOLVED values are the Foundation canonical defaults
 * (`FOUNDATION_UI_DEFAULTS` in `@/core/ui`) unless a leaf is explicitly set
 * here; there is exactly ONE canonical presentation and no selection key.
 */
export interface UiConfig {
  /** Page-frame intent (roadmap §11 `shell`). */
  readonly shell?: UiShellConfig;
  /** Per-viewport navigation composition overrides (defaults define the rest). */
  readonly navigation?: UiNavigationConfig;
  /** Semantic UI density (roadmap §16). */
  readonly density?: UiDensity;
  /** Content area width intent (roadmap §17). */
  readonly content?: UiContentConfig;
  /** Primary CTA intent (roadmap §19). */
  readonly cta?: UiCtaConfig;
  /**
   * Visual theme intent — kept separate from the layout composition (roadmap §18).
   */
  readonly theme?: UiThemeConfig;
  /**
   * N2 — the optional visitor-selectable shell layout presentation. Enabling it lets
   * a visitor choose between the configured default layout and the platform's other
   * layout; `navigation.desktop`/`tablet` then come from the layouts, so configuring
   * them as well is refused by the schema.
   */
  readonly layoutSwitcher?: UiLayoutSwitcherConfig;
}

/**
 * S1 — one declared SITE (`sites[]`). Optional block: a deployment that declares none has
 * exactly ONE site (`main`) at its own URLs, using the deployment's default locale and
 * every declared locale.
 */
export interface SiteConfigEntry {
  /** The site id: the folder name under each authoring root, and never a URL by itself. */
  readonly id: string;
  /** Human label for a site selector. Absent → the id. */
  readonly label?: string;
  /** Public path prefix: `""` (the default site) or one lowercase slug segment. */
  readonly pathPrefix?: string;
  /** The site's default locale. Absent → the deployment's default locale. */
  readonly defaultLocale?: string;
  /** The locales this site serves, in order. Absent → every declared locale. */
  readonly locales?: readonly string[];
  /** Whether this site's default locale may answer its other locales. Absent → `true`. */
  readonly fallback?: boolean;
  /**
   * LOC1/LOC2 — this Site's OPTIONAL Location-selection policy:
   * `{ "mode": "required", "default": "<location id>", "localeDefaults"?: { "<locale>": "<location id>" } }`.
   *
   * Absent → the established optional behaviour: the Location control keeps its explicit unspecified
   * option, non-regional routes stay valid, and nothing needs migrating. When present, the Site has no
   * visitor-facing unspecified state and its non-regional public paths are completed into the
   * effective default Location — the site-wide `default`, or (LOC2) the adopter's explicit refinement for
   * the request's own locale when it authored one. Both are adopter decisions and neither is inferred;
   * `localeDefaults` is consulted only while completing a request that names no Location yet, so once a
   * Location is in the URL the URL wins.
   */
  readonly locationSelection?: AuthoredLocationSelection;
}

/** N2 — the shell layout presentation switcher (`ui.layoutSwitcher`). */
export interface UiLayoutSwitcherConfig {
  /** Whether a visitor may switch layouts (`false`/absent → one fixed composition). */
  readonly enabled?: boolean;
  /** The layout the site starts in (and the only one when the switcher is off). */
  readonly default?: ShellLayout;
}

export interface UiShellConfig {
  readonly header?: ShellVariant;
  readonly footer?: ShellVariant;
  /** P0-1 — whether the composed aside rail is user-collapsible. */
  readonly sidebar?: { readonly collapsible?: boolean };
}

export interface UiNavigationConfig {
  readonly desktop?: DesktopNavigationPattern;
  readonly tablet?: TabletNavigationPattern;
  readonly mobile?: MobileNavigationPattern;
  /** P5-5 — sidebar presentation intent (mode + open/close disclosure content). */
  readonly sidebar?: UiSidebarConfig;
  /** P5-5 — ≥md top-navigation menu presentation mode. */
  readonly top?: { readonly mode?: MenuMode };
  /** P5-5 — mobile bottom-navigation menu presentation mode. */
  readonly bottom?: { readonly mode?: MenuMode };
}

/** P5-5 — one icon+text disclosure control (sidebar open/close). */
export interface UiSidebarControlConfig {
  /** Plain public/assets icon filename, or `""` for no icon. */
  readonly icon?: string;
  /** Visible text; `""` = icon-only. Missing = localized fallback label. */
  readonly text?: string;
}

/** P5-5 — sidebar presentation intent. */
export interface UiSidebarConfig {
  readonly mode?: MenuMode;
  readonly open?: UiSidebarControlConfig;
  readonly close?: UiSidebarControlConfig;
}

export interface UiContentConfig {
  readonly width?: ContentWidth;
}

export interface UiCtaConfig {
  /** Whether a primary CTA should be composed. */
  readonly enabled?: boolean;
  /** Semantic business action (roadmap §19). */
  readonly action?: CtaAction;
  /**
   * Adopter-provided visible label. P5-5: `""` (or a missing label with an
   * icon) = icon-only CTA; the accessible name then comes from `action`.
   */
  readonly label?: string;
  /**
   * Adopter-owned CTA destination (UI-07 D1). Optional; the Foundation never
   * infers one from `action`. An enabled CTA without label+href renders nothing.
   */
  readonly href?: string;
  /** Visual prominence of the primary CTA (roadmap §11). */
  readonly style?: CtaStyle;
  /** P5-5 — optional CTA icon (plain public/assets filename; `""` = none). */
  readonly icon?: string;
  /** P5-5 — icon placement within the CTA (`start` leading, `end` trailing). */
  readonly iconPosition?: IconPosition;
  /** P5-5 — semantic CTA state (`default` | `disabled`). */
  readonly state?: CtaState;
}

export interface UiThemeConfig {
  /** Light/dark/system; `system` follows the OS color-scheme preference. */
  readonly mode?: ThemeMode;
  /** Semantic corner-radius intent (aligns with the `--radius-*` tokens). */
  readonly radius?: ThemeRadius;
  /** FS-5 — adopter-owned page/background hex color (overrides `--background`). */
  readonly background?: string;
}

/**
 * P6-2C/P6-3B — generic branding asset roles. `logo`/`favicon` have real
 * consumers (JSON-LD + rendered header mark, browser tab icon);
 * `logoFooter` is composed into the footer; `banners` is the per-page banner
 * record (P6-3B, replacing the former `logoTitle` concept).
 * `sidebar-open`/`sidebar-close` are NOT part of this block (separate
 * plain-filename icon-asset contract, `src/config/assets.ts`).
 */
export interface SiteAssetsConfig {
  /** Brand logo (absolute URL); JSON-LD + the rendered header mark. The `logo-header` role. */
  readonly logo?: string;
  /** Open Graph / social image (absolute URL); absent → per-locale generated route. */
  readonly ogImage?: string;
  /** Browser favicon / icon (absolute URL). The `favicon` role. */
  readonly favicon?: string;
  /** The `logo-footer` role (absolute URL); composed into the footer. */
  readonly logoFooter?: string;
  /**
   * FOUNDATION-UI-R1F — the optional `logo-compact` role (absolute URL): the COMPACT header artwork the
   * browser selects BY VIEWPORT WIDTH below 600 CSS pixels, while `logo` is selected at and above it. A
   * HEADER-PRESENTATION ALTERNATIVE only — `logo` stays the authority for structured data — and valid only
   * beside a configured primary logo (the schema refuses it otherwise). Absent → the primary logo at every
   * width, which is the state of every existing deployment.
   */
  readonly logoCompact?: string;
  /**
   * P6-3B — the `banner-*` role (absolute URL), keyed by PAGE SLUG
   * (`""`/`"home"` = home; `"about"` = About; …). A page with no entry renders
   * no banner.
   */
  readonly banners?: Readonly<Record<string, string>>;
  /**
   * P12-BG — the `background-*` role (absolute URL), keyed by PAGE ROLE. The
   * reserved key `"all"` is the GLOBAL background; any other key (`"home"`,
   * `"about"`, …) is that page family's PAGE-SPECIFIC background. Resolution is
   * `background-<page>` → `background-all` → none. A DECORATIVE layer only: it
   * never replaces the flat `ui.theme.background` colour.
   */
  readonly backgrounds?: Readonly<Record<string, string>>;
  /**
   * P12-FG — the `footer-graphic` role (absolute URL): ONE optional global
   * DECORATIVE footer graphic / watermark, layered behind the footer content.
   * Separate from `logoFooter` (the footer identity mark). Absent → no
   * decorative layer.
   */
  readonly footerGraphic?: string;
  /**
   * P12-HG — the `header-graphic` role (absolute URL): ONE optional global
   * DECORATIVE header band / structural graphic layer, painted as the header's
   * OWN background so it stays behind the header's logo, navigation, switchers
   * and mobile trigger. Separate from `logo` (the header identity mark) and
   * from `banners` (the PAGE-SPECIFIC region above the shell). Absent → no
   * decorative band.
   */
  readonly headerGraphic?: string;
  /**
   * P12-SG — the `status-graphic` role (absolute URL): ONE optional global
   * DECORATIVE graphic for the status surfaces (`error` and `not-found`), which
   * share one status frame and therefore one role. Rendered above the status
   * heading; never semantic and never a replacement for the heading.
   * Absent → no graphic.
   */
  readonly statusGraphic?: string;
}

/**
 * S1E2 — THE PAGE-FACING CONCERNS ONE SITE MAY OVERRIDE.
 *
 * Each leaf points INTO a page tree (navigation destinations, footer group, legal documents, the
 * Connect page's connection inventory), so it is the part of the configuration that legitimately
 * varies per site — while theme, assets, identity, contact details and feature flags stay shared.
 * An absent leaf inherits the deployment's shared value; a present leaf REPLACES it wholesale
 * (there is no per-item merge: an independent page inventory differs as a whole, and a merge would
 * make removing a shared entry impossible).
 */
export interface SitePageOverrides {
  readonly navigation?: readonly NavigationItem[] | undefined;
  readonly footerNavigation?: FooterNavGroup | undefined;
  readonly legal?: readonly LegalConfigEntry[] | undefined;
  readonly connect?: ConnectConfig | undefined;
  /**
   * S1E3 — the shell CTA's page destination for THIS site. Presentation stays shared (`ui.cta`);
   * only the destination — a page in this site's own tree — may differ.
   */
  readonly ctaHref?: string | undefined;
}

export interface SiteConfig {
  /** Absolute origin of the deployed site, used for SEO (sitemap, canonical URLs). */
  readonly url: string;
  /**
   * S1 — the deployment's RESOLVED sites, in configuration order, and the default site (the one
   * `/` negotiates to). A deployment with no `sites` block resolves to exactly ONE site: the
   * Worldwide site `ww`.
   */
  readonly sites: readonly ResolvedSite[];
  readonly defaultSite: ResolvedSite;
  /**
   * S3B — the Spoke's Hubs: the partition/ownership view of the SAME resolved Sites above.
   *
   * `hubs[*].sites` holds the very `ResolvedSite` OBJECTS `sites` holds — nothing is re-resolved and
   * nothing is cloned — so `sites` stays the complete Spoke-wide population, `defaultSite` stays the
   * one Spoke-wide default, and this adds only WHICH HUB owns which Site. No Hub has a public
   * address, a filesystem path, a dictionary layer or an asset namespace.
   *
   * A deployment that authors no `sites[].hub` keeps one implicit Hub holding every Site, which is
   * today's behaviour; consumer code need not read this yet.
   */
  readonly hubs: readonly Hub[];
  /**
   * S1E2 — page-facing overrides per site CODE (`navigation`, `footerNavigation`, `legal`,
   * `connect`). A code that is absent serves the SHARED values below; a leaf that is absent on a
   * present entry is inherited. Read through `effectiveSitePageConfig` (see
   * `@/config/site-page-config`), never by hand.
   */
  readonly sitePageOverrides: Readonly<Record<string, SitePageOverrides>>;
  /**
   * The deployment's default locale — the dictionary fallback and the locale the deployment
   * root negotiates to. Each SITE has its own default locale (`sites[].defaultLocale`).
   */
  readonly defaultLocale: string;
  /** Supported locales, in preferred order. */
  readonly locales: readonly LocaleConfig[];
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  /** Optional brand logo (absolute URL) for structured data (Phase S). */
  readonly logo?: string;
  /** FS-4 — canonical visual asset configuration (favicon/logo/OG image). */
  readonly assets?: SiteAssetsConfig;
  readonly contact: ContactConfig;
  readonly socialLinks: readonly SocialLink[];
  readonly navigation: readonly NavigationItem[];
  /**
   * Optional SECONDARY / footer navigation group — a distinct navigation
   * concern from the primary `navigation`, from `connect.methods`, from
   * `socialLinks` and from `legal`. Absent → no footer group is rendered.
   */
  readonly footerNavigation?: FooterNavGroup;
  /** Phase M — configuration-driven connection modes for the Connect page. */
  readonly connect?: ConnectConfig;
  /**
   * UI system configuration (UI-01). Intent-level contract namespace
   * (roadmap §11); validated by `uiConfigSchema`. Not consumed by rendering
   * until UI-02+; see ARCHITECTURE.md — UI System Architecture.
   */
  readonly ui?: UiConfig;
  /** Normalized business profile (from `business` block or legacy contact). */
  readonly business: Business;
  /**
   * Phase K operating regions, keyed by region id. Empty when the legacy
   * (global `business`/`locations`) model is in use. When non-empty, regional
   * pages resolve their operational identity from a region — never merged with
   * global business defaults.
   */
  readonly regions: Readonly<Record<string, OperationalRegion>>;
  /** Page inventory entries `(site, locale, region, slug?)`; empty when none. */
  readonly pageBindings: readonly PageRegionBinding[];
  /** Optional functionality flags; each is consumed by its own adapter. */
  readonly analytics?: AnalyticsConfig;
  /** Maps directions provider configuration (`features.maps`). */
  readonly mapsFeature?: MapsConfig;
  /** Booking action provider configuration (`features.booking`). */
  readonly bookingFeature?: BookingConfig;
  /** Contact inquiry provider configuration (`features.contact`). */
  readonly contactFeature?: ContactFeatureConfig;
  /**
   * Optional legal documents surfaced in the footer. Each entry's slug names a PAGE
   * (`content/pages/.../legal/<slug>.md`), so configuration decides exposure while
   * the page decides existence.
   */
  readonly legal?: readonly LegalConfigEntry[];
  /**
   * R1 — the OPTIONAL site-wide notice this Spoke presents to every visitor on every page (generic shell
   * chrome). Threaded as AUTHORED (`siteNoticeSchema`): the ONE pure resolver (`resolveSiteNotice`,
   * `@/core/notice`) decides whether a notice is presented, in what tone, and whether it REPLACES the
   * page-level introductory demonstration notices — so the shell, the page chrome and the build-time copy lock
   * cannot disagree about what "shown" or "replaces" means.
   */
  readonly siteNotice?: AuthoredSiteNotice;
}