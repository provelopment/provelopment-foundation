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
     * is closed ("Show navigation" — the action), `hideSidebar` when open
     * ("Hide navigation"). These are also the localized fallbacks for the P5-5
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
  /**
   * S1E2 — accessible label for the SITE selector. A site is a page/configuration context
   * (`Canada`, `France`, `Worldwide`), never a language and never a physical location.
   */
  site: z.object({
    label: z.string(),
  }),
  /**
   * N2 — the shell layout presentation control (Sidebar / Menu bar). The labels name
   * the two layouts; the group label is the control's accessible name.
   */
  layout: z.object({
    label: z.string(),
    sidebar: z.string(),
    menuBar: z.string(),
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
    /**
     * A5 — the authored SIMPLE form's OFFLINE-DEMONSTRATION vocabulary.
     *
     * `demoTitle` / `demoBody` / `demoFictionHint` are shown BEFORE any data is entered, because a visitor must
     * know what the form really does before typing anything into it. `demoAccepted` is the truthful acceptance:
     * the submission reached this server and was discarded — it must never imply delivery or storage.
     */
    demoTitle: z.string().optional(),
    demoBody: z.string().optional(),
    demoFictionHint: z.string().optional(),
    acknowledgementLabel: z.string().optional(),
    acknowledgementError: z.string().optional(),
    submitDemo: z.string().optional(),
    demoAccepted: z.string().optional(),
    ambiguous: z.string().optional(),
    unavailable: z.string().optional(),
    formDisabled: z.string().optional(),
    errors: z.object({
      name: z.string(),
      email: z.string(),
      subject: z.string(),
      message: z.string(),
    }),
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
  /**
   * Legal documents chrome. A legal document is a PAGE (see `@/core/legal`), so this
   * section holds only the footer group's heading and the localized labels keyed by
   * document slug.
   */
  legal: z.object({
    heading: z.string(),
    /** Localized footer labels keyed by legal slug. */
    labels: z.record(z.string(), z.string()),
  }),
  /**
   * R1 — the OPTIONAL site-wide notice copy (`siteNotice` in `site.config.json`). OPTIONAL because the
   * capability is opt-in: a deployment that presents no notice has no such section, and its absence is a
   * valid state rather than a missing translation. A Spoke that ENABLES the notice must resolve BOTH fields
   * for every locale it serves — enforced at build time (`assertSiteNoticeCopyPresent`), so an enabled
   * notice can never render blank.
   */
  siteNotice: z
    .object({
      /** The notice's short leading line. */
      title: z.string(),
      /** The notice's sentence(s). */
      body: z.string(),
    })
    .optional(),
  /**
   * R1 — the ACCESSIBLE NAME of the cross-Spoke switcher control. OPTIONAL for the same reason: only an
   * Installation that authors `spokeSwitcher` in its manifest renders the control, and only then must every
   * served locale be able to name it (enforced at build time, `assertSpokeSwitcherLabelPresent`). The
   * labels a visitor READS are authored per option in the manifest — they name Spokes, so they are not a
   * vocabulary term a locale dictionary could own.
   */
  spokeSwitcher: z
    .object({
      label: z.string(),
    })
    .optional(),
});

export type Dictionary = z.infer<typeof dictionarySchema>;
export type DictionaryType = typeof dictionarySchema;

/**
 * S1E2 — THE SITE+LOCALE OVERRIDE SCHEMA
 * =====================================
 *
 * A site may speak differently from the shared dictionary without forking it:
 *
 *     config/i18n/<locale>.json                    the shared baseline (authoritative base)
 *     config/i18n/sites/<site>/<locale>.json       an OPTIONAL partial override for THAT site
 *
 * The override file mirrors the dictionary's sections, with every leaf optional and every object
 * `strict`, so:
 *
 *  - a key the dictionary does not define is REFUSED (loud, naming the file) instead of being
 *    silently dropped — an override that has drifted from the dictionary is a build error;
 *  - a section the override omits keeps the shared value, and the merged result is re-validated
 *    against the COMPLETE `dictionarySchema`, so an override can never produce a partial
 *    dictionary;
 *  - only that site sees the override: no lookup ever consults another site's file.
 *
 * A record-valued leaf (`navigation.items`, `legal.labels`, `connect.methods`) is replaced
 * wholesale, which is what makes "this site names these slugs differently" expressible without a
 * second merging rule. `FOUNDATION-S1E2` test `i18n-site-overlay.test.ts` asserts this schema stays
 * aligned with `dictionarySchema`, so adding a dictionary key cannot silently miss an override slot.
 */
function optionalLeaves<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).partial().strict();
}

/** A record-valued leaf: labels keyed by href/slug/method id. */
const overrideRecord = z.record(z.string(), z.string());

export const dictionaryOverrideSchema = z
  .object({
    home: optionalLeaves({ tagline: z.string(), description: z.string() }).optional(),
    sections: optionalLeaves({
      about: z.string(),
      contact: z.string(),
      connect: z.string(),
      navigate: z.string(),
    }).optional(),
    navigation: optionalLeaves({
      primaryLabel: z.string(),
      footerLabel: z.string(),
      items: overrideRecord,
      moreMenu: z.string(),
      showSidebar: z.string(),
      hideSidebar: z.string(),
    }).optional(),
    notFound: optionalLeaves({
      title: z.string(),
      message: z.string(),
      returnHome: z.string(),
    }).optional(),
    error: optionalLeaves({
      title: z.string(),
      message: z.string(),
      tryAgain: z.string(),
      returnHome: z.string(),
    }).optional(),
    language: optionalLeaves({ label: z.string() }).optional(),
    site: optionalLeaves({ label: z.string() }).optional(),
    layout: optionalLeaves({
      label: z.string(),
      sidebar: z.string(),
      menuBar: z.string(),
    }).optional(),
    location: optionalLeaves({ label: z.string(), unspecified: z.string() }).optional(),
    connect: optionalLeaves({
      heading: z.string(),
      demoNotice: z.string(),
      demoBadge: z.string(),
      methods: overrideRecord,
    }).optional(),
    business: optionalLeaves({
      open: z.string(),
      closed: z.string(),
      noHours: z.string(),
      hoursLabel: z.string(),
      hoursTimeZoneLabel: z.string(),
    }).optional(),
    a11y: optionalLeaves({ skipToContent: z.string() }).optional(),
    contact: optionalLeaves({
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
      errors: optionalLeaves({
        name: z.string(),
        email: z.string(),
        subject: z.string(),
        message: z.string(),
      }),
    }).optional(),
    booking: optionalLeaves({ book: z.string() }).optional(),
    legal: optionalLeaves({ heading: z.string(), labels: overrideRecord }).optional(),
    /** R1 — the site-wide notice copy and the switcher's accessible name, overridable like any section. */
    siteNotice: optionalLeaves({ title: z.string(), body: z.string() }).optional(),
    spokeSwitcher: optionalLeaves({ label: z.string() }).optional(),
  })
  .strict();

export type DictionaryOverride = z.infer<typeof dictionaryOverrideSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep merge: an object merges key by key, anything else is replaced by the override. */
function mergeValue(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override;

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeValue(base[key], value);
  }
  return merged;
}

/**
 * The EFFECTIVE dictionary of one (site, locale): the shared base with the site's override applied.
 * The result is re-validated by the registry against the complete `dictionarySchema`.
 */
export function mergeDictionaryOverride(
  base: Dictionary,
  override: DictionaryOverride,
): Dictionary {
  return mergeValue(base, override) as Dictionary;
}