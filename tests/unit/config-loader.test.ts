import { describe, expect, it } from "vitest";

import { parseSiteConfig } from "@/config/loader";

const validConfig = {
  site: {
    url: "https://example.com",
    name: "Example",
    tagline: "An example site",
    description: "A site used for testing.",
  },
  i18n: {
    defaultLocale: "en",
    locales: [{ code: "en", label: "English" }],
  },
  contact: {
    email: "hello@example.com",
  },
  socialLinks: [{ platform: "github", label: "GitHub", href: "https://github.com/example" }],
  navigation: [{ label: "Home", href: "/" }],
};

describe("parseSiteConfig", () => {
  it("parses a valid configuration into the flattened site config", () => {
    const config = parseSiteConfig(validConfig);

    expect(config.url).toBe("https://example.com");
    expect(config.defaultLocale).toBe("en");
    expect(config.analytics).toBeUndefined();
  });

  it("maps optional features through", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { analytics: { provider: "vercel" } },
    });

    expect(config.analytics).toEqual({ provider: "vercel" });
  });

  it("accepts an explicit analytics provider none as the intentional off state", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { analytics: { provider: "none" } },
    });

    expect(config.analytics).toEqual({ provider: "none" });
  });

  it("maps the Phase T content feature flags through (testimonials/portfolio/blog)", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { testimonials: true, portfolio: true, blog: true },
    });

    expect(config.testimonialsFeature).toBe(true);
    expect(config.portfolioFeature).toBe(true);
    expect(config.blogFeature).toBe(true);
  });

  it("treats absent Phase T feature flags as disabled", () => {
    const config = parseSiteConfig(validConfig);

    expect(config.testimonialsFeature).toBeUndefined();
    expect(config.portfolioFeature).toBeUndefined();
    expect(config.blogFeature).toBeUndefined();
  });

  it("accepts empty contact details", () => {
    const config = parseSiteConfig({ ...validConfig, contact: {} });

    expect(config.contact).toEqual({});
  });

  it("accepts an omitted site.logo (optional) and maps it when present", () => {
    expect(parseSiteConfig(validConfig).logo).toBeUndefined();

    const config = parseSiteConfig({
      ...validConfig,
      site: { ...validConfig.site, logo: "https://example.com/logo.png" },
    });
    expect(config.logo).toBe("https://example.com/logo.png");
  });

  it("rejects an invalid site.logo URL", () => {
    const invalid = {
      ...validConfig,
      site: { ...validConfig.site, logo: "not-a-url" },
    };
    expect(() => parseSiteConfig(invalid)).toThrow(/logo/);
  });

  it("rejects a defaultLocale that is not among the locales", () => {
    const invalid = {
      ...validConfig,
      i18n: {
        defaultLocale: "fr",
        locales: [{ code: "en", label: "English" }],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/defaultLocale/);
  });

  it("normalizes legacy top-level contact into the business contact (back-compat bridge)", () => {
    const config = parseSiteConfig({
      ...validConfig,
      contact: { email: "old@example.com", phone: "555" },
    });

    expect(config.business.name).toBe("Example"); // derived from site.name
    expect(config.business.contact).toEqual({ email: "old@example.com", phone: "555" });
    expect(config.business.locations).toEqual([]);
  });

  it("uses the business block as the canonical source when present", () => {
    const config = parseSiteConfig({
      ...validConfig,
      contact: { email: "legacy@example.com" },
      business: {
        timezone: "Asia/Jakarta",
        type: "LocalBusiness",
        locations: [
          {
            id: "main",
            name: "HQ",
            address: { street: "1 Main St", city: "Jakarta" },
            timezone: "Asia/Makassar",
            hours: {
              intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
              exceptional: [],
            },
          },
        ],
      },
    });

    expect(config.business.type).toBe("LocalBusiness");
    expect(config.business.timezone).toBe("Asia/Jakarta");
    // business.contact wins over legacy contact
    expect(config.business.contact).toEqual({ email: "legacy@example.com" });
    // locations are canonical
    expect(config.business.locations).toHaveLength(1);
    expect(config.business.locations[0].name).toBe("HQ");
    expect(config.business.locations[0].timezone).toBe("Asia/Makassar");
    expect(config.business.locations[0].hours?.intervals[0].open).toBe("09:00");
    // identity falls back to site.* when not overridden
    expect(config.business.name).toBe("Example");
  });

  it("maps optional per-locale location overrides through the loader", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta", country: "Indonesia" },
            phone: "+62 21 0000 0000",
            geo: { lat: -6.2, lng: 106.816 },
            locales: {
              de: {
                address: { city: "Berlin" },
                phone: "+49 30 0000 0000",
                geo: { lat: 52.52, lng: 13.405 },
              },
            },
          },
        ],
      },
    });

    const location = config.business.locations[0];
    expect(location.locales).toEqual({
      de: {
        address: { city: "Berlin" },
        phone: "+49 30 0000 0000",
        geo: { lat: 52.52, lng: 13.405 },
      },
    });
  });

  it("accepts a location without locales (back-compat: field stays undefined)", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        locations: [
          { id: "main", address: { street: "1 Main St", city: "Jakarta" } },
        ],
      },
    });

    expect(config.business.locations[0].locales).toBeUndefined();
  });

  it("rejects a non-locale-code key in business.locations[].locales", () => {
    const invalid = {
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            locales: { "not a locale": { address: { city: "Berlin" } } },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/locale|must be a BCP 47-style locale code/);
  });

  it("rejects an invalid override shape (bad geo latitude)", () => {
    const invalid = {
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            locales: { de: { geo: { lat: 999, lng: 13 } } },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow();
  });

  it("rejects an empty override address field value", () => {
    const invalid = {
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            locales: { de: { address: { city: "" } } },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow();
  });

  it("rejects invalid business hours (open === close)", () => {
    const invalid = {
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            hours: { intervals: [{ days: ["mon"], open: "09:00", close: "09:00" }], exceptional: [] },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/open and close must differ/);
  });

  it("rejects malformed urls with actionable messages", () => {
    const invalid = {
      ...validConfig,
      site: { ...validConfig.site, url: "not-a-url" },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/site\.url/);
  });

  it("rejects trailing slashes on the site url", () => {
    const invalid = {
      ...validConfig,
      site: { ...validConfig.site, url: "https://example.com/" },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/trailing slash/);
  });

  it("rejects unknown analytics providers", () => {
    const invalid = {
      ...validConfig,
      features: { analytics: { provider: "unknown" } },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(
      /features\.analytics\.provider/,
    );
  });

  it("rejects an invalid IANA timezone with an actionable error", () => {
    const invalid = {
      ...validConfig,
      business: { timezone: "Asia/Jakartp" },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/IANA timezone/);
  });

  it("rejects an invalid IANA timezone on a location", () => {
    const invalid = {
      ...validConfig,
      business: {
        locations: [
          {
            id: "x",
            address: { street: "1 Main St", city: "Jakarta" },
            timezone: "Nowhere/Zone",
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/IANA timezone/);
  });

  it("accepts a valid IANA timezone", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: { timezone: "America/New_York" },
    });

    expect(config.business.timezone).toBe("America/New_York");
  });

  it("accepts overnight exceptional hours (close < open)", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        timezone: "Asia/Jakarta",
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            hours: {
              intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
              exceptional: [{ date: "2026-12-31", open: "22:00", close: "02:00" }],
            },
          },
        ],
      },
    });

    expect(config.business.locations[0].hours?.exceptional[0]).toMatchObject({
      date: "2026-12-31",
      open: "22:00",
      close: "02:00",
    });
  });

  it("rejects an exceptional-hours entry that has only `open`", () => {
    const invalid = {
      ...validConfig,
      business: {
        timezone: "Asia/Jakarta",
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            hours: {
              intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
              exceptional: [{ date: "2026-12-31", open: "09:00" }],
            },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/closed: true or provide both open and close/);
  });

  it("rejects an exceptional-hours entry that has only `close`", () => {
    const invalid = {
      ...validConfig,
      business: {
        timezone: "Asia/Jakarta",
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            hours: {
              intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
              exceptional: [{ date: "2026-12-31", close: "17:00" }],
            },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/closed: true or provide both open and close/);
  });

  it("accepts an exceptional-hours closure (`closed: true`)", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        timezone: "Asia/Jakarta",
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            hours: {
              intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
              exceptional: [{ date: "2026-12-25", closed: true }],
            },
          },
        ],
      },
    });

    expect(config.business.locations[0].hours?.exceptional[0]).toMatchObject({
      date: "2026-12-25",
      closed: true,
    });
  });

  it("accepts a non-default locale as the configured default (config-driven change)", () => {
    // Changing the default locale is a configuration change taken straight
    // from `site.config.json`; no platform code or test assumes locale "en".
    const config = parseSiteConfig({
      ...validConfig,
      i18n: {
        defaultLocale: "fr",
        locales: [
          { code: "fr", label: "Français" },
          { code: "en", label: "English" },
        ],
      },
    });

    expect(config.defaultLocale).toBe("fr");
    expect(config.locales.map((l) => l.code)).toEqual(["fr", "en"]);
  });

  it("maps features.contact stub through to the site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { contact: { provider: "stub" } },
    });

    expect(config.contactFeature).toEqual({ provider: "stub" });
  });

  it("maps features.contact webhook with fields through to the site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { contact: { provider: "webhook", fields: { subject: false } } },
    });

    expect(config.contactFeature).toEqual({
      provider: "webhook",
      fields: { subject: false },
    });
  });

  it("leaves contactFeature undefined when features.contact is absent (back-compat)", () => {
    const config = parseSiteConfig(validConfig);
    expect(config.contactFeature).toBeUndefined();
  });

  it("rejects an unknown contact provider", () => {
    const invalid = {
      ...validConfig,
      features: { contact: { provider: "mailto" } },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/provider/);
  });

  it("maps features.offerings true/false through to the site config", () => {
    const enabled = parseSiteConfig({
      ...validConfig,
      features: { offerings: true },
    });
    expect(enabled.offeringsFeature).toBe(true);

    const disabled = parseSiteConfig({
      ...validConfig,
      features: { offerings: false },
    });
    expect(disabled.offeringsFeature).toBe(false);
  });

  it("leaves offeringsFeature undefined when absent (back-compat)", () => {
    const config = parseSiteConfig(validConfig);
    expect(config.offeringsFeature).toBeUndefined();
  });

  it("rejects a non-boolean offerings value", () => {
    const invalid = {
      ...validConfig,
      features: { offerings: "yes" },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/offerings/);
  });

  it("maps the legal block through to the site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      legal: [
        { slug: "privacy", label: "Privacy Policy" },
        { slug: "terms", label: "Terms of Service" },
      ],
    });

    expect(config.legal).toEqual([
      { slug: "privacy", label: "Privacy Policy" },
      { slug: "terms", label: "Terms of Service" },
    ]);
  });

  it("leaves legal undefined when absent (back-compat)", () => {
    const config = parseSiteConfig(validConfig);
    expect(config.legal).toBeUndefined();
  });

  it("accepts an empty legal array", () => {
    const config = parseSiteConfig({ ...validConfig, legal: [] });
    expect(config.legal).toEqual([]);
  });

  it("rejects a legal entry with an unsafe slug", () => {
    const invalid = {
      ...validConfig,
      legal: [{ slug: "../privacy", label: "Privacy" }],
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/slug/);
  });

  it("rejects a legal entry with an empty label", () => {
    const invalid = {
      ...validConfig,
      legal: [{ slug: "privacy", label: "" }],
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/label/);
  });

  it("maps features.maps through to the site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { maps: { provider: "google" } },
    });

    expect(config.mapsFeature).toEqual({ provider: "google" });
  });

  it("leaves mapsFeature undefined when features.maps is absent (back-compat)", () => {
    const config = parseSiteConfig(validConfig);
    expect(config.mapsFeature).toBeUndefined();
  });

  it("rejects an unknown maps provider", () => {
    const invalid = {
      ...validConfig,
      features: { maps: { provider: "apple" } },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/maps\.provider/);
  });

  it("maps features.booking through to the site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { booking: { provider: "external-url", url: "https://example.com/book" } },
    });

    expect(config.bookingFeature).toEqual({
      provider: "external-url",
      url: "https://example.com/book",
    });
  });

  it("leaves bookingFeature undefined when features.booking is absent (back-compat)", () => {
    const config = parseSiteConfig(validConfig);
    expect(config.bookingFeature).toBeUndefined();
  });

  it("rejects features.booking with provider external-url and no url", () => {
    const invalid = {
      ...validConfig,
      features: { booking: { provider: "external-url" } },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/booking\.url/);
  });

  it("rejects features.booking with a non-URL destination", () => {
    const invalid = {
      ...validConfig,
      features: { booking: { provider: "external-url", url: "not-a-url" } },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/booking\.url/);
  });
});

