/**
 * THE CONNECT SIMPLE SENDER — Foundation's single Connect invocation boundary
 * ========================================================================
 * FOUNDATION-RELEASE-CANDIDATE (A2)
 *
 * `@/adapters/connect/public-contact` consumes the Module's public-contact projection; this adapter consumes
 * its released DIRECT-SEND use case, `SendDirectEnquiry`. Both import the Module's ONE published entry
 * (`modules/connect/src/index`), never an internal file.
 *
 * CONNECT OWNS, UNCHANGED: context parsing, policy parsing and authorization, mailbox validation, content
 * validation, the attempt-budget decision, the message plan, the provider idempotency key, outcome
 * classification and the whole refusal vocabulary. Foundation supplies only what a consumer must: the
 * authored record, the verified facts, the private policy and the concrete ports.
 *
 * FOUNDATION REFUSES TO PRETEND: nothing is retried (an `ambiguous` outcome stays ambiguous, because a second
 * automatic attempt could deliver a duplicate nothing could reconcile); no durable store, counter or worker is
 * invented; and nothing logs a message body, a visitor address, a private recipient or a credential.
 */
import { createHash, randomUUID } from "node:crypto";

import {
  SendDirectEnquiry,
  type ClockPort,
  type DiagnosticEvent,
  type DirectSendOutcome,
  type IdGeneratorPort,
  type MailTransportPort,
  type TelemetryPort,
} from "../../../modules/connect/src/index";

import type {
  AuthoredContactFormConfiguration,
  ContactFormFacts,
  ContactFormPolicySource,
  ContactRefusalCategory,
} from "@/core/contact-form";
import type {
  ContactFormSendField,
  ContactFormSendResult,
  ContactFormSender,
} from "@/application/contact-form-submission";

import { createContactEnquiryRenderer } from "./contact-enquiry-renderer";
import { createOfflineMailTransport } from "./offline-mail-transport";

/** A payload ceiling for one unauthenticated request, measured in UTF-8 bytes. */
export const CONTACT_FORM_MAX_PAYLOAD_BYTES = 32_768;

const clock: ClockPort = { nowEpochMs: () => Date.now() };

const ids: IdGeneratorPort = { next: () => randomUUID().replace(/-/g, "") };

