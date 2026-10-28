/**
 * PUBLIC EMAIL: THE MODULE DECIDES, THE ADAPTER ONLY TRANSLATES
 * ============================================================
 * FOUNDATION-CONNECT-MODULE-INTEGRATION-A9
 *
 * These cases run the REAL pinned `projectPublicContact` through Foundation's adapter, so they prove the
 * integration rather than a mock of it. The distinction they are built around is the whole safety
 * property: `absent` (nothing offered) and `unavailable` (not trustworthy) both render nothing, and an
 * unconfigured Site may never inherit a configured Site's answer.
 *
 * Every string here is a TEST-OWNED fixture (RFC 2606 `.test`), never a deployment's authored value.
 */
import { describe, expect, it } from "vitest";

import type { CommunicationConfiguration } from "@/config/schema";

import {
  PUBLIC_CONTACT_LINK_KEY,
  publicContactLinkResolver,
  resolvePublicContactLink,
  type VerifiedPublicContactAuthority,
} from "@/adapters/connect/public-contact";

const authority: VerifiedPublicContactAuthority = {
  deploymentId: "spoke-foundation",
  ownerId: "entity-foundation",
  siteId: "main",
  authorizationRef: "binding-main",
};

function configuration(
  publicContact: NonNullable<CommunicationConfiguration["publicContact"]>,
): CommunicationConfiguration {
  return { publicContact };
}

const enabledSite = {
  status: "enabled" as const,
  authorizationRefs: ["binding-main"],
  methods: [
    {
      methodRef: "email",
      label: "Email us",
      address: "hello@foundation.test",
      status: "enabled" as const,
    },
  ],
};

describe("an authorized public address", () => {
  it("renders the Module's own mailto: href", () => {
    const href = resolvePublicContactLink({
      authority,
      configuration: configuration({ main: enabledSite }),
    });

    expect(href).toBe("mailto:hello@foundation.test");
  });

  it("answers only its own application-link key, and nothing else", () => {
    const resolve = publicContactLinkResolver({
      authority,
      configuration: configuration({ main: enabledSite }),
    });

    expect(resolve({ reference: "applicationLink", key: PUBLIC_CONTACT_LINK_KEY })).toBe(
      "mailto:hello@foundation.test",
    );
    expect(resolve({ reference: "applicationLink", key: "some-other-key" })).toBeNull();
  });
});

describe("nothing is offered", () => {
  it("offers nothing when the Site declared no configuration at all", () => {
    expect(resolvePublicContactLink({ authority, configuration: undefined })).toBeNull();
    expect(resolvePublicContactLink({ authority, configuration: configuration({}) })).toBeNull();
  });

  it("NEVER inherits a configured Site's answer — a missing Site offers nothing", () => {
    // `main` is fully authorized; the Site being rendered is `germany`. A default-Site fallback here
    // would hand one Site another Site's publication authorization.
    const href = resolvePublicContactLink({
      authority: { ...authority, siteId: "germany" },
      configuration: configuration({ main: enabledSite }),
    });

    expect(href).toBeNull();
  });

  it.each(["disabled", "revoked"] as const)("offers nothing while the Site is %s", (status) => {
    const href = resolvePublicContactLink({
      authority,
      configuration: configuration({ main: { ...enabledSite, status } }),
    });

    expect(href).toBeNull();
  });

  it("offers nothing when every method is disabled", () => {
    const href = resolvePublicContactLink({
      authority,
      configuration: configuration({
        main: {
          ...enabledSite,
          methods: enabledSite.methods.map((method) => ({
            ...method,
            status: "disabled" as const,
          })),
        },
      }),
    });

    expect(href).toBeNull();
  });
});

describe("the configuration cannot be trusted for this authority", () => {
  it("offers nothing when the serving binding is not an authorized one", () => {
    // The Site authorized `binding-main` only. A newly added binding must not start publishing an
    // address nobody approved for it.
    const href = resolvePublicContactLink({
      authority: { ...authority, authorizationRef: "binding-preview" },
      configuration: configuration({ main: enabledSite }),
    });

    expect(href).toBeNull();
  });

  it("offers nothing when the address is not a usable address", () => {
    // An address that could start a query or a header is refused by the Module, and Foundation must not
    // "repair" it into something sendable.
    for (const address of [
      "hello@foundation.test?subject=spam",
      "hello@foundation.test\r\nBcc: other@foundation.test",
      "not-an-address",
    ]) {
      const href = resolvePublicContactLink({
        authority,
        configuration: configuration({
          main: {
            ...enabledSite,
            methods: [{ methodRef: "email", label: "Email us", address, status: "enabled" as const }],
          },
        }),
      });
      expect(href, address).toBeNull();
    }
  });

  it("offers nothing when the audience names a different publisher", () => {
    const href = resolvePublicContactLink({
      authority: { ...authority, publisherRef: "spoke-germany" },
      configuration: configuration({ main: { ...enabledSite, publisherRefs: ["spoke-other"] } }),
    });

    expect(href).toBeNull();
  });

  it("offers nothing when a verified identity cannot be a Module identifier", () => {
    const href = resolvePublicContactLink({
      authority: { ...authority, ownerId: "x".repeat(201) },
      configuration: configuration({ main: enabledSite }),
    });

    expect(href).toBeNull();
  });
});

describe("more than one method", () => {
  it("offers the first available method in authored order", () => {
    const href = resolvePublicContactLink({
      authority,
      configuration: configuration({
        main: {
          ...enabledSite,
          methods: [
            {
              methodRef: "sales",
              label: "Sales",
              address: "sales@foundation.test",
              status: "enabled",
            },
            {
              methodRef: "hello",
              label: "Hello",
              address: "hello@foundation.test",
              status: "enabled",
            },
          ],
        },
      }),
    });

    expect(href).toBe("mailto:sales@foundation.test");
  });

  it("skips a disabled method rather than offering a dead destination", () => {
    const href = resolvePublicContactLink({
      authority,
      configuration: configuration({
        main: {
          ...enabledSite,
          methods: [
            {
              methodRef: "sales",
              label: "Sales",
              address: "sales@foundation.test",
              status: "disabled",
            },
            {
              methodRef: "hello",
              label: "Hello",
              address: "hello@foundation.test",
              status: "enabled",
            },
          ],
        },
      }),
    });

    expect(href).toBe("mailto:hello@foundation.test");
  });
});
