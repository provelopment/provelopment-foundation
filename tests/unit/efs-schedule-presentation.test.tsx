import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EfsPageView } from "@/components/efs/efs-page";
import { resolveProperties, type PropertyOwner } from "@/core/efs/properties";

import type { EfsView } from "@/app/[[...segments]]/efs-request";

const entityId = "e_00000000000000000000000000";

const schedule = {
  intervals: [{ days: ["mon", "tue", "wed", "thu", "fri"], open: "09:00", close: "17:00" }],
};

/** The dictionary labels the caller resolves from `dictionary.business`. */
const labels = { hoursLabel: "Business hours", open: "Open", closed: "Closed" };

function viewWith(
  representationProperties: Record<string, unknown> = {},
  entityProperties: Record<string, unknown> = {},
): EfsView {
  const properties = resolveProperties([
    { level: "entity", id: entityId, properties: entityProperties as PropertyOwner["properties"] },
    { level: "facet", id: "acme", properties: {} },
    { level: "site", id: "main", properties: {} },
    { level: "page", id: "about", properties: {} },
    {
      level: "representation",
      id: "en-001",
      properties: representationProperties as PropertyOwner["properties"],
    },
  ]);
  return {
    binding: {
      id: "managed",
      host: "www.acme.example",
      prefix: ["acme"],
      entityId,
      facetId: "acme",
      siteIds: ["main"],
      siteMode: "closed",
      defaultSiteId: "main",
      locales: ["en-001"],
      defaultLocale: "en-001",
      canonical: true,
    },
    entity: { id: entityId, properties: {} },
    facet: { id: "acme", properties: {}, sites: [] },
    site: { id: "main", pages: [] },
    page: { id: "about", route: ["about"], representations: [{ locale: "en-001" }] },
    representation: { locale: "en-001" },
    locale: "en-001",
    localeKey: "en-001",
    source: {
      format: "markdown",
      path: "about.md",
      pageId: "about",
      data: { title: "About" },
      body: "Body",
    },
    properties,
    canonical: "https://www.acme.example/acme/en-001/about",
    alternates: [{ hreflang: "en-001", href: "https://www.acme.example/acme/en-001/about" }],
    navigation: [],
    home: false,
    context: { runtimeSegment: "spoke-foundation", siteConfig: {} },
  } as unknown as EfsView;
}

describe("R02-D — the computed status is localized, truthful and never asserted server-side", () => {
  it("renders the dictionary heading and asserts NO open/closed result during server rendering", () => {
    const html = renderToStaticMarkup(
      <EfsPageView
        view={viewWith({
          openingSchedule: { value: schedule, public: true },
          timezone: { value: "Europe/Berlin", public: true },
        })}
        statusLabels={labels}
      />,
    );
    // The heading is the dictionary's hours label, not a permanently open-sounding phrase.
    expect(html).toContain("Business hours");
    expect(html).not.toContain("Open now");
    // No build-time assertion: neither status word and no status element is emitted on the server.
    expect(html).not.toContain(">Open<");
    expect(html).not.toContain(">Closed<");
    expect(html).not.toContain("data-efs-open");
  });

  it("renders nothing when no dictionary binding was available", () => {
    const html = renderToStaticMarkup(
      <EfsPageView
        view={viewWith({
          openingSchedule: { value: schedule, public: true },
          timezone: { value: "Europe/Berlin", public: true },
        })}
      />,
    );
    expect(html).not.toContain("Business hours");
    expect(html).not.toContain("data-efs-open");
  });

  it("renders nothing when a required input is absent, private or suppressed", () => {
    const cases: Record<string, unknown>[] = [
      { openingSchedule: { value: schedule, public: true } },
      { timezone: { value: "Europe/Berlin", public: true } },
      {
        openingSchedule: { value: schedule, public: false },
        timezone: { value: "Europe/Berlin", public: true },
      },
      { openingSchedule: { value: schedule, public: true }, timezone: null },
      {
        openingSchedule: { value: schedule, public: true },
        timezone: { value: "not-a-zone", public: true },
      },
    ];
    for (const bag of cases) {
      const html = renderToStaticMarkup(
        <EfsPageView view={viewWith(bag)} statusLabels={labels} />,
      );
      expect(html, JSON.stringify(bag)).not.toContain("Business hours");
      expect(html, JSON.stringify(bag)).not.toContain("data-efs-open");
    }
  });

  it("leaves authored display-only openingHours exactly as it was", () => {
    const html = renderToStaticMarkup(
      <EfsPageView
        view={viewWith({ openingHours: { value: "Mon-Fri 09:00-17:00", public: true } })}
        statusLabels={labels}
      />,
    );
    expect(html).toContain("Opening hours");
    expect(html).toContain("Mon-Fri 09:00-17:00");
    // Display-only hours never become a computed status.
    expect(html).not.toContain("data-efs-open");
  });
});
