import { Heading } from "@/components/ui/heading";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { assetUrl, contentSegments } from "@/core/efs/publication";
import { localePathKey } from "@/core/efs/locales";

import type { EfsView } from "@/app/[[...segments]]/efs-request";

/** A public-only EFS Page projection. It never renders an EntityID. */
export function EfsPageView({ view }: { readonly view: EfsView }) {
  const publicProperties = view.properties.publicEntries();
  const valueOf = (key: string) => publicProperties.find((entry) => entry.key === key)?.value;
  const siteName = valueOf("brand.name");
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

  const navItems = view.site.pages
    .filter((page) => (page.visibility ?? "public") === "public")
    .map((page) => {
      const representation =
        page.representations.find(
          (candidate) => localePathKey(candidate.locale) === view.localeKey,
        ) ?? page.representations.find((candidate) => candidate.locale === page.fallbackLocaleKey);
      if (!representation) return null;
      const route = page.route.length === 1 && page.route[0] === "home" ? [] : page.route;
      return {
        pageId: page.id,
        label: typeof page.properties?.["nav.label"]?.value === "string"
          ? (page.properties["nav.label"].value as string)
          : page.id,
        href: `/${contentSegments(view.binding, {
          siteId: view.site.id,
          locale: representation.locale,
          localeKey: localePathKey(representation.locale),
          pageRoute: route,
        }).join("/")}`,
        current: page.id === view.page.id,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <>
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <a href={`/${contentSegments(view.binding, {
            siteId: view.site.id,
            locale: view.locale,
            localeKey: view.localeKey,
            pageRoute: [],
          }).join("/")}`} className="flex items-center gap-3 font-semibold">
            {logoUrl ? (
              // The binding-derived owner URL is already owner-scoped.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-8 w-auto" />
            ) : null}
            <span>{typeof siteName === "string" ? siteName : view.facet.id}</span>
          </a>
          <nav aria-label="Primary">
            <ul className="flex flex-wrap gap-4 text-sm">
              {navItems.map((item) => (
                <li key={item.pageId}>
                  <a href={item.href} aria-current={item.current ? "page" : undefined}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <article>
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
              <a
                key={alternate.hreflang}
                href={alternate.href}
                hrefLang={alternate.hreflang}
                aria-current={alternate.hreflang === view.locale ? "page" : undefined}
              >
                {alternate.hreflang}
              </a>
            ))}
          </nav>
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
        </article>
      </main>
    </>
  );
}
