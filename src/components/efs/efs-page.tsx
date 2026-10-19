import { Heading } from "@/components/ui/heading";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { assetUrl } from "@/core/efs/publication";

import type { EfsView } from "@/app/[[...segments]]/efs-request";

/** A minimal, public-only EFS Page projection. It renders only explicitly public properties. */
export function EfsPageView({ view }: { readonly view: EfsView }) {
  const publicProperties = view.properties.publicEntries();
  const valueOf = (key: string) => publicProperties.find((entry) => entry.key === key)?.value;
  const logo = valueOf("brand.logo");
  const logoUrl =
    typeof logo === "string"
      ? /^https?:\/\//.test(logo)
        ? logo
        : assetUrl(view.binding, logo)
      : undefined;
  const address = valueOf("contact.address");
  const phone = valueOf("contact.phone");
  const openingHours = valueOf("openingHours");
  const body =
    view.source.format === "markdown"
      ? view.source.body
      : typeof view.source.data.body === "string"
        ? view.source.data.body
        : typeof view.source.data.content === "string"
          ? view.source.data.content
          : undefined;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <article>
        {logoUrl ? (
          // The candidate asset URL is already owner- and binding-scoped. Keeping the native element
          // avoids imposing a synthetic intrinsic size on authored brand artwork.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Brand logo" className="mb-8 h-10 w-auto" />
        ) : null}
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          {view.entity.id} · {view.site.id} · {view.locale}
        </p>
        <Heading level={1} tone="title">
          {typeof view.source.data.title === "string" ? view.source.data.title : view.page.id}
        </Heading>
        {body ? <SafeMarkdownContent markdown={body} className="mt-8" /> : null}
        <dl className="mt-10 grid gap-3 text-sm">
          {typeof address === "string" ? (
            <div>
              <dt className="font-semibold">Address</dt>
              <dd>{address}</dd>
            </div>
          ) : null}
          {typeof phone === "string" ? (
            <div>
              <dt className="font-semibold">Telephone</dt>
              <dd>{phone}</dd>
            </div>
          ) : null}
          {typeof openingHours === "string" ? (
            <div>
              <dt className="font-semibold">Opening hours</dt>
              <dd>{openingHours}</dd>
            </div>
          ) : null}
        </dl>
        <nav className="mt-10 flex flex-wrap gap-4 text-sm" aria-label="Languages">
          {view.alternates.map((alternate) => (
            <a key={alternate.hreflang} href={alternate.href} hrefLang={alternate.hreflang}>
              {alternate.hreflang}
            </a>
          ))}
        </nav>
      </article>
    </main>
  );
}
