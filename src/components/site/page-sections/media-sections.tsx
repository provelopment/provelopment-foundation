import { ActionLinks, ItemTitle, MarkdownField, PageImage, SectionHeading, columnsClass, sectionClassName } from "./section-support";
import type { SectionViewProps } from "./text-sections";
import { Grid } from "@/components/ui/grid";

/**
 * THE MEDIA SECTIONS
 * ==================
 *
 * Hero, media and gallery: the vocabulary a page uses to SHOW. Each renders real
 * `<figure>`/`<img>` markup with the alt contract the schema enforced, and the images use
 * the site's normal asset authority (`/assets/**`, mirrored from `content/assets/**`) —
 * there is no second asset subsystem, and no image needs importing into source code.
 */

/** `hero`: the page's opening statement. The page title above it IS the h1. */
export function HeroSection({ section, locale, resolveLink }: SectionViewProps<"hero">) {
  return (
    <section className={sectionClassName(section.surface, section.align)}>
      {section.eyebrow ? (
        <p className="text-sm font-medium uppercase tracking-widest text-primary">{section.eyebrow}</p>
      ) : null}
      {section.lede ? <MarkdownField text={section.lede} resolveLink={resolveLink} className="mt-3 text-lg text-muted-foreground" /> : null}
      {section.actions ? (
        <ActionLinks actions={section.actions} locale={locale} resolveLink={resolveLink} className={section.align === "center" ? "mt-6 justify-center" : "mt-6"} />
      ) : null}
      {section.support ? <MarkdownField text={section.support} resolveLink={resolveLink} className="mt-4 text-sm text-muted-foreground" /> : null}
    </section>
  );
}

/** `media`: one image with an optional caption, optionally beside the section text. */
export function MediaSection({ section, id, resolveLink }: SectionViewProps<"media">) {
  const beside = section.position === "start" || section.position === "end";
  const imageFirst = section.position === "start";
  const figure = (
    <figure>
      <PageImage image={section.image} className="w-full rounded-lg" />
      {section.caption ? (
        <MarkdownField text={section.caption} resolveLink={resolveLink} className="mt-2 text-sm text-muted-foreground" />
      ) : null}
    </figure>
  );

  if (!beside) {
    return (
      <section className={sectionClassName(section.surface, undefined)} aria-labelledby={section.heading ? id : undefined}>
        <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
        <div className="mt-4">{figure}</div>
      </section>
    );
  }

  return (
    <section className={sectionClassName(section.surface, undefined)} aria-labelledby={section.heading ? id : undefined}>
      <div className="grid gap-6 sm:grid-cols-2 sm:items-start">
        {imageFirst ? figure : null}
        <div>
          <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
        </div>
        {imageFirst ? null : figure}
      </div>
    </section>
  );
}

/** `gallery`: a grid of captioned images. */
export function GallerySection({ section, id, resolveLink }: SectionViewProps<"gallery">) {
  return (
    <section className={sectionClassName(section.surface, undefined)} aria-labelledby={section.heading ? id : undefined}>
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <Grid
        columns={columnsClass(section.columns, "sm:grid-cols-2 lg:grid-cols-3")}
        className="mt-6 list-none p-0"
      >
        {section.items.map((item, index) => (
          <li key={index}>
            <figure>
              <PageImage image={item.image} className="w-full rounded-lg" />
              {item.caption ? (
                <MarkdownField text={item.caption} resolveLink={resolveLink} className="mt-2 text-sm text-muted-foreground" />
              ) : null}
            </figure>
          </li>
        ))}
      </Grid>
    </section>
  );
}

/**
 * `cards`: a grid of cards — the generic listing pattern an offerings catalogue, a
 * portfolio listing or a set of articles is built from. A card may carry an image, a
 * short meta line, a Markdown body and one action.
 */
export function CardsSection({ section, locale, id, resolveLink }: SectionViewProps<"cards">) {
  return (
    <section
      className={sectionClassName(section.surface, undefined)}
      aria-labelledby={section.heading ? id : undefined}
    >
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <Grid columns={columnsClass(section.columns)} className="mt-6 list-none p-0">
        {section.items.map((item, index) => (
          <li key={index} className="rounded-lg border border-border p-5">
            {item.image ? <PageImage image={item.image} className="mb-4 w-full rounded-lg" /> : null}
            {item.meta ? (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {item.meta}
              </p>
            ) : null}
            <ItemTitle>{item.title}</ItemTitle>
            {item.body ? <MarkdownField text={item.body} resolveLink={resolveLink} className="mt-2 text-sm" /> : null}
            {item.action ? (
              <ActionLinks
                actions={[item.action]}
                locale={locale}
                defaultVariant="link"
                className="mt-4"
                resolveLink={resolveLink}
              />
            ) : null}
          </li>
        ))}
      </Grid>
    </section>
  );
}