describe("business contact + address identity (Phase I)", () => {
  it("maps per-locale business contact overrides through to the normalized contact", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        contact: {
          email: "global@example.com",
          locales: {
            de: { phone: "+49 30 0000 0000" },
            fr: { email: "bonjour@example.fr" },
          },
        },
        locations: [{ id: "main", address: { street: "1 St", city: "Berlin" } }],
      },
    });

    expect(config.business.contact.email).toBe("global@example.com");
    expect(config.business.contact.locales?.de?.phone).toBe("+49 30 0000 0000");
    expect(config.business.contact.locales?.fr?.email).toBe("bonjour@example.fr");
  });

  it("maps addressInternational and addressMode through the location", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "東京都港区芝公園4丁目2-8", city: "港区", country: "日本" },
            addressInternational: { street: "4-2-8 Shibakoen", city: "Tokyo", country: "Japan" },
            addressMode: "local-international",
          },
        ],
      },
    });

    expect(config.business.locations[0].addressMode).toBe("local-international");
    expect(config.business.locations[0].addressInternational?.street).toBe("4-2-8 Shibakoen");
  });

  it("rejects a local-international mode without an international address", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        business: {
          locations: [
            {
              id: "main",
              address: { street: "1 St", city: "City" },
              addressMode: "local-international",
            },
          ],
        },
      }),
    ).toThrow(/local-international/);
  });

  it("rejects a locale override requesting local-international with no international address", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        i18n: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English" },
            { code: "ja", label: "日本語" },
          ],
        },
        business: {
          locations: [
            {
              id: "main",
              address: { street: "1 St", city: "City" },
              locales: { ja: { addressMode: "local-international" } },
            },
          ],
        },
      }),
    ).toThrow(/locale "ja"/);
  });

  it("accepts a local-international locale override that inherits a base international address", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        i18n: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English" },
            { code: "ja", label: "日本語" },
          ],
        },
        business: {
          locations: [
            {
              id: "main",
              address: { street: "1 St", city: "City" },
              addressInternational: { street: "Latin St", city: "City" },
              locales: { ja: { addressMode: "local-international" } },
            },
          ],
        },
      }),
    ).not.toThrow();
  });
});

