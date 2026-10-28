import { ConnectContactForm } from "@/components/site/connect-contact-form";
import { contactFormPresentsOnPage, contactFormRecordForSite } from "@/config/contact-form-record";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";
import type { Locale } from "@/core/locale";

import type { EfsView } from "@/app/[[...segments]]/efs-request";

/**
 * THE PER-RENDER DECISION TO PRESENT A FORM (A5).
 *
 * The generic Page composer knows a `contactForm` section names a form; it does not know, and must not know,
 * whether any form may appear. This component is that decision, and it is made from the SAME verified context
 * this request already resolved: the owning Spoke's own validated configuration, its EFS Site id and the Page
 * EFS proved. Nothing is read from the browser.
 *
 * It requires the Page section and the Site record to name the SAME form, and the record to place the form on
 * THIS Page. When any of that is absent the section renders NOTHING - no disabled shell, no legacy fallback.
 *
 * The private policy is deliberately not consulted here: whether a mailbox exists is a submission-time fact, and
 * a page must never be able to read it.
 */
export function EfsContactForm({ view, formRef }: { readonly view: EfsView; readonly formRef: string }) {
  const record = contactFormRecordForSite(view.context.siteConfig, view.site.id);
  if (record === undefined) return null;
  if (record.formRef !== formRef) return null;
  if (!contactFormPresentsOnPage(record, view.page.id)) return null;

// THE VERIFIED SPOKE own dictionaries (context-bound access), never a process-global registry: these are the
  // strings of the Spoke that owns this Site, resolved from the same context that proved the route.
  const copy = dictionaryAccessForRuntimeContext(view.context).get(view.locale as Locale).contact;
  // FAIL CLOSED ON INCOMPLETE LOCALIZATION: the disclosure and the acknowledgement are not decoration - a
  // visitor must be told, before entry, that this form is an offline demonstration and that nothing will be
  // delivered. A Site whose dictionaries lack that vocabulary presents NO form rather than an undisclosed one.
  const required = [
    copy.demoTitle,
    copy.demoBody,
    copy.demoFictionHint,
    copy.acknowledgementLabel,
    copy.acknowledgementError,
    copy.submitDemo,
    copy.demoAccepted,
    copy.ambiguous,
    copy.unavailable,
    copy.formDisabled,
  ];
  if (required.some((value) => value === undefined)) return null;

  return <ConnectContactForm locale={view.locale} dict={copy} formRef={formRef} />;
}
