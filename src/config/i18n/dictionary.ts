import { z } from "zod";

/**
 * Zod schema for a single locale's user-facing interface strings.
 *
 * The schema is the source of truth; `Dictionary` is derived from it via
 * `z.infer`, so a component-visible type can never drift from the runtime
 * validator. Each locale's JSON under `config/i18n/<locale>.json` is
 * validated against this at module load, so a malformed or incomplete
 * translation fails the build (or tests) with actionable errors.
 *
 * The schema establishes shape and required keys only. It does NOT attempt
 * to judge translation quality — native-speaker review is a separate concern.
 */
export const dictionarySchema = z.object({
  /** Localized home-page hero copy shown above the fold. */
  home: z.object({
    tagline: z.string(),
    description: z.string(),
  }),
  sections: z.object({
    about: z.string(),
    contact: z.string(),
    connect: z.string(),
    navigate: z.string(),
  }),
  navigation: z.object({
    primaryLabel: z.string(),
    footerLabel: z.string(),
    /** Localized navigation-item labels keyed by href (`"/"`, `"/about"`, …). */
    items: z.record(z.string(), z.string()),
    /** UI-05 — label for the adaptive bottom-bar "More" drawer trigger. */
    moreMenu: z.string(),
    /**
     * P6-1 — the ONE sidebar-disclosure vocabulary on every breakpoint. The
     * rail toggle (desktop/tablet), the mobile drawer/overlay trigger and its
     * close control all say the same thing: `showSidebar` when the disclosure
     * is closed ("Show Sidebar" — the action), `hideSidebar` when open
     * ("Hide Sidebar"). These are also the localized fallbacks for the P5-5
     * `ui.navigation.sidebar.open/close.text` configuration leaves.
     */
    showSidebar: z.string(),
    hideSidebar: z.string(),
  }),
  notFound: z.object({
    title: z.string(),
    message: z.string(),
    returnHome: z.string(),
  }),
  /** Error-boundary recovery strings (Phase E). */
  error: z.object({
    title: z.string(),
    message: z.string(),
    tryAgain: z.string(),
    returnHome: z.string(),
  }),
  /** Accessible label for the locale selector. */
  language: z.object({
    label: z.string(),
  }),
  /** Accessible label for the location (region) selector (Phase L). */
  location: z.object({
    label: z.string(),
    /**
     * Phase M — explicit label for the unspecified/default location option in
     * the Location selector (never a bare "Location" that could read like a
     * real configured location).
     */
    unspecified: z.string(),
  }),
  /**
   * Phase M — Connect page strings (configurable connection modes). The page
   * is a template demonstration of connection options; `demoNotice` and
   * `demoBadge` make that explicit to a visitor. `methods` are localized
   * label overrides keyed by method id (`connect.methods[].id`); absent → the
   * configured `method.label` is used. Proper nouns (WhatsApp, Telegram,
   * Viber) typically need no override.
   */
  connect: z.object({
    heading: z.string(),
    demoNotice: z.string(),
    demoBadge: z.string(),
    methods: z.record(z.string(), z.string()).optional(),
  }),
  /** Business-profile labels (open/closed/hours display). */
  business: z.object({
    open: z.string(),
    closed: z.string(),
    noHours: z.string(),
    hoursLabel: z.string(),
    /**
     * Phase M refinement — label for the time zone shown inside the Business
     * Hours heading (`"Time Zone"` / `"Fuseau horaire"` / …). The heading is
     * presented as one contextual unit: `hoursLabel` + timezone display.
     */
    hoursTimeZoneLabel: z.string(),
  }),
  /** Generic accessibility UI strings. */
  a11y: z.object({
    skipToContent: z.string(),
  }),
  /** Contact form strings (Phase B). */
  contact: z.object({
    heading: z.string(),
    nameLabel: z.string(),
    emailLabel: z.string(),
    subjectLabel: z.string(),
    messageLabel: z.string(),
    submit: z.string(),
    sending: z.string(),
    honeypotLabel: z.string(),
    success: z.string(),
    demoNotice: z.string(),
    unconfigured: z.string(),
    configError: z.string(),
    sendError: z.string(),
    errors: z.object({
      name: z.string(),
      email: z.string(),
      subject: z.string(),
      message: z.string(),
    }),
  }),
  /** Offerings catalog strings (Phase C). */
  offerings: z.object({
    heading: z.string(),
    emptyState: z.string(),
    backToOfferings: z.string(),
    /** Phase C — featured badge label on offering cards/detail. */
    featured: z.string(),
    /** Phase C — "What's included" section heading on the detail page. */
    deliverables: z.string(),
    /** Phase C — FAQ section heading on the detail page. */
    faq: z.string(),
    /** Phase C — default label for `intent: "external"` offering actions. */
    externalCta: z.string(),
    /** Template demonstration disclaimer title. */
    disclaimerTitle: z.string(),
    /** Template demonstration disclaimer body. */
    disclaimerBody: z.string(),
    /** Template demonstration currency notice. */
    currencyNotice: z.string(),
  }),
  /**
   * Booking action strings (Phase H). OPTIONAL: the booking capability is a
   * config-driven feature (`features.booking`), and a localized label is only
   * needed where the feature is enabled. Its absence merely means no booking
   * CTA renders — it is never a required section or a proxy for enablement.
   */
  booking: z
    .object({
      book: z.string(),
    })
    .optional(),
  /** Legal documents strings (Phase D). */
  legal: z.object({
    heading: z.string(),
    /** Footer-of-page note that legal docs are template placeholders. */
    disclaimer: z.string(),
    /** Localized footer labels keyed by legal slug. */
    labels: z.record(z.string(), z.string()),
  }),
  /**
   * Testimonials chrome (Phase T). OPTIONAL: only required when
   * `features.testimonials` is enabled (enforced by an F1-style lock at module
   * load). `ratingAria` is a template with a `{rating}` placeholder.
   */
  testimonials: z
    .object({
      heading: z.string(),
      emptyState: z.string(),
      featured: z.string(),
      ratingAria: z.string(),
    })
    .optional(),
  /**
   * Portfolio / case-studies chrome (Phase T). OPTIONAL: only required when
   * `features.portfolio` is enabled.
   */
  portfolio: z
    .object({
      heading: z.string(),
      emptyState: z.string(),
      featured: z.string(),
      tags: z.string(),
      backToPortfolio: z.string(),
    })
    .optional(),
  /**
   * Blog chrome (Phase T). OPTIONAL: only required when `features.blog` is
   * enabled. `readingTime` is a template with a `{count}` placeholder.
   */
  blog: z
    .object({
      heading: z.string(),
      emptyState: z.string(),
      backToBlog: z.string(),
      readingTime: z.string(),
      rss: z.string(),
    })
    .optional(),
});

export type Dictionary = z.infer<typeof dictionarySchema>;
export type DictionaryType = typeof dictionarySchema;