describe("Phase L — region configuration validation", () => {
  const regionBase = {
    timezone: "America/Toronto",
    address: { street: "1 Demo St", city: "Toronto", country: "Canada" },
    hours: { monday: [{ open: "09:00", close: "17:00" }] },
  };

  const regionConfig = {
    ...validConfig,
    business: {
      regions: {
        toronto: regionBase,
        vancouver: {
          timezone: "America/Vancouver",
          address: { street: "2 Demo Ave", city: "Vancouver", country: "Canada" },
          hours: {},
        },
      },
      pages: [
        { locale: "en", region: "toronto" },
        { locale: "en", region: "vancouver" },
      ],
    },
  };

  it("parses a valid regions + pages configuration (landing bindings)", () => {
    const config = parseSiteConfig(regionConfig);
    expect(Object.keys(config.regions)).toEqual(["toronto", "vancouver"]);
    expect(config.regions.toronto.timezone).toBe("America/Toronto");
    expect(config.regions.toronto.hours.monday[0].open).toBe("09:00");
    expect(config.pageBindings).toEqual([
      { locale: "en", region: "toronto", slug: null },
      { locale: "en", region: "vancouver", slug: null },
    ]);
    expect(config.business.locations).toEqual([]); // legacy path untouched
  });

  it("maps region labels through the loader", () => {
    const config = parseSiteConfig({
      ...regionConfig,
      business: {
        regions: { toronto: { ...regionBase, label: "Toronto" } },
        pages: [{ locale: "en", region: "toronto" }],
      },
    });
    expect(config.regions.toronto.label).toBe("Toronto");
  });

  it("migrates the Phase K binding form (slug === region) to a landing", () => {
    const config = parseSiteConfig({
      ...regionConfig,
      business: {
        regions: regionConfig.business.regions,
        pages: [{ locale: "en", slug: "toronto", region: "toronto" }],
      },
    });
    expect(config.pageBindings).toEqual([{ locale: "en", region: "toronto", slug: null }]);
  });

  it("keeps a regional page binding where slug differs from the region", () => {
    const config = parseSiteConfig({
      ...regionConfig,
      business: {
        regions: regionConfig.business.regions,
        pages: [
          { locale: "en", region: "toronto" },
          { locale: "en", region: "toronto", slug: "about" },
        ],
      },
    });
    expect(config.pageBindings).toEqual([
      { locale: "en", region: "toronto", slug: null },
      { locale: "en", region: "toronto", slug: "about" },
    ]);
  });

  it("rejects an invalid IANA timezone in a region", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: {
          regions: { toronto: { ...regionBase, timezone: "Not/AZone" } },
        },
      }),
    ).toThrow(/timezone/i);
  });

  it("rejects an unknown day key in a region schedule", () => {
    const bad = {
      ...regionBase,
      hours: { funday: [{ open: "09:00", close: "17:00" }] },
    };
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: { toronto: bad } },
      }),
    ).toThrow();
  });

  it("rejects an invalid interval time format", () => {
    const bad = {
      ...regionBase,
      hours: { monday: [{ open: "9am", close: "17:00" }] },
    };
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: { toronto: bad } },
      }),
    ).toThrow(/HH:mm/);
  });

  it("rejects an open === close interval (24h ambiguity)", () => {
    const bad = {
      ...regionBase,
      hours: { monday: [{ open: "09:00", close: "09:00" }] },
    };
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: { toronto: bad } },
      }),
    ).toThrow(/open and close must differ/);
  });

  it("rejects a holiday with a missing name", () => {
    const bad = {
      ...regionBase,
      hours: { monday: [], holidays: [{ date: "2026-12-25", closed: true }] },
    };
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: { toronto: bad } },
      }),
    ).toThrow(/name/);
  });

  it("rejects a holiday with an invalid date", () => {
    const bad = {
      ...regionBase,
      hours: { monday: [], holidays: [{ date: "2026-02-30", name: "X", closed: true }] },
    };
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: { toronto: bad } },
      }),
    ).toThrow(/real calendar date/);
  });

  it("rejects a page binding referencing a missing region", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: regionConfig.business.regions, pages: [{ locale: "en", region: "nope" }] },
      }),
    ).toThrow(/unknown region/);
  });

  it("rejects duplicate page bindings for the same (locale, region, slug)", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: {
          regions: regionConfig.business.regions,
          pages: [
            { locale: "en", region: "toronto" },
            { locale: "en", region: "toronto" },
          ],
        },
      }),
    ).toThrow(/Duplicate page/);
  });

  it("rejects region pages without a landing entry for the (locale, region)", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: {
          regions: regionConfig.business.regions,
          pages: [{ locale: "en", region: "toronto", slug: "about" }],
        },
      }),
    ).toThrow(/landing/);
  });

  it("rejects a region id reserved for a static route", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: {
          regions: { about: { ...regionBase, timezone: "America/Toronto" } },
          pages: [{ locale: "en", region: "about" }],
        },
      }),
    ).toThrow(/reserved/);
  });

  it("rejects page bindings without a regions block", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        business: { pages: [{ locale: "en", region: "toronto" }] },
      }),
    ).toThrow(/regions/);
  });

  it("accepts a region without pages (regional mode with no regional pages yet)", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: regionConfig.business.regions },
      }),
    ).not.toThrow();
  });
});

