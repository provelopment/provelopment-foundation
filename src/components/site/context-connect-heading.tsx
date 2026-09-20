"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { siteConfig } from "@/config";
import {
  parseRegionalPath,
  resolveNavHref,
} from "@/core/regional-pages";
import { FOOTER_TARGET_CLASS } from "./footer-link-class";

interface ContextConnectHeadingProps {
  readonly locale: string;
  /** Localized section heading (also the link's accessible name). */
  readonly label: string;
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
export function ContextConnectHeading({ locale, label }: ContextConnectHeadingProps) {
  const pathname = usePathname();
  const parsed = parseRegionalPath(siteConfig.pageBindings, pathname ?? `/${locale}`);
  const href = resolveNavHref(siteConfig.pageBindings, locale, parsed.region, "/connect");

  const headingClass =
    "text-sm font-semibold uppercase tracking-wide text-muted-foreground";
  // VIS2S — the heading is also the Connect link, so it carries the shared footer
  // target floor while keeping the heading's own typography.
  const linkClass = `${FOOTER_TARGET_CLASS} ${headingClass} hover:text-primary transition-colors`;

  return (
    <h2 className={headingClass}>
      {href ? (
        <Link href={href} className={linkClass}>
          {label}
        </Link>
      ) : (
        label
      )}
    </h2>
  );
}