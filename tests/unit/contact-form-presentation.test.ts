/**
 * WHAT A PAGE MAY PRESENT, AND WHAT IT MAY THEN SUBMIT (FOUNDATION-RELEASE-CANDIDATE-A7)
 * ====================================================================================
 *
 * A5 proved the Server Action. It never proved that the PAGE was entitled to show the form it showed, and the
 * three gaps this file closes were all of that shape:
 *
 *   1. presentation ignored the record's `authorizationRefs`, so a publication the Site never authorized still
 *      advertised a working form;
 *   2. presentation ignored `transport: "none"`, so a Site that selects no transport still offered a form whose
 *      every submission the orchestrator refused;
 *   3. presentation ignored whether the owning Spoke authors a private policy, so a visitor was invited to type
 *      into a form guaranteed to fail.
 *
 * The rule that prevents all three from returning is ONE predicate, `contactFormPresentsOnPublication`, and these
 * cases pin it from both sides: the presentation matrix, and the PINNED CONNECT invocation the submission path
 * actually uses. Every value here is TEST-OWNED.
 */
import { describe, expect, it } from "vitest";

import { createContactDirectSender } from "@/adapters/connect/contact-direct-send";
import {
  contactFormAuthorizationProblems,
  type AuthoredContactFormConfiguration,
  type ContactFormFacts,
  type ContactFormPolicySource,
} from "@/core/contact-form";
import {
  contactFormOfferedMode,
  contactFormPresentsOnPublication,
} from "@/config/contact-form-record";

const AUTHORIZED = "binding-approved";
const UNAUTHORIZED = "binding-other";
const PAGE = "contact";
const OTHER_PAGE = "about";

function record(overrides: Partial<AuthoredContactFormConfiguration> = {}): AuthoredContactFormConfiguration {
  return {
    formRef: "test-contact",
    enabled: true,
    mode: "simple",
    transport: "offline",
    placement: { page: PAGE },
    authorizationRefs: [AUTHORIZED],
    ...overrides,
  };
}

function facts(overrides: Partial<ContactFormFacts> = {}): ContactFormFacts {
  return {
    deploymentId: "deployment-demo",
    publisherRef: "publisher-demo",
    ownerId: "owner-demo",
    siteId: "site-demo",
    formRef: "test-contact",
    authorizationRef: AUTHORIZED,
    placement: { kind: "page", pageRef: PAGE },
    locale: "en",
    ...overrides,
  };
}

const policy: ContactFormPolicySource = {
  recipients: [{ address: "contact@example.com", kind: "to" }],
  sender: { fromAddress: "website@example.com", fromDisplayName: "Test", replyTo: "visitor" },
};

const visitor = {
  name: "Test Visitor",
  email: "visitor@example.com",
  message: "A test message.",
  transactionalConsentAck: true,
};

const presents = (
  authored: AuthoredContactFormConfiguration,
  current: { pageId?: string; bindingId?: string; policyAvailable?: boolean } = {},
) =>
  contactFormPresentsOnPublication(authored, {
    pageId: current.pageId ?? PAGE,
    bindingId: current.bindingId ?? AUTHORIZED,
    policyAvailable: current.policyAvailable ?? true,
  });

describe("authorization at PRESENTATION time", () => {
  it("presents on the authorized publication and refuses the other one", () => {
    expect(presents(record())).toBe(true);
    expect(presents(record(), { bindingId: UNAUTHORIZED })).toBe(false);
  });

  it("keeps TWO publications of one Site in agreement with the submission path", () => {
    // The same Site and the same Page, reached through two verified bindings. Only one is authored.
    const authored = record();
    expect(presents(authored, { bindingId: AUTHORIZED })).toBe(true);
    expect(presents(authored, { bindingId: UNAUTHORIZED })).toBe(false);

    // ... and the Server Action refuses exactly the binding the page refuses to advertise.
    expect(contactFormAuthorizationProblems(authored, facts())).toEqual([]);
    expect(
      contactFormAuthorizationProblems(authored, facts({ authorizationRef: UNAUTHORIZED })),
    ).toEqual(["the verified publication is not authorized for this form"]);
  });

  it("never manufactures authority from an empty or near-miss list", () => {
    expect(presents(record({ authorizationRefs: [] }))).toBe(false);
    expect(presents(record({ authorizationRefs: ["binding-approved-2"] }))).toBe(false);
  });
});

