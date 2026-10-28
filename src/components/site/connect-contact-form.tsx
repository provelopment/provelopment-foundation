"use client";

import { useActionState, useState } from "react";

import { submitContactForm } from "@/app/contact-actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_NAME_MAX,
  CONTACT_SUBJECT_MAX,
  HONEYPOT_FIELD,
} from "@/core/contact-inquiry";
import type { ContactFormSubmissionState } from "@/application/contact-form-submission";
import type { Dictionary } from "@/config/i18n/dictionary";

type ContactDictionary = Dictionary["contact"];
type Field = "name" | "email" | "subject" | "message";

interface ConnectContactFormProps {
  readonly locale: string;
  readonly dict: ContactDictionary;
  readonly formRef: string;
}

/**
 * THE SIMPLE CONTACT FORM (A5) — an OFFLINE DEMONSTRATION.
 *
 * What is real: the browser sends the visitor own submission to this server, the verified EFS route and the
 * Site record are checked, the pinned Connect use case runs against the offline transport, and the visitor is
 * told the truth. What is NOT real: no email leaves, nothing is stored, no provider is contacted and no
 * credential exists. The disclosure says exactly that, BEFORE any data is typed, and asks for fictional data -
 * a visitor must never put a real enquiry into a demonstration.
 *
 * Accessibility follows the released contact form: real labels, `aria-invalid` + `aria-describedby` on the exact
 * fields that failed, a polite live region for the outcome, a genuinely UNCHECKED consent control, and a
 * honeypot that is visually hidden and out of the tab order (and is discarded server-side before any sender is
 * composed).
 */
export function ConnectContactForm({ locale, dict, formRef }: ConnectContactFormProps) {
  const [values, setValues] = useState({ name: "", email: "", subject: "", message: "" });
  const [state, formAction, isPending] = useActionState<
    ContactFormSubmissionState | { readonly status: "idle" },
    FormData
  >(submitContactForm, { status: "idle" });

  const failed = new Set(
    state.status === "validationError" && state.fieldErrors !== undefined
      ? Object.entries(state.fieldErrors)
          .filter(([, value]) => value === true)
          .map(([key]) => key)
      : [],
  );

  function update(field: Field, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  /** The released FieldError contract: semantic tokens only, never a raw colour literal. */
  const classNameFor = (field: Field) => (failed.has(field) ? "border-destructive" : "border-input");

  return (
    <section aria-labelledby="contact-form-heading" className="mt-10 rounded-lg border border-border p-6">
      <h2 id="contact-form-heading" className="text-lg font-semibold">
        {dict.heading}
      </h2>

      <div className="mt-3 rounded border border-border bg-muted p-4 text-sm">
        <p className="font-semibold">{dict.demoTitle}</p>
        <p className="mt-2">{dict.demoBody}</p>
        <p className="mt-2">{dict.demoFictionHint}</p>
      </div>

      <form action={formAction} className="mt-6 grid gap-4" noValidate={false}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="formRef" value={formRef} />

        <div className="grid">
          <label htmlFor="connect-contact-name" className="mb-1 text-sm font-medium">
            {dict.nameLabel}
          </label>
          <input
            id="connect-contact-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={CONTACT_NAME_MAX}
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            aria-invalid={failed.has("name")}
            aria-describedby={failed.has("name") ? "connect-contact-name-error" : undefined}
            className={classNameFor("name")}
          />
          <FieldError id="connect-contact-name-error" show={failed.has("name")}>
            {dict.errors.name}
          </FieldError>
        </div>

        <div className="grid">
          <label htmlFor="connect-contact-email" className="mb-1 text-sm font-medium">
            {dict.emailLabel}
          </label>
          <input
            id="connect-contact-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={CONTACT_EMAIL_MAX}
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            aria-invalid={failed.has("email")}
            aria-describedby={failed.has("email") ? "connect-contact-email-error" : undefined}
            className={classNameFor("email")}
          />
          <FieldError id="connect-contact-email-error" show={failed.has("email")}>
            {dict.errors.email}
          </FieldError>
        </div>

        <div className="grid">
          <label htmlFor="connect-contact-subject" className="mb-1 text-sm font-medium">
            {dict.subjectLabel}
          </label>
          <input
            id="connect-contact-subject"
            name="subject"
            type="text"
            autoComplete="off"
            maxLength={CONTACT_SUBJECT_MAX}
            value={values.subject}
            onChange={(event) => update("subject", event.target.value)}
            aria-invalid={failed.has("subject")}
            aria-describedby={failed.has("subject") ? "connect-contact-subject-error" : undefined}
            className={classNameFor("subject")}
          />
          <FieldError id="connect-contact-subject-error" show={failed.has("subject")}>
            {dict.errors.subject}
          </FieldError>
        </div>

        <div className="grid">
          <label htmlFor="connect-contact-message" className="mb-1 text-sm font-medium">
            {dict.messageLabel}
          </label>
          <textarea
            id="connect-contact-message"
            name="message"
            rows={6}
            required
            maxLength={CONTACT_MESSAGE_MAX}
            value={values.message}
            onChange={(event) => update("message", event.target.value)}
            aria-invalid={failed.has("message")}
            aria-describedby={failed.has("message") ? "connect-contact-message-error" : undefined}
            className={classNameFor("message")}
          />
          <FieldError id="connect-contact-message-error" show={failed.has("message")}>
            {dict.errors.message}
          </FieldError>
        </div>

        <div className="flex items-start gap-2">
          <input
            id="connect-contact-acknowledgement"
            name="acknowledgement"
            type="checkbox"
            // THE CONSENT CONTRACT: `@/application/contact-form-submission` accepts an affirmative
            // `true | "on" | "true"`. "on" is the HTML checkbox default, and it is stated here explicitly so
            // the authored control and the orchestrator cannot drift apart again (A5 shipped "yes", which the
            // orchestrator refused as unacknowledged - found by the A6 browser proof).
            value="on"
            required
            aria-invalid={failed.has("acknowledgement")}
            aria-describedby={
              failed.has("acknowledgement") ? "connect-contact-acknowledgement-error" : undefined
            }
            className="mt-1"
          />
          <div>
            <label htmlFor="connect-contact-acknowledgement" className="text-sm">
              {dict.acknowledgementLabel}
            </label>
            <FieldError
              id="connect-contact-acknowledgement-error"
              show={failed.has("acknowledgement")}
            >
              {dict.acknowledgementError}
            </FieldError>
          </div>
        </div>

        {/* Honeypot: hidden from view and from the tab order; a filled value is discarded server-side. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="connect-contact-honeypot">{dict.honeypotLabel}</label>
          <input
            id="connect-contact-honeypot"
            type="text"
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <p aria-live="polite" className="text-sm">
          {state.status === "demoAccepted" || state.status === "success" || state.status === "botDiscarded"
            ? dict.demoAccepted
            : null}
          {state.status === "ambiguous" ? dict.ambiguous : null}
          {state.status === "unavailable" ? dict.unavailable : null}
          {state.status === "formDisabled" ? dict.formDisabled : null}
          {isPending ? <span aria-busy="true">{dict.sending}</span> : null}
        </p>

        <div>
          <Button type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending ? dict.sending : dict.submitDemo}
          </Button>
        </div>
      </form>
    </section>
  );
}