describe("Phase M — connect config + region defaultLocale", () => {
  const connectConfig = {
    methods: [
      { id: "message", label: "Message Us", href: "/contact" },
      { id: "email", label: "Email", href: "mailto:hello@example.com", demoOnly: true },
      { id: "whatsapp", label: "WhatsApp", href: "https://wa.me/15550100", demoOnly: true },
      { id: "viber", label: "Viber", href: "viber://chat?number=%2B15550100", demoOnly: true },
    ],
  };

  it("parses the connect methods and passes them through the loader", () => {
    const config = parseSiteConfig({ ...validConfig, connect: connectConfig });
    expect(config.connect?.methods).toHaveLength(4);
    expect(config.connect?.methods[1].demoOnly).toBe(true);
    expect(config.connect?.methods?.map((m) => m.id)).toEqual([
      "message",
      "email",
      "whatsapp",
      "viber",
    ]);
    // Viber is demo-only/configuration-only with its URI preserved.
    expect(config.connect?.methods?.[3]).toMatchObject({
      id: "viber",
      href: "viber://chat?number=%2B15550100",
      demoOnly: true,
    });
    // The message action is named "Message Us" (route stays /contact).
    expect(config.connect?.methods?.[0].label).toBe("Message Us");
    expect(config.connect?.methods?.[0].href).toBe("/contact");
  });

  it("rejects a connect block without any methods", () => {
    expect(() => parseSiteConfig({ ...validConfig, connect: { methods: [] } })).toThrow(
      /at least one connection method/,
    );
  });

  it("rejects duplicate connect method ids", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        connect: {
          methods: [
            { id: "x", label: "X", href: "mailto:a@b.c" },
            { id: "x", label: "X2", href: "mailto:d@e.f" },
          ],
        },
      }),
    ).toThrow(/unique/);
  });

  it("rejects a connect href that is neither internal nor a deep link", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        connect: { methods: [{ id: "x", label: "X", href: "not-a-href" }] },
      }),
    ).toThrow(/internal route/);
  });

  it("passes a region's explicit defaultLocale through the loader", () => {
    const config = parseSiteConfig({
      ...regionConfigData(),
      business: {
        regions: {
          toronto: { ...regionBaseData(), label: "Toronto", defaultLocale: "fr" },
        },
        pages: [
          { locale: "en", region: "toronto" },
          { locale: "fr", region: "toronto" },
        ],
      },
    });
    expect(config.regions.toronto.defaultLocale).toBe("fr");
  });

  it("rejects a region defaultLocale that is not a configured locale", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfigData(),
        business: {
          regions: { toronto: { ...regionBaseData(), defaultLocale: "zz" } },
          pages: [{ locale: "en", region: "toronto" }],
        },
      }),
    ).toThrow(/not a configured locale/);
  });

  it("rejects a region defaultLocale that is not bound to the region", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfigData(),
        business: {
          regions: { toronto: { ...regionBaseData(), defaultLocale: "fr" } },
          pages: [{ locale: "en", region: "toronto" }],
        },
      }),
    ).toThrow(/not among the locales bound/);
  });

  it("accepts a region without an explicit defaultLocale", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfigData(),
        business: {
          regions: { toronto: { ...regionBaseData() } },
          pages: [{ locale: "en", region: "toronto" }],
        },
      }),
    ).not.toThrow();
  });

  it("passes through each locale's explicit englishLabel", () => {
    const config = parseSiteConfig({
      ...validConfig,
      i18n: {
        defaultLocale: "en",
        locales: [
          { code: "en", label: "English", englishLabel: "English" },
          { code: "fr", label: "Français", englishLabel: "French" },
        ],
      },
    });
    expect(config.locales[0].englishLabel).toBe("English");
    expect(config.locales[1].englishLabel).toBe("French");
  });

  it("passes through a region's localized display labels", () => {
    const config = parseSiteConfig({
      ...regionConfigData(),
      business: {
        regions: {
          tokyo: {
            ...regionBaseData(),
            timezone: "Asia/Tokyo",
            label: "Tokyo",
            labels: { ja: "東京" },
          },
        },
        pages: [{ locale: "en", region: "tokyo" }],
      },
    });
    expect(config.regions.tokyo.label).toBe("Tokyo");
    expect(config.regions.tokyo.labels).toEqual({ ja: "東京" });
  });

  it("rejects a non-locale key in a region's localized labels", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfigData(),
        business: {
          regions: {
            tokyo: { ...regionBaseData(), labels: { notALocale: "x" } },
          },
          pages: [{ locale: "en", region: "tokyo" }],
        },
      }),
    ).toThrow(/Invalid key in record/);
  });
});

