import { PageDocumentContent } from "@/components/site/page-document-content";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { Heading } from "@/components/ui/heading";
import { localePathKey } from "@/core/efs/locales";
import { assetUrl, contentSegments } from "@/core/efs/publication";
import { pageDocumentSchema } from "@/core/page-document";

import type { EfsView } from "@/app/[[...segments]]/efs-request";

/**
 * A public-only EFS Page projection. Every property is read through the effective property
 * cascade's public projection; no EntityID and no private declaration is rendered.
 */
export function EfsPageView({
  view,
  withShell = false,
}: {
  readonly view: EfsView;
  readonly withShell?: boolean;
}) {
  const publicProperties = view.properties.publicEntries();
  const valueOf = (key: string) => publicProperties.find((entry) => entry.key === key)?.value;
  const siteName = valueOf("brand.name");
  const logo = valueOf("brand.logo");
  const logoPath =
    typeof logo === "string" && logo.trim().length > 0 && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(logo.trim())
      ? assetUrl(view.binding, logo)
      : undefined;
  const address = valueOf("contact.address");
  const phone = valueOf("contact.phone");
  const openingHours = valueOf("openingHours");
  const rawMarkdown =
    view.source.format === "markdown"
      ? (view.source.body ?? "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
      : undefined;
  const document = view.source.format === "json" ? pageDocumentSchema.safeParse(view.source.data) : null;
  const fallbackBody =
    view.source.format === "json"
      ? typeof view.source.data.body === "string"
        ? view.source.data.body
        : typeof view.source.data.content === "string"
          ? view.source.data.content
          : undefined
      : undefined;

  const navItems = view.site.pages
    .filter((page) => (page.visibility ?? "public") === "public")
    .map((page) => {
      const representation =
        page.representations.find((candidate) => localePathKey(candidate.locale) === view.localeKey) ??
        page.representations.find((candidate) => candidate.locale === page.fallbackLocaleKey);
      if (!representation) return null;
      const label = page.properties?.["nav.label"];
      const route = page.route.length === 1 && page.route[0] === "home" ? [] : page.route;
      return {
        pageId: page.id,
        label: label?.public === true && typeof label.value === "string" ? label.value : page.id,
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
      {withShell ? null : (
        <header className="border-b border-neutral-200">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-5">
            <a
              href={`/${contentSegments(view.binding, {
                siteId: view.site.id,
                locale: view.locale,
                localeKey: view.localeKey,
                pageRoute: [],
              }).join("/")}`}
              className="flex items-center gap-3 font-semibold"
            >
              {logoPath ? (
                // The binding-derived owner URL is already owner-scoped.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPath} alt="" className="h-8 w-auto" />
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
      )}
      <main className="mx-auto max-w-3xl px-6 py-16">
        <article>
          {document?.success ? (
            <PageDocumentContent document={document.data} locale={view.locale} />
          ) : (
            <>
              <Heading level={1} tone="title">
                {typeof view.source.data.title === "string" ? view.source.data.title : view.page.id}
              </Heading>
              {rawMarkdown ? <SafeMarkdownContent markdown={rawMarkdown} className="mt-8" /> : null}
              {fallbackBody ? <SafeMarkdownContent markdown={fallbackBody} className="mt-8" /> : null}
            </>
          )}
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
