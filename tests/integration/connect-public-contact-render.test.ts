/**
 * THE AUTHORED MARKDOWN LINK, RENDERED — THROUGH THE MODULE, NOT AROUND IT
 * ========================================================================
 * FOUNDATION-CONNECT-MODULE-INTEGRATION-A9-R02 §3.
 *
 * The adapter's own unit test proves the projection. This proves the LAST mile: an authored
 * `[label](#link:id)` marker, the document's declaration, the real Connect resolver, Foundation's
 * existing `resolvePageLink` and its URL classifier all compose into a NATIVE ANCHOR in real HTML — and
 * that every refusing configuration reaches the renderer as no anchor at all, not as a dead `href`.
 *
 * The declaration's `key` is the Module's application-link key; the destination is the Module's own href.
 */
import { describe, expect, it } from "vitest";

import { renderSafeMarkdown } from "@/adapters/markdown/safe-markdown";
import { resolvePageLink, type PageLinks } from "@/core/page-document";

import {
  PUBLIC_CONTACT_LINK_KEY,
  publicContactLinkResolver,
  type VerifiedPublicContactAuthority,
} from "@/adapters/connect/public-contact";

const authority: VerifiedPublicContactAuthority = {
  deploymentId: "spoke-foundation",
  ownerId: "entity-foundation",
  siteId: "main",
  authorizationRef: "binding-foundation-publication",
};

const links = {
  "write-to-us": { reference: "applicationLink", key: PUBLIC_CONTACT_LINK_KEY },
} as unknown as PageLinks;

const MARKDOWN = "Write to [us](#link:write-to-us) any time.";

/** Exactly what the page does: one request-local resolver, bound at render, never stored. */
function render(configuration: Parameters<typeof publicContactLinkResolver>[0]["configuration"]) {
  const resolver = publicContactLinkResolver({ authority, configuration });
  return renderSafeMarkdown(MARKDOWN, (linkId) => resolvePageLink(links, linkId, resolver));
}

const enabled = {
  publicContact: {
    main: {
      status: "enabled" as const,
      authorizationRefs: ["binding-foundation-publication"],
      methods: [
        {
          methodRef: "email",
          label: "Email us",
          address: "hello@foundation.test",
          status: "enabled" as const,
        },
      ],
    },
  },
};

describe("an authorized public address becomes a native mailto: anchor", () => {
  it("renders the Module's href in the anchor", () => {
    const html = render(enabled);

    expect(html).toContain('href="mailto:hello@foundation.test"');
    expect(html).toContain(">us</a>");
  });
});

describe("no refusing configuration can produce a destination", () => {
  const refusals: [string, unknown][] = [
    ["this Site declared no communication block", undefined],
    ["this Site is not the EFS Site that declared one", { ...enabled, publicContact: {} }],
    [
      "the capability is disabled",
      {
        publicContact: {
          main: { ...enabled.publicContact.main, status: "disabled" as const },
        },
      },
    ],
    [
      "the serving binding is not authorized",
      {
        publicContact: {
          main: {
            ...enabled.publicContact.main,
            authorizationRefs: ["some-other-binding"],
          },
        },
      },
    ],
  ];

  it.each(refusals)("renders no mailto: when %s", (_reason, configuration) => {
    const html = render(configuration as typeof enabled);

    expect(html).not.toContain("mailto:");
    // The label survives as plain text — the author's sentence is never silently rewritten — but it is
    // not a destination, so there is nothing for a visitor to click.
    expect(html).not.toContain('href="mailto:');
  });
});
