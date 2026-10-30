import { describe, expect, it } from "vitest";

import { validateEfsManifest } from "@/config/efs/manifest";
import { resolveProperties, type PropertyOwner } from "@/core/efs/properties";
import { publicScheduleInputs, type EfsOpeningSchedule } from "@/core/efs/opening-schedule";

const schedule: EfsOpeningSchedule = {
  intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
};

function chain(overrides: Partial<Record<"entity" | "facet" | "site" | "page" | "representation", Record<string, unknown>>>): PropertyOwner[] {
  const base = { entity: "e_00000000000000000000000000", facet: "f", site: "s", page: "p", representation: "en" };
  return (["entity", "facet", "site", "page", "representation"] as const).map((level) => ({
    level,
    id: base[level],
    properties: overrides[level] as PropertyOwner["properties"],
  }));
}

describe("EFS typed properties — one cascade, five levels, no new resolver", () => {
  it("can be declared independently at each of the five levels", () => {
    for (const level of ["entity", "facet", "site", "page", "representation"] as const) {
      const effective = resolveProperties(chain({ [level]: { timezone: { value: "Europe/Berlin", public: true } } }));
      const entry = effective.get("timezone");
      expect(entry?.value, level).toBe("Europe/Berlin");
      expect(entry?.originLevel, level).toBe(level);
      // An intermediate declaration is inherited, not re-declared.
      expect(entry?.state, level).toBe(level === "representation" ? "declared" : "inherited");
    }
  });

  it("takes the nearest explicit atomic key, per key, without touching others", () => {
    const effective = resolveProperties(
      chain({
        entity: {
          timezone: { value: "Europe/Berlin", public: true },
          openingSchedule: { value: schedule, public: true },
        },
        page: { timezone: { value: "America/New_York", public: true } },
      }),
    );
    // Nearest wins for `timezone`; `openingSchedule` still comes from the Entity.
    expect(effective.get("timezone")?.value).toBe("America/New_York");
    expect(effective.get("timezone")?.originLevel).toBe("page");
    expect(effective.get("openingSchedule")?.value).toEqual(schedule);
    expect(effective.get("openingSchedule")?.originLevel).toBe("entity");
    // ...and the pair is complete, so a status may be asserted.
    expect(publicScheduleInputs(effective)?.timeZone).toBe("America/New_York");
  });

  it("suppresses with explicit null, which also cancels the public assertion", () => {
    const effective = resolveProperties(
      chain({
        entity: {
          timezone: { value: "Europe/Berlin", public: true },
          openingSchedule: { value: schedule, public: true },
        },
        representation: { timezone: null },
      }),
    );
    expect(effective.get("timezone")?.state).toBe("suppressed");
    expect(effective.get("timezone")?.value).toBeUndefined();
    expect(publicScheduleInputs(effective)).toBeNull();
  });

  it("replaces a composite schedule atomically rather than merging it", () => {
    const narrower: EfsOpeningSchedule = { intervals: [{ days: ["sat"], open: "10:00", close: "12:00" }] };
    const effective = resolveProperties(
      chain({
        entity: { openingSchedule: { value: schedule, public: true } },
        site: { openingSchedule: { value: narrower, public: true } },
      }),
    );
    expect(effective.get("openingSchedule")?.value).toEqual(narrower);
  });

  it("keeps a private declaration out of public projection even when inherited", () => {
    const effective = resolveProperties(
      chain({
        entity: {
          timezone: { value: "Europe/Berlin", public: true },
          openingSchedule: { value: schedule },
        },
      }),
    );
    expect(effective.publicEntries().map((entry) => entry.key)).toContain("timezone");
    expect(effective.publicEntries().map((entry) => entry.key)).not.toContain("openingSchedule");
    expect(publicScheduleInputs(effective)).toBeNull();
  });
});

