import { NavItem } from "@/components/ui/nav-item";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";

import type { PageAction, PageImage, PageLinkIdResolver } from "@/core/page-document";

/**
 * THE SHARED PRESENTATION CONTRACT OF THE DECLARATIVE PAGE VOCABULARY
 * ==================================================================
 *
 * Every section renderer in this folder composes these pieces, so the vocabulary has ONE
 * treatment per concept: `surface: "muted"` looks the same in a callout, a card grid and
 * a quote, and an author's choice of variant is the only thing that varies. The
 * treatments are Tailwind classes over the ONE design system's tokens — the same style
 * every other site component uses — and NOTHING here comes from configuration or from
 * the document: a JSON page cannot name a class, so these constants ARE the presentation
 * vocabulary, and the schema is what limits the author's choices.
 *
 * Markdown is rendered by the SAME renderer as the Markdown authoring mode
 * (`SafeMarkdownContent` → `@/adapters/markdown/safe-markdown`): raw HTML in a JSON
 * page's prose is inert, unsafe destinations fail closed, and the output is allowlisted.
 */

/** Section surfaces: the page background, a muted panel, or a bordered panel. */
const SURFACE_CLASS: Readonly<Record<string, string>> = {
  plain: "",
  muted: "rounded-lg bg-muted p-6",
  bordered: "rounded-lg border border-border p-6",
};

/** Text alignment, for the sections where an author may centre the content. */
const ALIGN_CLASS: Readonly<Record<string, string>> = {
  start: "",
  center: "text-center",
};

/** Action treatments. A link is a link: no variant renders a `<button>`. */
const ACTION_CLASS: Readonly<Record<string, string>> = {
  primary:
    "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90",
  secondary:
    "rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted",
  link: "text-sm font-medium underline underline-offset-4",
};

/** The grid treatment per declared column count, used with the shared Grid primitive. */
export function columnsClass(
  count: number | undefined,
  fallback = "sm:grid-cols-2 lg:grid-cols-3",
): string {
  switch (count) {
    case 2:
      return "sm:grid-cols-2";
    case 3:
      return "sm:grid-cols-2 lg:grid-cols-3";
    case 4:
      return "sm:grid-cols-2 lg:grid-cols-4";
    default:
      return fallback;
  }
}

/** The width split of a multi-column layout, from the declared ratio. */
export function ratioClass(ratio: "equal" | "start-wide" | "end-wide" | undefined): string {
  switch (ratio) {
    case "start-wide":
      return "sm:grid-cols-[2fr_1fr]";
    case "end-wide":
      return "sm:grid-cols-[1fr_2fr]";
    default:
      return "sm:grid-cols-2";
  }
}

/** One section's outer classes: the page rhythm, its surface and its alignment. */
export function sectionClassName(surface: string | undefined, align: string | undefined): string {
  return ["mt-10", SURFACE_CLASS[surface ?? "plain"] ?? "", ALIGN_CLASS[align ?? "start"] ?? ""]
    .filter(Boolean)
    .join(" ");
}

/** A section heading (level 2) with its optional Markdown lede. */
export function SectionHeading({
  heading,
  lede,
  id,
  resolveLink,
}: {
  readonly heading?: string;
  readonly lede?: string;
  /** The heading's id, so the section can be labelled by it. */
  readonly id?: string;
  /** The per-render application-link resolver, forwarded to the lede (A8 Phase F). */
  readonly resolveLink?: PageLinkIdResolver;
}) {
  if (!heading && !lede) return null;
  return (
    <>
      {heading ? (
        <h2 id={id} className="text-xl font-semibold">
          {heading}
        </h2>
      ) : null}
      {lede ? (
        <MarkdownField text={lede} className="mt-3 text-muted-foreground" resolveLink={resolveLink} />
      ) : null}
    </>
  );
}

/** A Markdown field: the safe renderer, never raw HTML and never a second parser. */
export function MarkdownField({
  text,
  className,
  resolveLink,
}: {
  readonly text: string;
  readonly className?: string;
  /** The per-render application-link resolver (A8 Phase F), forwarded unchanged. */
  readonly resolveLink?: PageLinkIdResolver;
}) {
  return <SafeMarkdownContent markdown={text} className={className} resolveLink={resolveLink} />;
}

/** An item title (level 3): the outline is page title → section heading → item title. */
export function ItemTitle({ children }: { readonly children: string }) {
  return <h3 className="text-lg font-semibold">{children}</h3>;
}

/**
 * A page image. A content image carries its description; decorative art is hidden from
 * assistive technology (`alt=""` + `aria-hidden`), exactly as the shared icon contract
 * does. A plain `<img>` rather than the Next Image optimiser, so any adopter asset
 * format works — the same deliberate choice the banner and icon paths make.
 */
export function PageImage({
  image,
  className,
}: {
  readonly image: PageImage;
  readonly className?: string;
}) {
  const decorative = image.decorative === true;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      alt={decorative ? "" : (image.alt ?? "")}
      aria-hidden={decorative ? "true" : undefined}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}

/**
 * The destination of one action, in the visitor's locale — or `null` when this render has none.
 *
 * `href` is the author's classified destination, used as written. `route` names another PAGE of this
 * site, so it is resolved against the locale of the URL being rendered — the author never writes a
 * locale prefix, and a translated site cannot link to the wrong language. `link` names a DECLARED
 * application link (A8 Phase F): the resolver supplied for this render answers with an href, or with
 * nothing. `null` is a first-class answer, not an error — an action the host does not offer has no
 * destination, and its label is shown as text rather than as a link to nowhere.
 */
export function destinationHref(
  action: PageAction,
  locale: string,
  resolveLink?: PageLinkIdResolver,
): string | null {
  if (action.href !== undefined) return action.href;
  if (action.route !== undefined) return `/${locale}/${action.route}`;
  if (action.link === undefined || resolveLink === undefined) return null;
  return resolveLink(action.link);
}

/** True for a destination that leaves the site (the platform's external-link treatment). */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Actions as a real list of real links, through the shared NavItem: internal
 * destinations are Next `<Link>`s, external ones get the platform's external-link
 * treatment, and nothing here can produce a button, a handler or a callback.
 */
export function ActionLinks({
  actions,
  locale,
  className,
  defaultVariant = "primary",
  resolveLink,
}: {
  readonly actions: readonly PageAction[];
  readonly locale: string;
  readonly className?: string;
  /** The treatment used when an action declares none (a card action reads as a link). */
  readonly defaultVariant?: "primary" | "secondary" | "link";
  /** The per-render application-link resolver (A8 Phase F). */
  readonly resolveLink?: PageLinkIdResolver;
}) {
  return (
    <ul className={["flex flex-wrap gap-3", className].filter(Boolean).join(" ")}>
      {actions.map((action, index) => {
        const href = destinationHref(action, locale, resolveLink);
        const treatment = ACTION_CLASS[action.variant ?? defaultVariant];
        // NO DESTINATION, STILL A CONTROL: the author's label keeps its variant and its place in the
        // page, and only the anchor is absent — the same shape a Markdown marker takes when its
        // application link does not resolve.
        if (href === null) {
          return (
            <li key={`${action.label}:${index}`}>
              <span className={treatment}>{action.label}</span>
            </li>
          );
        }
        return (
          <NavItem
            key={`${href}:${index}`}
            item={{ label: action.label, href, external: isExternalHref(href) }}
            className={treatment}
          />
        );
      })}
    </ul>
  );
}
