import { ItemTitle, MarkdownField, PageImage, SectionHeading, columnsClass, sectionClassName } from "./section-support";
import type { SectionViewProps } from "./text-sections";
import { Grid } from "@/components/ui/grid";

/**
 * THE ITEM SECTIONS
 * =================
 *
 * Features, list, steps and stats: the vocabulary a page uses to GROUP. Each renders a
 * real list element (`<ul>`/`<ol>`) so the grouping is structure rather than appearance,
 * and each item's title is a level-3 heading under the section's level-2 heading.
 */

/**
 * `features`: a grid of titled points — the most common page pattern there is (what we
 * do, why us, what you get). It is deliberately distinct from `cards`: no media, no
 * meta line, no action, and an optional decorative icon.
 */
export function FeaturesSection({ section, id, resolveLink }: SectionViewProps<"features">) {
  return (
    <section
      className={sectionClassName(section.surface, undefined)}
      aria-labelledby={section.heading ? id : undefined}
    >
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <Grid columns={columnsClass(section.columns)} className="mt-6 list-none p-0">
        {section.items.map((item, index) => (
          <li key={index}>
            {item.icon ? (
              <PageImage image={{ src: item.icon, decorative: true }} className="mb-3 h-8 w-8" />
            ) : null}
            <ItemTitle>{item.title}</ItemTitle>
            {item.body ? <MarkdownField text={item.body} resolveLink={resolveLink} className="mt-2 text-sm" /> : null}
          </li>
        ))}
      </Grid>
    </section>
  );
}

/** `list`: labels, optionally with detail text and a destination. */
export function ListSection({ section, locale, id, resolveLink }: SectionViewProps<"list">) {
  const items = section.items.map((item) => (typeof item === "string" ? { label: item } : item));
  const Tag = section.ordered === true ? "ol" : "ul";
  return (
    <section
      className={sectionClassName(section.surface, undefined)}
      aria-labelledby={section.heading ? id : undefined}
    >
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <Tag
        className={[
          "mt-4 space-y-3 pl-5",
          section.ordered === true ? "list-decimal" : "list-disc",
        ].join(" ")}
      >
        {items.map((item, index) => (
          <li key={index}>
            <InlineOrLink item={item} locale={locale} />
            {item.detail ? <MarkdownField text={item.detail} resolveLink={resolveLink} className="mt-1 text-sm" /> : null}
          </li>
        ))}
      </Tag>
    </section>
  );
}

/** A list label: plain text, or a link when the author gave it a destination. */
function InlineOrLink({
  item,
  locale,
}: {
  readonly item: { label: string; href?: string; route?: string };
  readonly locale: string;
}) {
  if (item.href !== undefined) return <a href={item.href}>{item.label}</a>;
  if (item.route !== undefined) return <a href={`/${locale}/${item.route}`}>{item.label}</a>;
  return <span>{item.label}</span>;
}

/** `steps`: an ordered sequence — the number comes from the list, never from text. */
export function StepsSection({ section, id, resolveLink }: SectionViewProps<"steps">) {
  return (
    <section
      className={sectionClassName(section.surface, undefined)}
      aria-labelledby={section.heading ? id : undefined}
    >
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <ol className="mt-6 space-y-6">
        {section.items.map((item, index) => (
          <li key={index} className="flex gap-4">
            <span aria-hidden="true" className="text-lg font-semibold text-primary">
              {index + 1}
            </span>
            <div>
              <ItemTitle>{item.title}</ItemTitle>
              {item.body ? <MarkdownField text={item.body} resolveLink={resolveLink} className="mt-1 text-sm" /> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** `stats`: a few figures with their labels. */
export function StatsSection({ section, id, resolveLink }: SectionViewProps<"stats">) {
  return (
    <section
      className={sectionClassName(section.surface, undefined)}
      aria-labelledby={section.heading ? id : undefined}
    >
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <ul className="mt-6 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {section.items.map((item, index) => (
          <li key={index}>
            <p className="text-3xl font-bold tracking-tight">{item.value}</p>
            <p className="mt-1 text-sm font-medium">{item.label}</p>
            {item.detail ? <MarkdownField text={item.detail} resolveLink={resolveLink} className="mt-1 text-sm" /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
