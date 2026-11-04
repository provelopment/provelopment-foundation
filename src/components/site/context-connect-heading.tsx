"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { resolveNavHref, bindingsForSite } from "@/core/regional-pages";
import { pathContextOr, sitePrefixPath } from "@/core/site";
import { FOOTER_HEADING_BOX_CLASS, FOOTER_HEADING_CLASS } from "./footer-link-class";
import { useClientRouting } from "./client-routing-context";

interface ContextConnectHeadingProps {
  readonly locale: string;
  /** Localized section heading (also the link's accessible name). */
  readonly label: string;
  /**
   * GEO-04 R10 — THE EFS PRESENTATION OF THE SAME HEADING.
   *
   * When present, the heading is rendered from a destination the EFS compositor has ALREADY proved against
   * the publication (`view.navigation`), so this component must not resolve anything: `href` is the published
   * Connect Page's own address, and an absent `href` means this Site publishes no Connect Page — the heading
   * then renders UNLINKED, which is the SAME rule the legacy branch applies to a context with no Connect page.
   *
   * The discriminant is the OBJECT, not `href`: an EFS Site that publishes no Connect Page must be
   * distinguishable from a legacy caller that supplied no EFS projection at all.
   */
  readonly efs?: { readonly href?: string };
}

/**
 * Phase M refinement — the footer's **Connect** section heading IS the link to
 * the Connect gateway page. Resolved through the same URL-authoritative core
 * resolver the header uses:
 *
 *  - generic context   → `/{locale}/connect`;
 *  - regional context  → `/{locale}/{region}/connect` when that regional page
 *    exists;
 *  - regional page with no regional Connect page (`/de/berlin` etc.) → the
 *    heading renders WITHOUT a link (never an invented URL, never a silent
 *    reset to the generic/English page).
 *
 * No regional URL is ever constructed manually here.
 */
export function ContextConnectHeading({ locale, label, efs }: ContextConnectHeadingProps) {
  // ── THE DISPATCHER CALLS NO HOOK ────────────────────────────────────────────────────────────────────
  // `usePathname` and `useClientRouting` live in the legacy child, because the EFS shell deliberately
  // composes NO `ClientRoutingProvider`: calling `useClientRouting` there would throw, and a conditional
  // hook order is illegal. Splitting on the prop keeps both branches honest — the EFS branch below is
  // hook-free by construction, exactly like `EfsResolvedContextNavLinks` (R05).
  if (efs !== undefined) return <EfsConnectHeading href={efs.href} label={label} />;
  return <LegacyContextConnectHeading locale={locale} label={label} />;
}

/**
 * GEO-04 R10 — THE EFS HEADING: presentation only, no destination resolution of any kind.
 *
 * It shares the ONE footer heading contract (`footer-link-class.ts`), so the linked and unlinked headings
 * start at the same vertical position and the link keeps the platform's ≥44px floor — the EFS surface cannot
 * drift from the legacy one. `href` is emitted VERBATIM: it is the published Connect Page's own address,
 * already proved against `view.navigation`, so re-deriving it here is exactly the second resolution the
 * R02–R09 seams exist to remove.
 */
function EfsConnectHeading({ href, label }: { readonly href?: string; readonly label: string }) {
  const linkClass = `${FOOTER_HEADING_BOX_CLASS} ${FOOTER_HEADING_CLASS} hover:text-primary transition-colors`;
  return (
    <h2 className={FOOTER_HEADING_CLASS}>
      {href === undefined ? (
        <span className={FOOTER_HEADING_BOX_CLASS}>{label}</span>
      ) : (
        <Link href={href} className={linkClass}>
          {label}
        </Link>
      )}
    </h2>
  );
}

function LegacyContextConnectHeading({ locale, label }: ContextConnectHeadingProps) {
  const pathname = usePathname();
  // M14 — the routing facts arrive from the SERVER's projection for the CURRENT Spoke.
  const routing = useClientRouting();
  const parsed = pathContextOr(
    routing.siteSet,
    routing.pageBindings,
    pathname ?? `/${locale}`,
    locale,
  );
  // S1/M14 — the heading resolves INSIDE the current site's own bindings (a binding declared for another
  // site can never answer here), so the generic context reaches the generic Connect page, a regional
  // context with a regional Connect reaches it, and a regional context WITHOUT one renders no link at all.
  const href = resolveNavHref(
    bindingsForSite(routing.pageBindings, parsed.site.code),
    locale,
    parsed.region,
    "/connect",
    sitePrefixPath(parsed.site),
  );

  // R1 — THE ONE FOOTER HEADING CONTRACT. The typography and the box the heading's TEXT sits in both come
  // from the shared footer contract (`footer-link-class.ts`), so this LINKED heading's visible text starts at
  // the same vertical position as the unlinked headings beside it — while the link keeps the platform's ≥44px
  // interaction target (`FOOTER_HEADING_BOX_CLASS` IS that floor).
  const linkClass = `${FOOTER_HEADING_BOX_CLASS} ${FOOTER_HEADING_CLASS} hover:text-primary transition-colors`;

  return (
    <h2 className={FOOTER_HEADING_CLASS}>
      {href ? (
        <Link href={href} className={linkClass}>
          {label}
        </Link>
      ) : (
        <span className={FOOTER_HEADING_BOX_CLASS}>{label}</span>
      )}
    </h2>
  );
}