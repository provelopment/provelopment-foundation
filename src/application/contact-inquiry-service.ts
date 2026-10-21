import { ZodError } from "zod";

import {
  contactInquirySchema,
  ContactInquiryMisconfigurationError,
  HONEYPOT_FIELD,
  type ContactField,
  type ContactInquiryOrigin,
} from "@/core/contact-inquiry";
import type { ContactInquirySender } from "./contact-inquiry-sender";

export type ContactSubmissionStatus =
  | "idle"
  | "success"
  | "botDiscarded"
  | "validationError"
  | "configError"
  | "unconfiguredDemo"
  | "sendError";

export interface ContactSubmissionState {
  readonly status: ContactSubmissionStatus;
  /** Field presence = validation error for that field (client localizes). */
  readonly fieldErrors?: Partial<Record<ContactField, boolean>>;
}

export const initialContactSubmissionState: ContactSubmissionState = {
  status: "idle",
};

export interface HandleContactSubmissionOptions {
  /** Raw form values, unvalidated. */
  readonly values: Record<string, unknown>;
  /**
   * Builds the configured sender. Must throw
   * `ContactInquiryMisconfigurationError` when config is not honoured.
   */
  readonly createSender: () => ContactInquirySender;
  /** Server-derived publication provenance; absent only for a legacy non-EFS submission. */
  readonly origin?: ContactInquiryOrigin;
  /** Diagnostics sink; must NEVER receive inquiry contents. */
  readonly log?: (message: string) => void;
}

/**
 * Orchestrates a contact submission: honeypot → validation → sender → result.
 *
 * Kept in the application layer (no adapter imports): the framework boundary
 * (`src/app/contact-actions.ts`) is responsible for composing the concrete
 * adapter factories and environment variables.
 */
export async function handleContactSubmission(
  options: HandleContactSubmissionOptions,
): Promise<ContactSubmissionState> {
  const { values } = options;

  // Honeypot: a filled hidden field means a bot. Discard without invoking the
  // sender; present a benign success so bots cannot tell they were detected.
  if (typeof values[HONEYPOT_FIELD] === "string" && (values[HONEYPOT_FIELD] as string).length > 0) {
    return { status: "botDiscarded" };
  }

  const parsed = contactInquirySchema.safeParse(values);
  if (!parsed.success) {
    return { status: "validationError", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  let sender: ContactInquirySender;
  try {
    sender = options.createSender();
  } catch (error) {
    if (error instanceof ContactInquiryMisconfigurationError) {
      // Diagnose loudly, log the *configuration* problem only — never the
      // inquiry contents.
      options.log?.(`[contact-inquiry] configuration error: ${error.message}`);
      return { status: "configError" };
    }
    throw error;
  }

  const result = await sender.send(parsed.data, options.origin);
  if (result.ok) return { status: "success" };
  if (result.kind === "unconfiguredDemo") return { status: "unconfiguredDemo" };
  return { status: "sendError" };
}

function fieldErrorsFrom(error: ZodError): Partial<Record<ContactField, boolean>> {
  const fields = new Set<ContactField>();
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "name" || field === "email" || field === "subject" || field === "message") {
      fields.add(field);
    }
  }
  const result: Partial<Record<ContactField, boolean>> = {};
  for (const field of fields) result[field] = true;
  return result;
}