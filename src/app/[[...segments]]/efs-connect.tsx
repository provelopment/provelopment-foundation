import type { ReactNode } from "react";

import { EfsPageStructuredData, efsPageLinkContext } from "@/components/efs/efs-page-links";
import { createRuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";

import {
  ConnectPageContent,
  CONNECT_PAGE_ROUTE_PATH,
  type ConnectAuthoredPage,
} from "./dedicated-pages";
import type { EfsPageSource } from "@/adapters/content/efs-content";

import type { EfsView } from "./efs-request";
import { efsShellPresentationConfig } from "./server-composition";

/**
 * THE EFS CONNECT PAGE — THE SAME SPECIALISED COMPOSITION THE LEGACY ROUTE USES
 * ==========================================================================
 *
 * GEO-04 C09-R08. The EFS-only request cut left `./page.tsx` rendering `EfsPageView` for every EFS
 * Page, so the already-approved Connect composition (`./dedicated-pages`) — the dictionary heading,
 * the authored body and the ONE `Grid` of configured methods with `AssetIcon` screening, missing-icon
 * text fallback and the authoritative destinations — became unreachable for an EFS request. This
 * module is the narrow, type-safe adapter that restores that reach. It adds NO presentation: it
 * chooses nothing about what a Connect page looks like.
 *
 * WHICH PAGES QUALIFY (A1). Exactly what the legacy route qualifies: a Page whose DECLARED, validated
 * route is the single leaf `connect`. The condition is read from the resolved EFS declaration
 * (`view.page.route`), never from the request's pathname, never from a URL suffix, never from a
 * filename and never from a Spoke's `connect.methods` being non-empty. A Page that is absent,
 * undeclared, unservable or authored under any other route has no declaration to match and is
 * refused here — the EFS resolver has already failed closed before this module is reached.
 *
 * WHOSE PRESENTATION (A3). Every fact comes from THIS request's verified owner context, through the
 * SAME three sources the shared shell uses: `efsShellPresentationConfig` (the effective presentation
 * configuration, including the Connect methods and the cleared/private contact precedence),
 * `dictionaryAccessForRuntimeContext` (this Spoke's own dictionary answers) and
 * `createRuntimeAssetOwnershipResolver(context.runtimeAssetNamespaces)` (this installation's declared
 * icon namespaces, so an absent icon stays a text-only method and never a broken image). No second
 * configuration loader, no global cache, no cross-Spoke lookup. `presentationSiteCode` is used ONLY
 * as the owner's dictionary/presentation key, exactly as the shell does — never as a URL selector.
 *
 * WHEN THERE IS NO PRESENTATION (A3, last sentence). A Spoke with no compatible presentation
 * configuration gets `undefined` here, and the caller keeps the established shell-free EFS behavior.
 * Nothing is synthesized.
 */
export function efsConnectAuthoredPage(view: {
  readonly page: { readonly route: readonly string[] };
  readonly source: EfsPageSource;
}): ConnectAuthoredPage | undefined {
  const route = view.page.route;
  // Fail closed on anything that is not the ONE declared Connect leaf (case-insensitive, exactly one
  // segment — no `/connect/...` suffix, no prefix, no locale-only address).
  if (route.length !== 1) return undefined;
  if (route[0].toLowerCase() !== CONNECT_PAGE_ROUTE_PATH) return undefined;
  const source = view.source;
  if (source.format === "markdown") {
    return source.body === undefined ? undefined : { kind: "markdown", body: source.body };
  }
  return source.document === undefined ? undefined : { kind: "json", document: source.document };
}

/**
 * The Connect composition for this request, or `undefined` when this Spoke authored no compatible
 * presentation. Rendered INSIDE the shell the root layout already composed: no second header, no
 * second footer, no nested `<main>`, no duplicate `<h1>` (the composition owns the heading and passes
 * `withTitle={false}` to the document renderer).
 */
export function efsConnectPresentation(
  view: EfsView,
  page: ConnectAuthoredPage,
): ReactNode | undefined {
  const siteConfig = efsShellPresentationConfig(view.context.siteConfig, view);
  if (!siteConfig) return undefined;
  // GEO-04 C09-R09 — the SAME per-render authorities the generic EFS view uses, so a JSON Connect Page's
  // authored `route` lands on the binding-owned address and its application `link` is resolved by the
  // verified EFS owner. The authored href path stays verbatim; nothing else is inferred.
  const { resolveRoute, resolveLink, renderContactForm } = efsPageLinkContext(view);
  return (
    <>
      <ConnectPageContent
        locale={view.locale}
        // The owner's corresponding presentation key; absent → the composition falls back to the
        // configuration's own default site code, exactly as it does for the legacy route.
        siteId={view.publication.presentationSiteCode}
        page={page}
        siteConfig={siteConfig}
        dictionaryAccess={dictionaryAccessForRuntimeContext(view.context)}
        assets={createRuntimeAssetOwnershipResolver(view.context.runtimeAssetNamespaces)}
        resolveRoute={resolveRoute}
        resolveLink={resolveLink}
        renderContactForm={renderContactForm}
      />
      {/* The EFS Site's public JSON-LD describes the Site and this canonical address, not the page body:
          replacing the body must not drop it. Rendered once — the generic view is not rendered here. */}
      <EfsPageStructuredData view={view} />
    </>
  );
}