/** Connect's provider-key namespace for ONE `(installation, Site)` pair, from VERIFIED identities. */
function contactSendNamespace(facts: ContactFormFacts): string {
  return createHash("sha256")
    .update(`${facts.deploymentId}|${facts.siteId}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Connect's `DiagnosticEvent` has no free-text field, so a body, an address or a provider string cannot reach
 * this line even by mistake. An accepted send is not printed — only refusals and ambiguity are interesting.
 */
export function createDiagnosticTelemetry(
  log: (message: string) => void = (message) => console.error(message),
): TelemetryPort {
  return {
    record(event: DiagnosticEvent): void {
      if (event.name === "directSend.providerAccepted") return;
      log(`[connect-direct-send] ${event.name}`);
    },
  };
}

/**
 * THE POLICY CANDIDATE — a TRANSLATION, not a second contract. Connect reads exactly these names, refuses
 * unknown ones and re-validates every value. What an authoring file may never forge (`deploymentRef`,
 * `ownerRef`, the whole `applicability`) comes from VERIFIED facts only.
 */
export function directSendPolicyCandidate(
  record: AuthoredContactFormConfiguration,
  policy: ContactFormPolicySource,
  facts: ContactFormFacts,
): Record<string, unknown> {
  return {
    deploymentRef: facts.deploymentId,
    ownerRef: facts.ownerId,
    purpose: "contact",
    applicability: {
      siteRefs: [facts.siteId],
      // THE RECORD'S OWN PLACEMENT, never the request's: Connect compares this authored claim against the
      // verified placement the context carries, so deriving it from the request would authorize whatever
      // page happened to be requested.
      bindings:
        "siteWide" in record.placement
          ? [{ kind: "site-wide" }]
          : [{ kind: "page", pageRef: record.placement.page }],
      forms: [facts.formRef],
      publisherRefs: [facts.publisherRef],
      authorizationRefs: [facts.authorizationRef],
    },
    recipients: policy.recipients.map((recipient) => ({
      address: recipient.address,
      kind: recipient.kind,
    })),
    sender: {
      fromAddress: policy.sender.fromAddress,
      fromDisplayName: policy.sender.fromDisplayName,
      replyToMode: policy.sender.replyTo,
      ...(policy.sender.replyToAddress === undefined
        ? {}
        : { replyToAddress: policy.sender.replyToAddress }),
    },
    template: {
      templateId: "contact-enquiry",
      version: "1",
      localeFallbacks: [facts.locale ?? "en"],
    },
    validity: { enabled: record.enabled },
    ...(policy.messageMinLength === undefined
      ? {}
      : { messageMinLength: policy.messageMinLength }),
  };
}

const REFUSAL_CATEGORIES: readonly ContactRefusalCategory[] = [
  "rejected_invalid",
  "rejected_abuse",
  "unavailable",
  "context_unresolved",
];

function refusalCategoryOf(value: unknown): ContactRefusalCategory {
  return REFUSAL_CATEGORIES.includes(value as ContactRefusalCategory)
    ? (value as ContactRefusalCategory)
    : "unavailable";
}

function sendFieldOf(value: unknown): ContactFormSendField {
  const field =
    typeof value === "object" && value !== null
      ? (value as { field?: unknown }).field
      : undefined;
  switch (field) {
    case "name":
    case "email":
    case "subject":
    case "message":
      return field;
    default:
      return "form";
  }
}

function directSendResult(outcome: DirectSendOutcome): ContactFormSendResult {
  switch (outcome.kind) {
    case "providerAccepted":
      return { kind: "providerAccepted" };
    case "ambiguous":
      return { kind: "ambiguous" };
    case "notSent":
      return { kind: "notSent" };
    case "refused":
      return {
        kind: "refused",
        category: refusalCategoryOf(outcome.category),
        fieldErrors: (outcome.fieldErrors ?? []).map(sendFieldOf),
      };
  }
}

/**
 * Build the Connect use case for ONE authorized Site, or `null` when this Installation cannot honestly drive
 * it. `null` is a fail-closed answer, not a silent degradation: the caller refuses with the localized
 * "unavailable" copy rather than manufacturing a success.
 */
export function createContactDirectSender(options: {
  readonly record: AuthoredContactFormConfiguration;
  readonly facts: ContactFormFacts;
  readonly policy: ContactFormPolicySource;
  /** Test seam and adopter extension point. Absent → Foundation's offline transport. */
  readonly transport?: MailTransportPort;
  readonly telemetry?: TelemetryPort;
  readonly log?: (message: string) => void;
}): ContactFormSender | null {
  const log = options.log ?? ((message: string) => console.error(message));
  if (options.record.transport !== "offline") {
    log(
      "[connect-direct-send] this Site selects no transport Foundation can drive; the form is inactive.",
    );
    return null;
  }

  const useCase = new SendDirectEnquiry({
    transport: options.transport ?? createOfflineMailTransport(),
    renderer: createContactEnquiryRenderer(),
    telemetry: options.telemetry ?? createDiagnosticTelemetry(log),
    clock,
    ids,
    limits: { maxPayloadBytes: CONTACT_FORM_MAX_PAYLOAD_BYTES },
    idempotencyNamespace: contactSendNamespace(options.facts),
  });

  const policy = directSendPolicyCandidate(options.record, options.policy, options.facts);
  const context = {
    deploymentId: options.facts.deploymentId,
    publisherRef: options.facts.publisherRef,
    ownerRef: options.facts.ownerId,
    siteRef: options.facts.siteId,
    placement:
      options.facts.placement.kind === "page"
        ? { kind: "page", pageRef: options.facts.placement.pageRef }
        : { kind: "site-wide" },
    formRef: options.facts.formRef,
    purpose: "contact",
    authorizationRef: options.facts.authorizationRef,
    ...(options.facts.locale === undefined ? {} : { locale: options.facts.locale }),
  };

  return {
    async send(content: Record<string, unknown>): Promise<ContactFormSendResult> {
      const payloadBytes = Buffer.byteLength(JSON.stringify(content), "utf8");
      const outcome = await useCase.execute({ policy, context, content, payloadBytes });
      return directSendResult(outcome);
    },
  };
}

