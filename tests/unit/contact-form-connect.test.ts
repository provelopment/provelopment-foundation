/**
 * THE SIMPLE CONTACT FORM — behaviour through the REAL pinned Connect use case
 * ==========================================================================
 * FOUNDATION-RELEASE-CANDIDATE (A2)
 *
 * These cases drive `SendDirectEnquiry` itself (not a stand-in) with Foundation's OFFLINE transport, so what
 * they prove is the released Module's own authorization, content validation and outcome classification — not
 * a Foundation re-implementation of it. Every value here is TEST-OWNED: no deployment recipient, page or
 * configuration is asserted.
 */
import { describe, expect, it, vi } from "vitest";

import { createContactDirectSender } from "@/adapters/connect/contact-direct-send";
import { handleContactFormSubmission } from "@/application/contact-form-submission";
import {
  contactFormAuthorizationProblems,
  type AuthoredContactFormConfiguration,
  type ContactFormFacts,
  type ContactFormPolicySource,
} from "@/core/contact-form";

const record: AuthoredContactFormConfiguration = {
  formRef: "foundation-contact",
  enabled: true,
  mode: "simple",
  transport: "offline",
  placement: { siteWide: true },
  authorizationRefs: ["binding-foundation"],
};

const facts: ContactFormFacts = {
  deploymentId: "foundation-demo",
  publisherRef: "publisher-demo",
  ownerId: "owner-demo",
  siteId: "foundation",
  formRef: "foundation-contact",
  authorizationRef: "binding-foundation",
  placement: { kind: "site-wide" },
  locale: "en",
};

const policy: ContactFormPolicySource = {
  recipients: [{ address: "contact@example.com", kind: "to" }],
  sender: {
    fromAddress: "website@example.com",
    fromDisplayName: "Foundation Website",
    replyTo: "visitor",
  },
};

const visitor = {
  name: "Test Visitor",
  email: "visitor@example.com",
  message: "A test message.",
  transactionalConsentAck: true,
};

describe("the authored record's authorization predicate", () => {
  it("authorizes exactly the verified form, place and publication", () => {
    expect(contactFormAuthorizationProblems(record, facts)).toEqual([]);
  });

  it("refuses an unauthorized publication, a placement mismatch, a disabled record and no transport", () => {
    expect(
      contactFormAuthorizationProblems(record, { ...facts, authorizationRef: "binding-other" }),
    ).toEqual(["the verified publication is not authorized for this form"]);

    expect(
      contactFormAuthorizationProblems({ ...record, placement: { page: "contact-us" } }, facts),
    ).toEqual(["placement does not match the verified form location"]);

    expect(contactFormAuthorizationProblems({ ...record, enabled: false }, facts)).toEqual([
      "record is disabled",
    ]);

    expect(contactFormAuthorizationProblems({ ...record, transport: "none" }, facts)).toEqual([
      "no transport is configured for this Site",
    ]);
  });

  it("refuses a mode it cannot drive, and refuses an absent record", () => {
    expect(contactFormAuthorizationProblems({ ...record, mode: "advanced" }, facts)).toEqual([
      'mode "advanced" does not authorize a direct send',
    ]);
    expect(contactFormAuthorizationProblems(undefined, facts)).toEqual([
      "no contact-form record",
    ]);
  });
});

describe("one direct send through the pinned use case", () => {
  it("accepts a valid submission over the offline transport, claiming no delivery", async () => {
    const sender = createContactDirectSender({ record, facts, policy });
    expect(sender).not.toBeNull();
    // `providerAccepted` is the handoff, not delivery: the offline transport transmitted nothing.
    expect(await sender!.send(visitor)).toEqual({ kind: "providerAccepted" });
  });

  it("refuses without consent, with zero transport calls", async () => {
    const send = vi.fn();
    const sender = createContactDirectSender({ record, facts, policy, transport: { send } });
    const result = await sender!.send({ ...visitor, transactionalConsentAck: false });
    expect(result.kind).toBe("refused");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses an invalid visitor address, with zero transport calls", async () => {
    const send = vi.fn();
    const sender = createContactDirectSender({ record, facts, policy, transport: { send } });
    const result = await sender!.send({ ...visitor, email: "not-an-address" });
    expect(result.kind).toBe("refused");
    if (result.kind === "refused") expect(result.fieldErrors).toContain("email");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a disabled policy before any transport call", async () => {
    const send = vi.fn();
    const sender = createContactDirectSender({
      record: { ...record, enabled: false },
      facts,
      policy,
      transport: { send },
    });
    expect((await sender!.send(visitor)).kind).toBe("refused");
    expect(send).not.toHaveBeenCalled();
  });

  it("is inactive when the Site selects no transport Foundation can drive", () => {
    const log = vi.fn();
    expect(
      createContactDirectSender({ record: { ...record, transport: "none" }, facts, policy, log }),
    ).toBeNull();
    expect(log).toHaveBeenCalled();
  });
});

describe("the submission orchestrator", () => {
  const base = {
    mode: "simple" as const,
    values: visitor,
    authorizationProblems: [] as readonly string[],
    transmits: false,
  };

  it("answers a demonstration, never a delivery claim, for an offline acceptance", async () => {
    const state = await handleContactFormSubmission({
      ...base,
      createSender: () => createContactDirectSender({ record, facts, policy }),
    });
    expect(state).toEqual({ status: "demoAccepted" });
  });

  it("reports success only when the transport actually transmits", async () => {
    const state = await handleContactFormSubmission({
      ...base,
      transmits: true,
      createSender: () => ({ send: async () => ({ kind: "providerAccepted" }) }),
    });
    expect(state).toEqual({ status: "success" });
  });

  it("keeps an ambiguous send ambiguous and never retries", async () => {
    const send = vi.fn(async () => {
      throw new Error("upstream vanished");
    });
    const state = await handleContactFormSubmission({
      ...base,
      createSender: () => ({ send }),
    });
    expect(state).toEqual({ status: "ambiguous" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("discards a honeypot submission without composing a sender", async () => {
    const createSender = vi.fn();
    const state = await handleContactFormSubmission({
      ...base,
      values: { ...visitor, website: "http://spam.example" },
      createSender,
    });
    expect(state).toEqual({ status: "botDiscarded" });
    expect(createSender).not.toHaveBeenCalled();
  });

  it("refuses off, advanced, unauthorized and consentless submissions without sending", async () => {
    const createSender = vi.fn();
    const send = vi.fn();

    expect(await handleContactFormSubmission({ ...base, mode: "off", createSender })).toEqual({
      status: "formDisabled",
    });

    expect(await handleContactFormSubmission({ ...base, mode: "advanced", createSender })).toEqual({
      status: "unavailable",
    });

    expect(
      await handleContactFormSubmission({
        ...base,
        authorizationProblems: ["the verified publication is not authorized for this form"],
        createSender,
      }),
    ).toEqual({ status: "unavailable" });

    expect(
      await handleContactFormSubmission({
        ...base,
        values: { ...visitor, transactionalConsentAck: false },
        createSender: () => ({ send }),
      }),
    ).toEqual({ status: "validationError", fieldErrors: { acknowledgement: true } });

    expect(createSender).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
