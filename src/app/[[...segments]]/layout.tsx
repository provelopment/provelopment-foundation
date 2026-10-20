import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";

import {
  layoutForContext,
  layoutForEfsContext,
  layoutMetadataForContext,
  spokeServerComposition,
} from "./server-composition";
import { efsDescription, efsPublicSegments, efsTitle, efsViewForCurrentRequest } from "./efs-request";
import { legacyTestRuntimeEnabled, missingEfsInstallation } from "./legacy-test-runtime";
import { requestPublicDestination } from "./request-context";
import { assetUrl } from "@/core/efs/publication";
import "../globals.css";

/**
 * THE PUBLIC DOCUMENT BOUNDARY — the ROOT layout of the site-scoped URL space (FOUNDATION-MULTISITE-M16/M17)
 * =========================================================================================================
 *
 * S1 — the ROOT layout of a SITE-SCOPED URL space: `/{site}/{locale}/...`. The document's `lang`, the
 * dictionary, the navigation, the footer and every internal URL belong to ONE site; that site and locale are
 * resolved by the SAME request-selected context the page uses, inside `./request-context`.
 *
 * WHICH SPOKE (M17). It is NOT decided here and NOT decided by this file's callers: the request boundary
 * matched the exact hostname claim and declared its Spoke on a private upstream header, and
 * `./request-context` turns that declaration into an explicit `SpokeRuntimeContext` — or refuses. This file
 * reads no hostname, holds no global configuration, and never falls back to a first or default Spoke.
 *
 * WHAT STAYS HERE is the STATIC PLATFORM: the brand typography, the stylesheet import, the mobile-browser
 * chrome colors. Those are facts about this deployment's platform — not about a request — so they are
 * module-level and are never turned into request state.
 *
 * REQUEST-TIME RENDERING (M17). The selected Spoke is known only from the request, so this route
 * deliberately generates no static parameters and claims no static pathname: the SAME public pathname is
 * rendered per host, from that host's own context. Site/locale completion still redirects incomplete public
 * paths (a bare Site, an unknown locale) to their completed public URL.
 */

// P6-2D — brand typography (content/assets/branding/branding-schema.md): the brand's primary
// heading/body typeface family is Inter, Plus Jakarta Sans, or Geist Sans;
// Plus Jakarta Sans is the sanctioned brand choice here (the one code-surface
// change CUSTOMIZING.md documents for re-branding fonts). Monospace stays
// Geist Mono — the spec makes no monospace statement.
const brandSans = Plus_Jakarta_Sans({
  variable: "--font-brand-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** The `<html>` class names: the font variables plus the document-level layout/antialiasing facts. */
const HTML_CLASS_NAME = `${brandSans.variable} ${geistMono.variable} h-full antialiased`;

/**
 * Mobile-browser chrome theme colors, mirroring the semantic `--background`
 * token for each scheme (Phase D). Keep in step with the token section of
 * globals.css when re-theming.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

interface LocaleLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly segments?: string[] }>;
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const segments = (await params).segments ?? [];
  const efs = await efsViewForCurrentRequest(segments);
  if (efs) {
    const favicon = efs.properties.get("brand.favicon");
    return {
      title: efsTitle(efs),
      description: efsDescription(efs),
      ...(favicon?.public && typeof favicon.value === "string"
        ? { icons: { icon: assetUrl(efs.binding, favicon.value) } }
        : {}),
      alternates: {
        canonical: efs.canonical,
        languages: Object.fromEntries(efs.alternates.map((alternate) => [alternate.hreflang, alternate.href])),
      },
    };
  }
  if (!legacyTestRuntimeEnabled()) missingEfsInstallation();
  const { context, destination } = await requestPublicDestination(segments);
  return layoutMetadataForContext(
    spokeServerComposition(context),
    destination.segments as string[],
  );
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const segments = (await params).segments ?? [];
  const efs = await efsViewForCurrentRequest(segments);
  if (efs) {
    const shell = await layoutForEfsContext(
      efs.context,
      efs,
      efsPublicSegments(efs),
      children,
      HTML_CLASS_NAME,
    );
    if (shell) return shell;
    return (
      <html lang={efs.locale} className={HTML_CLASS_NAME}>
        <body className="min-h-full bg-white text-neutral-900 antialiased">{children}</body>
      </html>
    );
  }
  // The context is the one the REQUEST selected (the boundary's exact hostname claim), and the shared
  // composition derives the whole document from it. Only the isolated non-production test utility may
  // reach this path; a real installation must have a verified EFS publication.
  if (!legacyTestRuntimeEnabled()) missingEfsInstallation();
  const { context, destination } = await requestPublicDestination(segments);
  return layoutForContext(
    spokeServerComposition(context),
    destination.segments as string[],
    children,
    HTML_CLASS_NAME,
  );
}
