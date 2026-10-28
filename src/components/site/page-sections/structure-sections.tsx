import { ItemTitle, MarkdownField, SectionHeading, ratioClass, sectionClassName } from "./section-support";
import type { SectionViewProps } from "./text-sections";

/**
 * THE STRUCTURE SECTIONS
 * ======================
 *
 * Columns, table and FAQ: the vocabulary a page uses to ORGANISE. Each one has a native
 * element for what it means — side-by-side blocks, a real table with column headings, a
 * disclosure group — so an advanced author gets structure, not a pile of styled divs.
 */

/** `columns`: two or three side-by-side blocks, each with a title and body-or-list. */
export function ColumnsSection({ section, id, resolveLink }: SectionViewProps<"columns">) {
  const layout = section.items.length === 3 ? "sm:grid-cols-3" : ratioClass(section.ratio);
  return (
    <section
      className={sectionClassName(section.surface, undefined)}
      aria-labelledby={section.heading ? id : undefined}
    >
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <div className={["mt-6 grid gap-6", layout].join(" ")}>
        {section.items.map((column, index) => (
          <div key={index}>
            <ItemTitle>{column.title}</ItemTitle>
            {column.body ? (
              <MarkdownField text={column.body} resolveLink={resolveLink} className="mt-2 text-sm" />
            ) : null}
            {column.items ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {column.items.map((label, labelIndex) => (
                  <li key={labelIndex}>{label}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * `table`: real tabular markup — `<th scope="col">` headings, one cell per declared
 * column — in the same keyboard-reachable local scroll region the platform's Markdown
 * tables use, so a wide table never forces the page sideways.
 */
export function TableSection({ section, id, resolveLink }: SectionViewProps<"table">) {
  return (
    <section
      className={sectionClassName(section.surface, undefined)}
      aria-labelledby={section.heading ? id : undefined}
    >
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <div className="prose-table-scroll mt-4" tabIndex={0}>
        <table className="w-full text-left text-sm">
          {section.caption ? (
            <caption className="pb-2 text-left">
              <MarkdownField text={section.caption} resolveLink={resolveLink} className="text-sm text-muted-foreground" />
            </caption>
          ) : null}
          <thead>
            <tr>
              {section.columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className="border-b border-border py-2 pr-4 font-semibold"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border-b border-border py-2 pr-4 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * `faq`: a disclosure group. The platform uses the NATIVE `<details>`/`<summary>`
 * element, which is keyboard-operable and announced as a disclosure with no JavaScript —
 * so an FAQ is accessible because of what it IS, not because an author remembered
 * anything. Each question is a level-3 heading inside its summary, keeping the outline
 * navigable.
 */
export function FaqSection({ section, id, resolveLink }: SectionViewProps<"faq">) {
  return (
    <section
      className={sectionClassName(section.surface, undefined)}
      aria-labelledby={section.heading ? id : undefined}
    >
      <SectionHeading heading={section.heading} lede={section.lede} id={id} resolveLink={resolveLink} />
      <div className="mt-4 border-y border-border">
        {section.items.map((item, index) => (
          <details key={index} className="border-b border-border py-4 last:border-b-0">
            <summary className="cursor-pointer">
              <ItemTitle>{item.question}</ItemTitle>
            </summary>
            <MarkdownField text={item.answer} resolveLink={resolveLink} className="mt-2 text-sm" />
          </details>
        ))}
      </div>
    </section>
  );
}
