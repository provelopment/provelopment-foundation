/**
 * THE CONTACT-ENQUIRY TEMPLATE RENDERER (Foundation's message preparation)
 * ======================================================================
 * FOUNDATION-RELEASE-CANDIDATE (A2)
 *
 * Connect's `TemplateRendererPort` gives a consumer three obligations, met here in the simplest safe way:
 *
 * - **the subject is approved template text only** — it never contains a visitor-supplied string, so a
 *   visitor cannot choose the line a mailbox shows. The visitor's own subject travels in the BODY;
 * - **every visitor-derived value is inserted as text** — the message is `text/plain` only, so there is no
 *   HTML part for a value to become markup in, and no escaping rule to get wrong. Values arrive already
 *   normalized by Connect's shared content validator;
 * - **a missing template fails closed** — an unknown template id or version throws, which Connect maps to
 *   `notSent: configuration` BEFORE any transport call.
 *
 * The renderer never logs, never resolves a recipient and never decides a sender: those come from the policy
 * Connect has already validated.
 */
import type {
  RenderedMessage,
  RenderRequest,
  TemplateRendererPort,
} from "../../../modules/connect/src/index";

/** The one template this deployment publishes. Constants, never owner-authored references. */
export const CONTACT_ENQUIRY_TEMPLATE_ID = "contact-enquiry";
export const CONTACT_ENQUIRY_TEMPLATE_VERSION = "1";

/** The one subject line Foundation issues. Approved text; never composed from visitor input. */
const CONTACT_ENQUIRY_SUBJECT = "New website enquiry";

export function createContactEnquiryRenderer(): TemplateRendererPort {
  return {
    async render(request: RenderRequest): Promise<RenderedMessage> {
      if (
        request.template.templateId !== CONTACT_ENQUIRY_TEMPLATE_ID ||
        request.template.version !== CONTACT_ENQUIRY_TEMPLATE_VERSION
      ) {
        throw new Error(
          `contact-enquiry template "${request.template.templateId}" version ` +
            `"${request.template.version}" is not published by this deployment.`,
        );
      }

      const values = request.values;
      const lines: string[] = [
        "A visitor submitted the contact form on the website.",
        "",
        `Reference: ${request.submissionReference}`,
        `Name: ${values["name"] ?? ""}`,
        `Email: ${values["email"] ?? ""}`,
      ];
      const subject = values["subject"];
      if (subject !== undefined) lines.push(`Subject: ${subject}`);
      lines.push("", "Message:", values["message"] ?? "");

      return {
        subject: CONTACT_ENQUIRY_SUBJECT,
        textBody: lines.join("\n"),
      };
    },
  };
}
