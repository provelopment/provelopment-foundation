import type { ReactNode } from "react";

import type { EfsView } from "@/app/[[...segments]]/efs-request";
import { publicContactLinkResolver } from "@/adapters/connect/public-contact";
import { EfsContactForm } from "@/components/efs/efs-contact-form";
import type { PageLinkResolver } from "@/core/page-document";
import { contentSegments } from "@/core/efs/publication";
import { pageRoutePathSegments } from "@/core/page-route-path";

/** The three authorities one rendered EFS Page needs, all derived from THIS request's verified view. */
export interface EfsPageLinkContext {
  readonly resolveRoute: (routePath: string) => string | null;
  readonly resolveLink: PageLinkResolver;
  readonly renderContactForm: (formRef: string) => ReactNode;
}

/**
 * ONE PER-RENDER EFS LINK AUTHORITY, FOR EVERY EFS PAGE (GEO-04 C09-R09)
 * ====================================================================
 *
 * The generic Page view and the specialised Connect presentation must not each invent their own way of
 * turning an authored `route` or an authored application `link` into an address. Two implementations
 * meant a Connect Page could reach `/<locale>/<route>` — the pre-EFS shape that 404s on the very binding
 * that rendered it — while the ordinary page reached the binding-owned address. This function is the ONE
 * place both read, and it is a per-render ARGUMENT: never module state, never a cache, never a React
 * context, so nothing can leak between requests or Spokes.
 *
 * What it reads was already proved by Foundation's resolution of this request:
 *
 *  - `runtimeSegment` — the collision-free runtime identity of the OWNING Spoke;
 *  - `entity.id` / `site.id` — the verified EFS Entity and Site being rendered;
 *  - `binding.aliasOf ?? binding.id` — the CANONICAL binding, so an alias serves exactly the
 *    authorization its canonical route holds (rendering and submission therefore agree);
 *  - `siteConfig.communication` — the Spoke's own validated configuration, keyed by EFS Site id.
 *
 * An authored `route` names another Page of THIS site, so its address is the address this request is
 * served under: the effective binding's public base (prefix, Site selector when open), the qualified
 * locale key, then the declared route — exactly what `contentSegments` already computes for the
 * canonical URL, the navigation and the `og:image` root. The route is validated by the ONE route grammar
 * (`pageRoutePathSegments`), which also gives D43's casing normalization for free; a refused route
 * answers `null` and the caller renders the label alone. An authored application `link` is resolved only
 * through the existing declared-application + owner authorization, and an unresolved reference is
 * refused the same way.
 */
export function efsPageLinkContext(view: EfsView): EfsPageLinkContext {
  const resolveLink = publicContactLinkResolver({
    authority: {
      deploymentId: view.context.runtimeSegment,
      ownerId: view.entity.id,
      siteId: view.site.id,
      authorizationRef: view.binding.aliasOf ?? view.binding.id,
      ...(view.context.spokeHubId === undefined
        ? {}
        : { publisherRef: view.context.runtimeSegment }),
    },
    configuration: view.context.siteConfig.communication,
  });

  const resolveRoute = (routePath: string): string | null => {
    const segments = pageRoutePathSegments(routePath);
    if (segments.length === 0) return null;
    return `/${contentSegments(view.binding, {
      siteId: view.site.id,
      locale: view.locale,
      localeKey: view.localeKey,
      pageRoute: segments,
    }).join("/")}`;
  };

  return {
    resolveRoute,
    resolveLink,
    renderContactForm: (formRef: string) => <EfsContactForm view={view} formRef={formRef} />,
  };
}

/**
 * THE EFS SITE'S PUBLIC STRUCTURED DATA — the same object on every EFS Page of this Site.
 *
 * It describes the Site and this representation's canonical address, never the page body, so a
 * specialised presentation that replaces the body must still publish it: that is the EFS public
 * projection, and omitting it on `/connect` would be an accidental loss rather than a presentation
 * choice. Rendered once per page — the generic view and the Connect view are mutually exclusive, so
 * there is no duplicate script.
 *
 * THE NAME IS TAKEN FROM THE PUBLIC PROJECTION ONLY (GEO-04 C09-R10). `EffectiveProperties` is
 * deny-by-default: `get(key)` answers with any EFFECTIVE declaration — including one an ancestor
 * marked private and one a descendant merely inherited — while `publicEntries()` is the only view
 * that contains public, nonsuppressed entries. Publishing a JSON-LD `name` is public output, so it is
 * selected from `publicEntries()` exactly as the pre-R09 page renderer did: a private declaration, a
 * private descendant override, a descendant `null` suppression, and a suppressed ancestor all yield
 * no public string, and the Site falls back to its own Facet identity rather than promoting Spoke
 * branding the owner never published (D40 source precedence). Nothing else about the script changes:
 * one instance, canonical URL, locale, and the `\u003c` HTML-safe serialization.
 */
export function EfsPageStructuredData({ view }: { readonly view: EfsView }) {
  const siteName = view.properties.publicEntries().find((entry) => entry.key === "brand.name")?.value;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: typeof siteName === "string" ? siteName : view.facet.id,
          url: view.canonical,
          inLanguage: view.locale,
        }).replace(/</g, "\\u003c"),
      }}
    />
  );
}
