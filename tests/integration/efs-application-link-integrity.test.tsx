import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { loadEfsPageSource } from "@/adapters/content/efs-content";
import { PageDocumentContent } from "@/components/site/page-document-content";
import { pageDocumentSchema } from "@/core/page-document";

/**
 * THE APPLICATION-LINK CONTRACT ON THE PATH THAT ACTUALLY SERVES (A8 Phase F, §3B/§3C)
 * ====================================================================================
 *
 * The unit suite proves the rules in isolation. This proves them where a published representation is
 * read — `loadEfsPageSource`, the EFS runtime content path — and then proves the presentation contract
 * through a REAL render of the declarative composer.
 *
 * Both halves matter: a rule the offline reader enforces and the serving reader forgets is no rule at
 * all, and a resolver that works in a unit test but never reaches a list item is not a delivered
 * capability. The capsule here is a disposable temp directory, so no committed fixture changes.
 */
const root = join(tmpdir(), `foundation-a8-link-integrity-${process.pid}`);
const owner = {
  entityId: "e_00000000000000000000000000",
  facetId: "acme",
  siteId: "jakarta",
} as const;

function writePage(pageId: string, document: unknown): void {
  const pages = join(root, owner.entityId, owner.facetId, owner.siteId, "pages");
  mkdirSync(pages, { recursive: true });
  writeFileSync(join(pages, `${pageId}.json`), JSON.stringify(document), "utf8");
}

const load = (pageId: string) => loadEfsPageSource({ root, ...owner, pageId, routePath: pageId });

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("the EFS runtime reader enforces the application-link contract", () => {
  it("loads a page whose markers and links are all declared", () => {
    writePage("declared", {
      schemaVersion: 1,
      title: "Declared",
      links: { contact: { reference: "applicationLink", key: "public-contact-email" } },
      sections: [
        { type: "prose", body: "Write to [us](#link:contact)." },
        { type: "actions", actions: [{ label: "Email", link: "contact" }] },
        { type: "list", items: [{ label: "Email", link: "contact" }] },
      ],
    });

    const loaded = load("declared");
    expect(loaded.kind).toBe("ok");
    if (loaded.kind === "ok") {
      expect(loaded.value.format).toBe("json");
      expect(loaded.value.document?.links).toEqual({
        contact: { reference: "applicationLink", key: "public-contact-email" },
      });
    }
  });

  it("refuses a marker whose id the document does not declare, naming the field and the id", () => {
    writePage("undeclared-marker", {
      schemaVersion: 1,
      title: "Undeclared marker",
      sections: [{ type: "prose", body: "Write to [us](#link:missing)." }],
    });

    const loaded = load("undeclared-marker");
    expect(loaded.kind).toBe("rejected");
    if (loaded.kind === "rejected") {
      expect(loaded.reason).toContain("sections[0].body");
      expect(loaded.reason).toContain("#link:missing");
    }
  });

  it("refuses a malformed reserved marker instead of serving a dead fragment", () => {
    writePage("malformed-marker", {
      schemaVersion: 1,
      title: "Malformed marker",
      sections: [{ type: "prose", body: "Write to [us](#link:)." }],
    });

    const loaded = load("malformed-marker");
    expect(loaded.kind).toBe("rejected");
    if (loaded.kind === "rejected") {
      expect(loaded.reason).toContain("malformed");
      expect(loaded.reason).toContain("sections[0].body");
    }
  });

  it("refuses an action link that names no declaration, naming the property", () => {
    writePage("undeclared-action", {
      schemaVersion: 1,
      title: "Undeclared action",
      sections: [{ type: "actions", actions: [{ label: "Email", link: "missing" }] }],
    });

    const loaded = load("undeclared-action");
    expect(loaded.kind).toBe("rejected");
    if (loaded.kind === "rejected") {
      expect(loaded.reason).toContain("sections[0].actions[0].link");
    }
  });

  it("refuses a list-item link that names no declaration, naming the property", () => {
    writePage("undeclared-list", {
      schemaVersion: 1,
      title: "Undeclared list item",
      sections: [{ type: "list", items: [{ label: "Email", link: "missing" }] }],
    });

    const loaded = load("undeclared-list");
    expect(loaded.kind).toBe("rejected");
    if (loaded.kind === "rejected") {
      expect(loaded.reason).toContain("sections[0].items[0].link");
    }
  });
});

describe("the composer resolves actions and list items per render", () => {
  const document = pageDocumentSchema.parse({
    schemaVersion: 1,
    title: "Contact",
    links: {
      contact: { reference: "applicationLink", key: "public-contact-email" },
      absent: { reference: "applicationLink", key: "not-offered" },
    },
    sections: [
      { type: "actions", actions: [{ label: "Email us", link: "contact" }] },
      { type: "prose", body: "Write to [us](#link:contact), or [nowhere](#link:absent)." },
      { type: "cards", items: [{ title: "Card", action: { label: "Card email", link: "contact" } }] },
      {
        type: "list",
        items: [
          { label: "Email us too", link: "contact" },
          { label: "Not offered", link: "absent" },
          { label: "Ordinary", href: "/contact" },
        ],
      },
    ],
  });

  it("renders resolved actions, prose markers, card actions and list items as anchors", () => {
    const html = renderToStaticMarkup(
      <PageDocumentContent
        document={document}
        locale="en"
        resolveLink={(reference) =>
          reference.key === "public-contact-email" ? "mailto:hello@example.test" : null
        }
      />,
    );

    expect(html.match(/href="mailto:hello@example\.test"/g) ?? []).toHaveLength(4);
    expect(html).toContain("Not offered");
    expect(html).not.toContain("#link:");
  });

  it("renders every application link as text when no resolver is wired", () => {
    const html = renderToStaticMarkup(<PageDocumentContent document={document} locale="en" />);

    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("#link:");
    expect(html).toContain("Email us");
    expect(html).toContain("Not offered");
    expect(html).toContain("href=\"/contact\"");
  });

  it("renders a refused answer as text, keeping the author label and no anchor", () => {
    const html = renderToStaticMarkup(
      <PageDocumentContent document={document} locale="en" resolveLink={() => "#link:chained"} />,
    );

    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("#link:");
    expect(html).toContain("Email us");
  });
});
