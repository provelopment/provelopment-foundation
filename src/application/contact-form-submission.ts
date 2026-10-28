/**
 * THE SIMPLE CONTACT-FORM SUBMISSION (application layer)
 * ====================================================
 * FOUNDATION-RELEASE-CANDIDATE (A2)
 *
 * Orchestrates ONE Connect-backed submission and nothing else: honeypot → mode gate → authorized-form gate →
 * genuine consent → one send → truthful state. It owns no transport, no provider and no Module import — the
 * concrete Connect sender arrives through the `ContactFormSender` port the framework boundary composes.
 *
 * WHAT IT NEVER DOES: it never retries (an `ambiguous` result stays ambiguity, because a second automatic
 * attempt could deliver a duplicate nothing could reconcile); it never fabricates consent; it never
 * re-validates the communication fields (Connect's shared validator is the ONE authority); and it never logs
 * a message body, a visitor address, a private recipient or a credential.
 */
import { HONEYPOT_FIELD, type ContactField } from "@/core/contact-inquiry";
import {
  contactFormRefusalState,
  type ContactFormMode,
  type ContactRefusalCategory,
} from "@/core/contact-form";

/** One field a Connect refusal can point at. */
export type ContactFormSendField = ContactField | "form" | "acknowledgement";

/** The honest result of one direct send (never a delivery claim). */
export type ContactFormSendResult =
  | { readonly kind: "providerAccepted" }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "notSent" }
  | {
      readonly kind: "refused";
      readonly category: ContactRefusalCategory;
      readonly fieldErrors: readonly ContactFormSendField[];
    };

/**
 * The port the framework boundary implements with the Connect adapter.
 *
 * `transmits` is part of the PORT, not of the caller's options: the component that composes a sender is the
 * only thing that knows whether a real outbound path exists, and the orchestrator derives the visitor's state
 * from it. A submission cannot talk its way into a delivery claim.
 */
export interface ContactFormSender {
  readonly transmits: boolean;
  send(content: Record<string, unknown>): Promise<ContactFormSendResult>;
}

/**
 * What a visitor is told, and nothing more.
 *
 * `demoAccepted` exists because Foundation's shipped transport transmits nothing: an accepted offline handoff
 * must NEVER be presented as delivery. `ambiguous` says the outcome cannot be established, so the visitor is
 * told not to resend.
 */
export type ContactFormSubmissionState =
  | { readonly status: "success" }
  | { readonly status: "demoAccepted" }
  | { readonly status: "ambiguous" }
  | { readonly status: "validationError"; readonly fieldErrors?: ContactFormFieldErrors }
  | { readonly status: "unavailable" }
  | { readonly status: "formDisabled" }
  | { readonly status: "botDiscarded" };

export type ContactFormFieldErrors = Partial<Record<ContactField | "acknowledgement", boolean>>;

export interface HandleContactFormSubmissionOptions {
  /** The mode the verified EFS route established for its Site. */
  readonly mode: ContactFormMode;
  /** Raw form values, unvalidated. */
  readonly values: Record<string, unknown>;
  /** Fail-closed problems detected before Connect (operator-facing). */
  readonly authorizationProblems: readonly string[];
  /** Composes the concrete sender, or `null` when this Installation cannot drive one. */
  readonly createSender: () => ContactFormSender | null;
  readonly log?: (message: string) => void;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * The content Connect validates. Only the fields the released contact purpose accepts are sent: a locale, a
 * honeypot or any other boundary concern stays on Foundation's side and is NEVER passed as invented content.
 * An empty optional subject is omitted rather than sent as a blank line.
 */
export function contactFormContent(values: Record<string, unknown>): Record<string, unknown> {
  const subject = text(values["subject"]);
  const consent = values["transactionalConsentAck"];
  return {
    name: text(values["name"]) ?? "",
    email: text(values["email"]) ?? "",
    message: text(values["message"]) ?? "",
    ...(subject === undefined || subject.length === 0 ? {} : { subject }),
    // A genuine affirmative acknowledgement: an unticked checkbox submits nothing, and that is `false`.
    transactionalConsentAck: consent === true || consent === "on" || consent === "true",
  };
}

function fieldErrorsOf(
  fields: readonly ContactFormSendField[],
): ContactFormFieldErrors | undefined {
  const errors: ContactFormFieldErrors = {};
  for (const field of fields) {
    if (field === "form") continue;
    errors[field] = true;
  }
  return Object.keys(errors).length === 0 ? undefined : errors;
}

export async function handleContactFormSubmission(
  options: HandleContactFormSubmissionOptions,
): Promise<ContactFormSubmissionState> {
  const { values } = options;
  const log = options.log ?? ((message: string) => console.error(message));

  // A filled hidden field means a bot. Discarded without invoking anything: no transport is called, and a bot
  // cannot learn that it was detected.
  const honeypot = values[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.length > 0) return { status: "botDiscarded" };

  // `off` is a published decision, not missing configuration: nothing is sent, ever.
  if (options.mode === "off") return { status: "formDisabled" };

  // `advanced` needs durable infrastructure this Installation deliberately does not have. It must NEVER fall
  // through to a direct send: that would silently turn one owner's mode into another's.
  if (options.mode === "advanced") {
    log(
      '[contact-form] mode "advanced" selected, but the durable delivery prerequisites are not satisfied ' +
        "in this Installation; the form remains inactive.",
    );
    return { status: "unavailable" };
  }

  if (options.authorizationProblems.length > 0) {
    for (const problem of options.authorizationProblems) {
      log(`[contact-form] refused before sending: ${problem}`);
    }
    return { status: "unavailable" };
  }

  const content = contactFormContent(values);
  if (content["transactionalConsentAck"] !== true) {
    return { status: "validationError", fieldErrors: { acknowledgement: true } };
  }

  const sender = options.createSender();
  if (sender === null) return { status: "unavailable" };

  let result: ContactFormSendResult;
  try {
    result = await sender.send(content);
  } catch {
    // A thrown sender is not evidence that nothing was transmitted. Ambiguity is the honest answer.
    log("[contact-form] the sender threw; the outcome cannot be established.");
    return { status: "ambiguous" };
  }

  switch (result.kind) {
    case "providerAccepted":
      // DERIVED FROM THE SENDER'S OWN CAPABILITY, never from a caller-supplied flag: an offline acceptance can
      // never be presented as a real send, and a transmitting sender can never be presented as a demonstration.
      return sender.transmits ? { status: "success" } : { status: "demoAccepted" };
    case "ambiguous":
      return { status: "ambiguous" };
    case "notSent":
      return { status: "unavailable" };
    case "refused": {
      const state = contactFormRefusalState(result.category);
      const fieldErrors = fieldErrorsOf(result.fieldErrors);
      return fieldErrors === undefined ? { status: state } : { status: state, fieldErrors };
    }
  }
}
