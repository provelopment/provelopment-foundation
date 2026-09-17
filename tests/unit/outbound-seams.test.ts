import { describe, expect, it } from "vitest";

import {
  BookingMisconfigurationError,
  createBookingActionResolver,
} from "@/adapters/booking";
import {
  AnalyticsMisconfigurationError,
  createAnalyticsProvider,
} from "@/adapters/analytics";
import {
  ContactInquiryMisconfigurationError,
  createContactInquirySender,
  createStubContactInquirySender,
  createWebhookContactInquirySender,
} from "@/adapters/contact-inquiry";
import {
  createDirectionLinkResolver,
  GOOGLE_MAPS_PROVIDER,
} from "@/adapters/maps";
import { siteConfig } from "@/config";
import type { AnalyticsConfig } from "@/config";
import type { BusinessLocation } from "@/core/business";
import type { ContactInquiry } from "@/core/contact-inquiry";

/**
 * Phase I — the outbound-seam CONTRACT, tested across capabilities.
 *
 * Each seam keeps its own bounded, provider-neutral result vocabulary (booking
 * and maps actions; contact's operation/status domain) rather than a forced
 * shared shape. The invariants asserted here are the common principle:
 *   - a seam exposes a result appropriate to its intent and no adapter
 *     implementation detail;
 *   - explicit off/demo states are honored and never masquerade as delivery;
 *   - a configured-but-unhonorable provider fails loudly with a typed domain
 *     error and never silently falls back;
 *   - a provider never substitutes for another.
 */

const locationFixture: BusinessLocation = {
  id: "demo",
  name: "Demo HQ",
  address: { street: "1 Demo Street", city: "Demo", country: "Canada" },
  geo: { lat: 43.6532, lng: -79.3832 },
};

const validInquiry: ContactInquiry = {
  name: "Jane Doe",
  email: "jane@example.com",
  message: "Hello.",
  locale: "en",
};

function fetchReturning(ok: boolean): typeof fetch {
  return (async () => ({ ok })) as unknown as typeof fetch;
}

function fetchThrowing(error: Error): typeof fetch {
  return (async () => {
    throw error;
  }) as unknown as typeof fetch;
}

/** Explicit seam fixtures — the shipped template declares every provider OFF. */
const BOOKING_FIXTURE = { provider: "external-url", url: "https://booking.example.test/book" } as const;
const MAPS_FIXTURE = { provider: "google" } as const;

describe("outbound seam contract — bounded provider-neutral results (Phase I)", () => {
  it("booking and maps resolve link actions carrying only kind/provider/href", () => {
    const bookingResolver = createBookingActionResolver(BOOKING_FIXTURE);
    const bookingAction = bookingResolver.resolve({ locale: siteConfig.defaultLocale });
    expect(bookingAction.kind).toBe("link");
    expect(Object.keys(bookingAction).sort()).toEqual(["href", "kind", "provider"]);
    expect(bookingAction).toMatchObject({ provider: "external-url" });
    expect(bookingAction).toMatchObject({ href: BOOKING_FIXTURE.url });
  });

  it("a maps link action is bounded to kind/provider/href (adapter builds the URL, result never does)", () => {
    const mapsResolver = createDirectionLinkResolver(MAPS_FIXTURE);
    const directionsAction = mapsResolver.resolve(locationFixture);
    expect(directionsAction.kind).toBe("link");
    // The result is the bounded provider-neutral shape: destination + opaque
    // provider identifier. It never exposes coordinates-as-URL or any query
    // construction detail beyond the resolved href.
    expect(Object.keys(directionsAction).sort()).toEqual(["href", "kind", "provider"]);
    expect(directionsAction).toMatchObject({ provider: GOOGLE_MAPS_PROVIDER });
  });

  it("contact results stay in the operation/status domain and never expose adapter internals", async () => {
    const stub = createStubContactInquirySender();
    const stubResult = await stub.send(validInquiry);
    expect(stubResult).toEqual({ ok: false, kind: "unconfiguredDemo" });
    expect(Object.keys(stubResult).sort()).toEqual(["kind", "ok"]);

    const webhook = createWebhookContactInquirySender({
      url: "https://example.test/hook",
      fetchImpl: fetchReturning(true),
    });
    const success = await webhook.send(validInquiry);
    expect(success).toEqual({ ok: true });
    expect(Object.keys(success)).toEqual(["ok"]);

    // A result only ever says delivered/not-delivered — no receiver endpoint,
    // credentials, or transport plumbing leaks through it.
    for (const leaked of ["endpoint", "token", "secret", "headers", "status"]) {
      expect(JSON.stringify([stubResult, success]), leaked).not.toContain(leaked);
    }
  });
});
describe("outbound seam contract — explicit off & demo states (Phase I)", () => {
  it("absent features can never be confused with a delivery", async () => {
    // Absent → the intentional off/none state for the static-action seams.
    expect(createBookingActionResolver(undefined).resolve({ locale: "en" })).toEqual({
      kind: "none",
    });
    expect(createDirectionLinkResolver(undefined).resolve(locationFixture)).toEqual({
      kind: "none",
    });
    expect(createAnalyticsProvider(undefined)).toBeNull();
    // Absent contact → the explicit demo stub, which NEVER reports success.
    const sender = createContactInquirySender(undefined, {});
    await expect(sender.send(validInquiry)).resolves.toEqual({
      ok: false,
      kind: "unconfiguredDemo",
    });
  });

  it("explicit provider none is honored as the off state on every seam that models it", () => {
    expect(createDirectionLinkResolver({ provider: "none" }).resolve(locationFixture)).toEqual({
      kind: "none",
    });
    expect(createBookingActionResolver({ provider: "none" }).resolve({ locale: "en" })).toEqual({
      kind: "none",
    });
    expect(createAnalyticsProvider({ provider: "none" })).toBeNull();
  });
});

