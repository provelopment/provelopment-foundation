import { ConnectContactForm } from "@/components/site/connect-contact-form";
import { contactFormPolicyAuthorized } from "@/config/contact-form-policy";
import { contactFormPresentsOnPublication, contactFormRecordForSite } from "@/config/contact-form-record";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";
import type { Locale } from "@/core/locale";

import type { EfsView } from "@/app/[[...segments]]/efs-request";

/**
 * THE PER-RENDER DECISION TO PRESENT A FORM.
 *
 * The generic Page composer knows a `contactForm` section names a form; it does not know, and must not know,
 * whether any form may appear. This component is that decision, and it is made from the SAME verified context
 * this request already resolved: the owning Spoke own validated configuration, its EFS Site id, the Page EFS
 * proved, and the CANONICAL binding this request reached.
 *
 * A5 decided this from the Page section and the Site record alone. A7 found three consequences: a Page could
 * advertise a working form on a publication the record never authorized; a Site that authored
 * `transport: "none"` still offered a form whose every submission was refused; and an Installation with no
 * private policy still invited a visitor to type into a form guaranteed to fail. All three are now decided
 * here, by ONE shared predicate (`contactFormPresentsOnPublication`), so what a page shows and what the Server
 * Action accepts cannot drift apart.
 *
 * The policy decision is a SERVER-SIDE BOOLEAN. Whether the owning Spoke authors a usable policy is a
 * server-only fact; the recipients and sender addresses in it never reach this component, and nothing about the
 * policy is ever handed to the client.
 *
 * Submission-time revalidation is retained: availability can change between rendering and submitting, and the
 * action re-reads the policy then.
 */
export function EfsContactForm({ view, formRef }: { readonly view: EfsView; readonly formRef: string }) {
  const record = contactFormRecordForSite(view.context.siteConfig, view.site.id);
  if (record === undefined) return null;
  if (record.formRef !== formRef) return null;
  const presents = contactFormPresentsOnPublication(record, {
    pageId: view.page.id,
    // THE CANONICAL binding, by the SAME rule the submission path uses (`binding.aliasOf ?? binding.id`):
    // an alias is judged as the publication it actually reaches, so rendering and Connect agree.
    bindingId: view.binding.aliasOf ?? view.binding.id,
    policyAvailable: contactFormPolicyAuthorized(view.context.resources.spokeRoot, view.site.id),
  });
  if (!presents) return null;

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