describe("UI-01 — the ui contract namespace", () => {
  it("maps the ui namespace through the flattened site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      ui: { preset: "classic", density: "comfortable" },
    });
    expect(config.ui).toEqual({ preset: "classic", density: "comfortable" });
  });

  it("leaves ui undefined when absent", () => {
    expect(parseSiteConfig(validConfig).ui).toBeUndefined();
  });

  it("accepts an empty ui block without a preset", () => {
    const config = parseSiteConfig({ ...validConfig, ui: {} });
    expect(config.ui).toEqual({});
    expect(config.ui?.preset).toBeUndefined();
  });

  it("maps site.assets through the loader (FS-4)", () => {
    const assets = {
      logo: "https://example.com/assets/logo-header.svg",
      ogImage: "https://example.com/assets/og-image.png",
      favicon: "https://example.com/assets/favicon.svg",
    };
    const config = parseSiteConfig({ ...validConfig, site: { ...validConfig.site, assets } });
    expect(config.assets).toEqual(assets);
  });

  it("maps the P6-3B logoFooter/banners roles through the loader (FS-4 extension)", () => {
    const assets = {
      logoFooter: "https://example.com/assets/logo-footer.svg",
      banners: { home: "https://example.com/assets/banner-home.jpg" },
    };
    const config = parseSiteConfig({ ...validConfig, site: { ...validConfig.site, assets } });
    expect(config.assets).toEqual(assets);
  });

  it("rejects a non-URL site.assets value (FS-4)", () => {
    expect(() =>
      parseSiteConfig({ ...validConfig, site: { ...validConfig.site, assets: { logo: "not-a-url" } } }),
    ).toThrow(/logo/);
  });

  it("accepts a valid ui.theme.background hex (FS-5)", () => {
    const config = parseSiteConfig({
      ...validConfig,
      ui: { theme: { mode: "system", radius: "medium", background: "#fafafa" } },
    });
    expect(config.ui?.theme?.background).toBe("#fafafa");
  });

  it("rejects a non-hex ui.theme.background (FS-5)", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        ui: { theme: { background: "background: url(...)" } },
      }),
    ).toThrow(/hex/);
  });

  it("rejects a 4-digit hex ui.theme.background (FS-5)", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        ui: { theme: { background: "#12345" } },
      }),
    ).toThrow(/hex/);
  });

  it("rejects an unknown preset value with the full expected list", () => {
    expect(() =>
      parseSiteConfig({ ...validConfig, ui: { preset: "glamorous" } }),
    ).toThrow(/classic, adaptive, focus, workspace, immersive/);
  });

  it("has NO preset-comparison / preset-selection config surface (feature retired)", () => {
    // Owner decision (2026-09): the Foundation no longer exposes or supports
    // selectable presets, so the deployment-comparison map was REMOVED from the
    // schema entirely — an unknown key is a hard error, not a silent no-op.
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        ui: { presetComparison: { adaptive: "https://foundation.example.com" } },
      }),
    ).toThrow(/presetComparison/);
  });

  it("rejects an unknown ui key (config typo)", () => {
    expect(() =>
      parseSiteConfig({ ...validConfig, ui: { presets: "classic" } }),
    ).toThrow(/presets/);
  });
});

function regionBaseData(): Record<string, unknown> {
  return {
    timezone: "America/Toronto",
    address: { street: "1 Demo St", city: "Toronto", country: "Canada" },
    hours: { monday: [{ open: "09:00", close: "17:00" }] },
  };
}

function regionConfigData(): Record<string, unknown> {
  return {
    ...validConfig,
    i18n: {
      defaultLocale: "en",
      locales: [
        { code: "en", label: "English" },
        { code: "fr", label: "Français" },
      ],
    },
    business: {
      regions: {
        toronto: regionBaseData(),
        vancouver: {
          timezone: "America/Vancouver",
          address: { street: "2 Demo Ave", city: "Vancouver", country: "Canada" },
          hours: {},
        },
      },
      pages: [
        { locale: "en", region: "toronto" },
        { locale: "en", region: "vancouver" },
      ],
    },
  };
}