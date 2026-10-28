import { ActionLinks, MarkdownField, SectionHeading, sectionClassName } from "./section-support";

import type { PageLinkIdResolver, PageSection } from "@/core/page-document";

/** One section of a validated document, as this renderer needs it. */
export interface SectionViewProps<T extends PageSection["type"]> {
  readonly section: Extract<PageSection, { type: T }>;
  /** The locale of the URL being rendered — how `route` destinations become hrefs. */
  readonly locale: string;
  /** A page-unique id for this section's heading (the label it is announced by). */
  readonly id: string;
  /**
   * The per-render application-link resolver (A8 Phase F): an ARGUMENT threaded from the composer,
   * through every section, to every Markdown field and action — never module state, never a cache, never
   * a React context. A section that renders no Markdown and no action simply ignores it.
   */
  readonly resolveLink?: PageLinkIdResolver;
}

/**
 * THE TEXT SECTIONS
 * =================
 *
 * Prose, callout, quote, actions and divider: the vocabulary a page uses to SPEAK. Each
 * one is a semantic element first — a `<section>` with a labelled heading, a
 * `<blockquote>` inside a `<figure>`, a `<ul>` of links, an `<hr>` — and only then a
 * treatment, so the accessible structure does not depend on how the block looks.
 */

/** `prose`: the body of a page, in safe Markdown. */
export function ProseSection({ section, id, resolveLink }: SectionViewProps<"prose">) {
  return (
    <section className={sectionClassName(section.surface, section.align)} aria-labelledby={section.heading ? id : undefined}>
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <MarkdownField text={section.body} resolveLink={resolveLink} className="mt-4" />
    </section>
  );
}

/**
 * `callout`: a note the reader should not miss. `tone` selects the emphasis, and it is a
 * declared value rather than a colour (an author cannot invent one).
 */
export function CalloutSection({ section, id, resolveLink }: SectionViewProps<"callout">) {
  const tone = section.tone ?? "note";
  const accent =
    tone === "warning"
      ? "border-l-4 border-destructive pl-4"
      : tone === "info"
        ? "border-l-4 border-primary pl-4"
        : "border-l-4 border-border pl-4";
  return (
    <section className={sectionClassName(section.surface, section.align)} aria-labelledby={section.heading ? id : undefined}>
      <div className={accent}>
        <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
        <MarkdownField text={section.body} resolveLink={resolveLink} className="mt-2" />
      </div>
    </section>
  );
}

/** `quote`: a quotation with optional attribution — `<figure>` + `<blockquote>`. */
export function QuoteSection({ section, resolveLink }: SectionViewProps<"quote">) {
  return (
    <section className={sectionClassName(section.surface, section.align)}>
      <figure className="mt-2">
        <blockquote className="border-l-4 border-border pl-4 text-lg">
          <MarkdownField text={section.body} resolveLink={resolveLink} />
        </blockquote>
        {section.attribution ? (
          <figcaption className="mt-3 text-sm text-muted-foreground">
            {section.attribution}
            {section.role ? `, ${section.role}` : ""}
          </figcaption>
        ) : null}
      </figure>
    </section>
  );
}

/** `actions`: a group of links, presented as the primary action(s) of a page. */
export function ActionsSection({ section, locale, id, resolveLink }: SectionViewProps<"actions">) {
  return (
    <section className={sectionClassName(section.surface, section.align)} aria-labelledby={section.heading ? id : undefined}>
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <ActionLinks
        actions={section.actions}
        locale={locale}
        resolveLink={resolveLink}
        className="mt-4"
      />
    </section>
  );
}

/** `divider`: a structural break, and nothing else. */
export function DividerSection() {
  return (
    <div className="mt-10">
      <hr className="border-border" />
    </div>
  );
}