describe("the Site's SELECTED TRANSPORT decides whether a form is offered", () => {
  it("offers SIMPLE only over a transport the Site selected", () => {
    expect(contactFormOfferedMode(record())).toBe("simple");
    expect(contactFormOfferedMode(record({ transport: "none" }))).toBe("off");
    expect(presents(record({ transport: "none" }))).toBe(false);
  });

  it("agrees with the submission refusal for `transport: none`", () => {
    const noTransport = record({ transport: "none" });
    expect(presents(noTransport)).toBe(false);
    expect(contactFormAuthorizationProblems(noTransport, facts())).toEqual([
      "no transport is configured for this Site",
    ]);
  });

  it("keeps disabled records, `off` and unsupported `advanced` inactive", () => {
    for (const authored of [
      record({ enabled: false }),
      record({ mode: "off" }),
      record({ mode: "advanced" }),
      record({ enabled: false, transport: "none" }),
    ]) {
      expect(presents(authored)).toBe(false);
    }
  });

  it("covers every supported combination of enabled, mode and transport", () => {
    const cases: Array<{
      enabled: boolean;
      mode: AuthoredContactFormConfiguration["mode"];
      transport: AuthoredContactFormConfiguration["transport"];
      offers: boolean;
    }> = [];
    for (const enabled of [true, false]) {
      for (const mode of ["simple", "off", "advanced"] as const) {
        for (const transport of ["offline", "none"] as const) {
          cases.push({ enabled, mode, transport, offers: enabled && transport === "offline" && mode === "simple" });
        }
      }
    }
    for (const { enabled, mode, transport, offers } of cases) {
      const authored = record({ enabled, mode, transport });
      // A4/A7: the OFFERED mode is the authored mode only while the record is enabled AND the Site selected a
      // transport; `advanced` is offered but cannot be presented (Foundation ships no advanced presentation).
      const active = enabled && transport === "offline";
      expect(contactFormOfferedMode(authored)).toBe(active ? mode : "off");
      // ... and a form is PRESENTED only for an active SIMPLE offer on an authorized publication.
      expect(presents(authored)).toBe(offers);
    }
  });
});

describe("placement is honoured the same way in rendering and in Connect", () => {
  it("presents and submits a PAGE-scoped record on its own Page only", async () => {
    const authored = record();
    expect(presents(authored)).toBe(true);
    expect(presents(authored, { pageId: OTHER_PAGE })).toBe(false);

    const sender = createContactDirectSender({ record: authored, facts: facts(), policy });
    expect(sender).not.toBeNull();
    expect(await sender!.send(visitor)).toEqual({ kind: "providerAccepted" });
  });

  it("refuses a PAGE-scoped submission from a mismatched Page", () => {
    const authored = record();
    expect(
      contactFormAuthorizationProblems(authored, facts({ placement: { kind: "page", pageRef: OTHER_PAGE } })),
    ).toEqual(["placement does not match the verified form location"]);
  });

  it("presents and submits a SITE-WIDE record from any Page of its Site", async () => {
    const authored = record({ placement: { siteWide: true } });
    expect(presents(authored, { pageId: OTHER_PAGE })).toBe(true);
    expect(
      contactFormAuthorizationProblems(authored, facts({ placement: { kind: "site-wide" } })),
    ).toEqual([]);

    const sender = createContactDirectSender({
      record: authored,
      facts: facts({ placement: { kind: "site-wide" } }),
      policy,
    });
    expect(sender).not.toBeNull();
    expect(await sender!.send(visitor)).toEqual({ kind: "providerAccepted" });
  });

  it("cannot widen a PAGE record into site-wide authority, nor narrow a site-wide one", () => {
    // A page-scoped record reported as site-wide: refused.
    expect(contactFormAuthorizationProblems(record(), facts({ placement: { kind: "site-wide" } }))).toEqual([
      "placement does not match the verified form location",
    ]);
    // A site-wide record reported as a page: refused (this is what A5 always reported).
    expect(
      contactFormAuthorizationProblems(record({ placement: { siteWide: true } }), facts()),
    ).toEqual(["placement does not match the verified form location"]);
  });
});

describe("a form with no usable private policy is never offered", () => {
  it("refuses presentation when the owning Spoke authors no valid policy", () => {
    expect(presents(record(), { policyAvailable: false })).toBe(false);
  });

});