describe("outbound seam contract — configured-but-invalid fails loudly, never falls back (Phase I)", () => {
  it("booking external-url without a url throws a typed misconfiguration error", () => {
    expect(() => createBookingActionResolver({ provider: "external-url" })).toThrow(
      BookingMisconfigurationError,
    );
  });

  it("contact webhook without an endpoint throws a typed misconfiguration error (never the demo)", () => {
    expect(() => createContactInquirySender({ provider: "webhook" }, {})).toThrow(
      ContactInquiryMisconfigurationError,
    );
  });

  it("analytics provider with no registered adapter throws (never silent nothing)", () => {
    const unhonorable = { provider: "example-analytics" } as unknown as AnalyticsConfig;
    expect(() => createAnalyticsProvider(unhonorable)).toThrow(AnalyticsMisconfigurationError);
  });
});

describe("outbound seam contract — no substitution, no fabrication (Phase I)", () => {
  it("a link seam never substitutes a different provider", () => {
    const booking = createBookingActionResolver(BOOKING_FIXTURE).resolve({
      locale: siteConfig.defaultLocale,
    });
    const directions = createDirectionLinkResolver(MAPS_FIXTURE).resolve(
      locationFixture,
    );
    expect(booking.kind === "link" && booking.provider).toBe("external-url");
    expect(directions.kind === "link" && directions.provider).toBe(GOOGLE_MAPS_PROVIDER);
    expect(booking.kind === "link" && booking.provider).not.toBe(
      directions.kind === "link" && directions.provider,
    );
  });

  it("a transport failure can never become a success", async () => {
    const non2xx = await createWebhookContactInquirySender({
      url: "https://example.test/hook",
      fetchImpl: fetchReturning(false),
    }).send(validInquiry);
    expect(non2xx).toEqual({ ok: false, kind: "adapterError" });

    const networkFailure = await createWebhookContactInquirySender({
      url: "https://example.test/hook",
      fetchImpl: fetchThrowing(new Error("ECONNRESET")),
    }).send(validInquiry);
    expect(networkFailure).toEqual({ ok: false, kind: "adapterError" });
  });

  it("the shipped template baseline declares every provider explicitly (all optional capabilities OFF)", () => {
    // FS1 — the generic template enables none of the optional outbound
    // capabilities: a fresh clone makes no external request and claims no
    // integration. Each seam therefore resolves its explicit OFF state, and the
    // contact form stays the labelled demo stub (which never reports success).
    expect(siteConfig.analytics).toEqual({ provider: "none" });
    expect(siteConfig.mapsFeature?.provider).toBe("none");
    expect(siteConfig.bookingFeature?.provider).toBe("none");
    expect(siteConfig.contactFeature?.provider).toBe("stub");
  });
});