describe("EFS place and timezone are independent optional facts", () => {
  const combinations: Array<[string, Record<string, unknown>]> = [
    ["neither place nor timezone", {}],
    ["place without timezone", { place: { value: "Riverside", public: true } }],
    ["timezone without place", { timezone: { value: "Europe/Berlin", public: true } }],
    [
      "both, independently authored",
      { place: { value: "Riverside", public: true }, timezone: { value: "Europe/Berlin", public: true } },
    ],
  ];

  for (const [label, properties] of combinations) {
    it(`resolves cleanly: ${label}`, () => {
      const effective = resolveProperties(chain({ entity: properties }));
      expect(effective.get("timezone")?.state).toBe(properties.timezone ? "inherited" : undefined);
      expect(effective.get("place")?.state).toBe(properties.place ? "inherited" : undefined);
      // Neither fact manufactures the other, and neither creates a status without a schedule.
      expect(publicScheduleInputs(effective)).toBeNull();
      if (!properties.timezone) expect(effective.get("timezone")).toBeUndefined();
      if (!properties.place) expect(effective.get("place")).toBeUndefined();
    });
  }

  it("never derives one from the other", () => {
    const placeOnly = resolveProperties(chain({ entity: { place: { value: "Berlin", public: true } } }));
    expect(placeOnly.get("timezone")).toBeUndefined();

    const zoneOnly = resolveProperties(
      chain({ entity: { timezone: { value: "Europe/Berlin", public: true } } }),
    );
    expect(zoneOnly.get("place")).toBeUndefined();
  });
});

const entityId = "e_00000000000000000000000000";

/** A minimal valid manifest with one properties bag hung at a chosen level. */
function manifestAt(
  level: "entity" | "facet" | "site" | "page" | "representation",
  properties: Record<string, unknown>,
) {
  const bag = properties;
  const representation = {
    locale: "en",
    ...(level === "representation" ? { properties: bag } : {}),
  };
  const page = {
    id: "home",
    route: ["home"],
    ...(level === "page" ? { properties: bag } : {}),
    representations: [representation],
  };
  return {
    entities: [
      {
        id: entityId,
        ...(level === "entity" ? { properties: bag } : {}),
        facets: [
          {
            id: "acme",
            ...(level === "facet" ? { properties: bag } : {}),
            sites: [
              {
                id: "main",
                ...(level === "site" ? { properties: bag } : {}),
                pages: [page],
              },
            ],
          },
        ],
      },
    ],
    publications: [
      {
        id: "acme",
        spokeId: "acme-spoke",
        entityId,
        facetId: "acme",
        bindings: [
          {
            id: "acme-web",
            host: "www.acme.example",
            prefix: [],
            entityId,
            facetId: "acme",
            siteIds: ["main"],
            siteMode: "closed",
            defaultSiteId: "main",
            locales: ["en"],
            defaultLocale: "en",
            canonical: true,
          },
        ],
      },
    ],
  };
}

describe("EFS typed properties — refused at validation, never at render", () => {
  it("accepts a valid timezone and schedule at every level", () => {
    const valid = {
      timezone: { value: "Europe/Berlin", public: true },
      openingSchedule: { value: schedule, public: true },
    };
    for (const level of ["entity", "facet", "site", "page", "representation"] as const) {
      const result = validateEfsManifest(manifestAt(level, valid));
      expect(result.ok, level).toBe(true);
      expect(result.issues, level).toEqual([]);
    }
  });

  it("refuses an invalid timezone at every level, naming the key", () => {
    for (const level of ["entity", "facet", "site", "page", "representation"] as const) {
      const result = validateEfsManifest(manifestAt(level, { timezone: { value: "Mars/Olympus" } }));
      expect(result.ok, level).toBe(false);
      expect(result.issues.join(" "), level).toMatch(/properties\["timezone"\].*not a recognised IANA/);
    }
  });

  it("refuses offset time zones, which Intl would otherwise resolve", () => {
    const result = validateEfsManifest(manifestAt("site", { timezone: { value: "+01:00" } }));
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/not a recognised IANA/);
  });

  it("refuses a malformed schedule before serving", () => {
    const result = validateEfsManifest(
      manifestAt("page", {
        openingSchedule: { value: { intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }, { days: ["mon"], open: "16:00", close: "18:00" }] } },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/properties\["openingSchedule"\].*overlap/);
  });

  it("does not validate a suppressed key, and leaves an unrelated key alone", () => {
    expect(validateEfsManifest(manifestAt("site", { timezone: null })).ok).toBe(true);
    // `openingHours` is display-only authored information and is NOT validated as a schedule.
    expect(
      validateEfsManifest(manifestAt("site", { openingHours: { value: "Mon-Fri 09:00-17:00" } })).ok,
    ).toBe(true);
  });
});

