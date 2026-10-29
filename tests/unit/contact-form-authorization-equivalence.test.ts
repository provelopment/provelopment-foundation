import { describe, expect, it } from "vitest";

import {
  contactFormAuthorizationProblems,
  type AuthoredContactFormConfiguration,
  type ContactFormFacts,
  type ContactFormMode,
  type ContactFormPlacement,
  type ContactFormTransport,
} from "@/core/contact-form";
import { contactFormPresentsOnPublication } from "@/config/contact-form-record";

/**
 * THE RENDER DECISION AND THE SUBMISSION DECISION ARE EQUIVALENT (FOUNDATION-R8-CONTACT-01)
 * =========================================================================================
 *
 * Two functions decide whether a Site's form may be used, and the source comment in
 * `src/components/efs/efs-contact-form.tsx` once claimed they were one. They are not: rendering calls
 * `contactFormPresentsOnPublication` (`@/config/contact-form-record`), while
 * `src/app/contact-actions.ts` re-reads the record, applies its own pre-checks and calls
 * `contactFormAuthorizationProblems` (`@/core/contact-form`).
 *
 * Equivalence is therefore a PROPERTY TO PROVE, not a fact of construction — and this suite proves it over
 * the whole decision space: enabled × mode × transport × placement × binding membership × policy
 * availability × Page identity. The submission side is modelled the way the Server Action actually builds
 * it, which matters:
 *
 *   · `facts.placement` is DERIVED from the record itself, compared against the VERIFIED Page id;
 *   · `facts.authorizationRef` is the CANONICAL binding id (`origin.bindingId`, which EFS resolved before
 *     the context existed) — the same value the renderer passes as `binding.aliasOf ?? binding.id`;
 *   · `facts.formRef` is the record's own ref, because the action compares the section's ref with the
 *     record first and only then builds the facts;
 *   · the private policy is a boolean on the render side and an `undefined` check on the submission side.
 *
 * A change to either path that breaks this table fails here, which is the guard the earlier comment
 * promised and the release did not have.
 */
const PAGE = "page-services";
const OTHER_PAGE = "page-about";
const CANONICAL_BINDING = "binding-canonical";
const FORM_REF = "contact-form-services";

function record(
  overrides: Partial<AuthoredContactFormConfiguration> = {},
): AuthoredContactFormConfiguration {
  return {
    formRef: FORM_REF,
    enabled: true,
    mode: "simple",
    transport: "offline",
    placement: { siteWide: true },
    authorizationRefs: [CANONICAL_BINDING],
    ...overrides,
  } as AuthoredContactFormConfiguration;
}

/** The facts `src/app/contact-actions.ts` builds for one verified request, in its own shape. */
function factsFrom(config: AuthoredContactFormConfiguration, pageId: string): ContactFormFacts {
  return {
    deploymentId: "spoke:runtime",
    publisherRef: "spoke:runtime",
    ownerId: "e_00000000000000000000000001",
    siteId: "main",
    formRef: config.formRef,
    authorizationRef: CANONICAL_BINDING,
    placement: "siteWide" in config.placement ? { kind: "site-wide" } : { kind: "page", pageRef: pageId },
  };
}

/** What the Server Action allows: its own pre-checks, then the Connect-facing problems. */
function submissionAllows(
  config: AuthoredContactFormConfiguration,
  pageId: string,
  sectionFormRef: string,
  policyAvailable: boolean,
): boolean {
  if (!config.enabled) return false;
  if (config.formRef !== sectionFormRef) return false;
  if (!policyAvailable) return false;
  return contactFormAuthorizationProblems(config, factsFrom(config, pageId)).length === 0;
}

function renderPresents(
  config: AuthoredContactFormConfiguration,
  pageId: string,
  sectionFormRef: string,
  policyAvailable: boolean,
): boolean {
  if (config.formRef !== sectionFormRef) return false;
  return contactFormPresentsOnPublication(config, {
    pageId,
    bindingId: CANONICAL_BINDING,
    policyAvailable,
  });
}

describe("render and submission agree about one form (FOUNDATION-R8-CONTACT-01)", () => {
  const modes: ContactFormMode[] = ["off", "simple", "advanced"];
  const transports: ContactFormTransport[] = ["none", "offline"];
  const placements: ContactFormPlacement[] = [
    { siteWide: true },
    { page: PAGE },
    { page: OTHER_PAGE },
  ];

  it("agrees over the whole decision space, including every refusal", () => {
    let cases = 0;
    for (const enabled of [true, false]) {
      for (const mode of modes) {
        for (const transport of transports) {
          for (const placement of placements) {
            for (const authorizationRefs of [[CANONICAL_BINDING], ["binding-other"], []]) {
              for (const policyAvailable of [true, false]) {
                for (const sectionFormRef of [FORM_REF, "contact-form-other"]) {
                  for (const pageId of [PAGE, OTHER_PAGE]) {
                    const config = record({
                      enabled,
                      mode,
                      transport,
                      placement,
                      authorizationRefs,
                    });
                    const label =
                      `enabled=${enabled} mode=${mode} transport=${transport} ` +
                      `placement=${JSON.stringify(placement)} refs=${JSON.stringify(authorizationRefs)} ` +
                      `policy=${policyAvailable} section=${sectionFormRef} page=${pageId}`;
                    expect(renderPresents(config, pageId, sectionFormRef, policyAvailable), label).toBe(
                      submissionAllows(config, pageId, sectionFormRef, policyAvailable),
                    );
                    cases += 1;
                  }
                }
              }
            }
          }
        }
      }
    }
    // The space is covered exhaustively rather than by a handful of anecdotes.
    expect(cases).toBe(2 * 3 * 2 * 3 * 3 * 2 * 2 * 2);
  });
});
