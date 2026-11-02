import { describe, expect, it } from "vitest";

import type { EfsPageSource } from "@/adapters/content/efs-content";
import type { PageDocument } from "@/core/page-document";
import { CONNECT_PAGE_ROUTE_PATH } from "@/app/[[...segments]]/dedicated-pages";
import { efsConnectAuthoredPage } from "@/app/[[...segments]]/efs-connect";

/**
 * THE EFS CONNECT PAGE REACH — FOCUSED CONTRACT (GEO-04 C09-R08)
 * =============================================================
 *
 * The browser scenario proves the user-visible half (three method cards, one legitimately screened
 * icon, text fallbacks, 44/44 plus the fail-closed HTTP rows) on a real declared EFS Page. These are
 * the pure decisions underneath it, so a future "make it route-friendly" change cannot quietly turn
 * a request pathname, a filename or a stray suffix into a published Connect page:
 *
 *   - the leaf is the ONE shared constant the legacy dispatch and the EFS adapter both read;
 *   - the match comes from the RESOLVED, VALIDATED declaration, case-insensitively, on exactly one
 *     segment;
 *   - every other shape — a suffix, a prefix, a different leaf, an empty route (the home Page), a
 *     Markdown source with no body, a JSON source with no validated document — refuses, so
 *     `./page.tsx` falls back to the ordinary EFS view and nothing is synthesized.
 *
 * Deliberately NOT asserted here, because it is proved elsewhere and inventing a stub would be a
 * fake: the owning-Spoke dictionary/asset binding (measured in real Chrome by the connectivity
 * scenario's two-owner footer and icon rows) and the absent-Page 404 (the scenario's HTTP rows).
 */
function markdownSource(body?: string): EfsPageSource {
  return {
    format: "markdown",
    path: "pages/connect.md",
    pageId: "connect",
    data: {},
    ...(body === undefined ? {} : { body }),
    visibility: "public",
  };
}

function jsonSource(document?: PageDocument): EfsPageSource {
  return {
    format: "json",
    path: "pages/connect.json",
    pageId: "connect",
    data: {},
    ...(document === undefined ? {} : { document }),
    visibility: "public",
  };
}

function connectView(route: readonly string[], source: EfsPageSource = markdownSource("Reach us.\n")) {
  return { page: { route }, source };
}

describe("EFS Connect Page reach", () => {
  it("names the Connect leaf once, for both the legacy dispatch and the EFS adapter", () => {
    expect(CONNECT_PAGE_ROUTE_PATH).toBe("connect");
  });

  it("returns the authored Markdown of a DECLARED connect Page", () => {
    expect(efsConnectAuthoredPage(connectView(["connect"]))).toEqual({
      kind: "markdown",
      body: "Reach us.\n",
    });
  });

  it("matches the declared route case-insensitively, as the legacy dispatch does", () => {
    expect(efsConnectAuthoredPage(connectView(["Connect"]))).toEqual({
      kind: "markdown",
      body: "Reach us.\n",
    });
  });

  it("returns a validated JSON document for a declared connect Page authored as JSON", () => {
    const document = { schemaVersion: 1, title: "Connect", sections: [] } as unknown as PageDocument;
    expect(efsConnectAuthoredPage(connectView(["connect"], jsonSource(document)))).toEqual({
      kind: "json",
      document,
    });
  });

  it.each([
    ["a suffix under the leaf", ["connect", "extra"]],
    ["a prefix before the leaf", ["main", "connect"]],
    ["another leaf", ["contact"]],
    ["the home Page", []],
  ])("refuses %s, so no request path can publish a Connect page", (_label, route) => {
    expect(efsConnectAuthoredPage(connectView(route))).toBeUndefined();
  });

  it("refuses a Markdown representation that carries no body", () => {
    expect(efsConnectAuthoredPage(connectView(["connect"], markdownSource()))).toBeUndefined();
  });

  it("refuses a JSON representation that carries no validated document", () => {
    expect(efsConnectAuthoredPage(connectView(["connect"], jsonSource()))).toBeUndefined();
  });
});
