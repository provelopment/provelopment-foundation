import type { ReactNode } from "react";
import { Heading } from "@/components/ui/heading";

import {
  resolvePageLink,
  type PageDocument,
  type PageLinkIdResolver,
  type PageLinkResolver,
  type PageLinks,
  type PageSection,
} from "@/core/page-document";
import {
  CalloutSection,
  ActionsSection,
  DividerSection,
  ProseSection,
  QuoteSection,
} from "./page-sections/text-sections";
import { CardsSection, GallerySection, HeroSection, MediaSection } from "./page-sections/media-sections";
import { FeaturesSection, ListSection, StatsSection, StepsSection } from "./page-sections/items-sections";
import { ColumnsSection, FaqSection, TableSection } from "./page-sections/structure-sections";

/**
 * THE DECLARATIVE PAGE COMPOSER — ONE RENDER ENTRY
 * ===============================================
 *
 * The JSON authoring mode's presentation boundary: a VALIDATED document goes in, a page
 * comes out. It is the only place that knows which section type maps to which Foundation
 * presentation, so no route ever switches on a section type, and it is
 * configuration-independent and site-neutral: it receives the document and the locale of
 * the URL being rendered, and nothing else.
 *
 *   document  →  this composer  →  the shared primitives (`Heading`, `Grid`, `NavItem`,
 *                                   `SafeMarkdownContent`, …) via `./page-sections/*`
 *
 * THE ONE H1. The document's `title` is the page's level-1 heading, rendered here — the
 * same contract the Markdown mode's page title has, so both modes produce exactly one
 * page-level heading and the section vocabulary can never add a second one.
 *
 * The switch below is EXHAUSTIVE over `PageSection["type"]`: the `never` assignment at
 * the end means a new section type cannot be added to the vocabulary without a
 * presentation for it, which is how "validated" and "rendered" cannot drift apart.
 */
export interface PageDocumentContentProps {
  readonly document: PageDocument;
  /** The locale of the URL being rendered — how `route` destinations become hrefs. */
  readonly locale: string;
  /**
   * Whether this composer renders the document's level-1 heading. `true` for a page whose
   * only heading is its title (the generic page route and the locale root). The two
   * dedicated routes (`/connect`, `/contact`) pass `false`, because THEY own the page
   * heading from the interface dictionary — and exactly one h1 must exist either way.
   */
  readonly withTitle?: boolean;
  /**
   * The application context's resolver for this document's declared links (A8 Phase F).
   *
   * It is supplied PER RENDER by whoever composes the page — the route, in this platform — and it is
   * the only thing that can turn a `link` action or a `#link:<id>` marker into an href. Absent means
   * "this render has no application context", and every declared link then renders as its label alone.
   * Foundation never holds one: there is no module-level resolver, no cache and no context object.
   */
  readonly resolveLink?: PageLinkResolver;
  /**
   * Declarations to use instead of the document's own `links`.
   *
   * The document is the authority — this exists for a caller that renders a document it did not read
   * from the authored tree (a preview, a test), and it is never a second source of authoring truth.
   */
  readonly links?: PageLinks;
  /**
   * THE PER-RENDER CONTACT-FORM SEAM (A5).
   *
   * A `contactForm` section declares intent; whether a working form may appear is a decision only the
   * composition that verified THIS request can make — it needs the verified Site, Page, publication, the
   * Site's own record and the owning Spoke's private policy. That composition supplies this function, and it
   * is the same seam style as `resolveLink`: created per render, never stored, never a registry, and absent
   * means "this render has no authorized form", in which case the section renders nothing at all.
   *
   * Foundation's generic composer stays independent of Connect: it passes the authored `formRef` through and
   * knows nothing about records, policies, transports or mailboxes.
   */
  readonly renderContactForm?: (formRef: string) => ReactNode;
}

/** One section → one presentation. The id is unique per page (used as the label id). */
function renderSection(
  section: PageSection,
  locale: string,
  index: number,
  resolveLink: PageLinkIdResolver | undefined,
) {
  const id = `page-section-${index + 1}`;
  switch (section.type) {
    case "hero":
      return <HeroSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "prose":
      return <ProseSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "media":
      return <MediaSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "gallery":
      return <GallerySection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "actions":
      return <ActionsSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "callout":
      return <CalloutSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "cards":
      return <CardsSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "features":
      return <FeaturesSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "columns":
      return <ColumnsSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "steps":
      return <StepsSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "stats":
      return <StatsSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "quote":
      return <QuoteSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "table":
      return <TableSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "faq":
      return <FaqSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "list":
      return <ListSection key={id} section={section} locale={locale} id={id} resolveLink={resolveLink} />;
    case "divider":
      return <DividerSection key={id} />;
    case "contactForm":
      // Rendered by the caller, which owns the authorization decision (see `renderContactForm`). A section
      // whose form this render may not present must draw NOTHING — not an empty shell and not a broken form.
      return null;
    default: {
      // Unreachable: every declared type is handled above. If a type is ever added to
      // the vocabulary without a presentation, this stops the build instead of silently
      // rendering nothing.
      const unhandled: never = section;
      throw new Error(`Unsupported page section reached the renderer: ${JSON.stringify(unhandled)}`);
    }
  }
}

export function PageDocumentContent({
  document,
  locale,
  withTitle = true,
  resolveLink,
  links,
  renderContactForm,
}: PageDocumentContentProps) {
  // THE ONE COMPOSITION (A8 Phase F): a marker or a `link` action names a DECLARATION ID, and the
  // resolver answers the REFERENCE. Both halves are bound HERE, per render, so `@/core` stays a pure
  // lookup and the Markdown renderer never has to know a declaration exists. The closure is created for
  // this render only: nothing is stored, so two pages rendered concurrently cannot share a link.
  const declarations = links ?? document.links;
  const resolveLinkId: PageLinkIdResolver | undefined =
    resolveLink === undefined
      ? undefined
      : (linkId: string) => resolvePageLink(declarations, linkId, resolveLink);

  return (
    <>
      {withTitle ? (
        <Heading level={1} tone="title">
          {document.title}
        </Heading>
      ) : null}
      {document.sections.map((section, index) =>
        section.type === "contactForm"
          ? renderContactForm?.(section.formRef) ?? null
          : renderSection(section, locale, index, resolveLinkId),
      )}
    </>
  );
}
