import { PageDocumentContent } from "@/components/site/page-document-content";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { Heading } from "@/components/ui/heading";
import { publicContactLinkResolver } from "@/adapters/connect/public-contact";
import { EfsContactForm } from "@/components/efs/efs-contact-form";
import { EfsScheduleStatus } from "@/components/efs/efs-schedule-status";
import { assetUrl } from "@/core/efs/publication";
import { publicScheduleInputs } from "@/core/efs/opening-schedule";

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
  /**
   * COMPUTED OPENING STATUS (`D40` Decision A).
   *
   * `null` unless BOTH `openingSchedule` and `timezone` are effectively authored AND publicly
   * projected. Absence, privacy and `null` suppression all yield `null` — and therefore no
   * open/closed assertion anywhere in the output — which is the decision's whole point.
   */
  const scheduleInputs = publicScheduleInputs(view.properties);
  const rawMarkdown =
    view.source.format === "markdown"
      ? (view.source.body ?? "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
      : undefined;
  const document = view.source.document;

  /**
   * THE APPLICATION LINK CONTEXT FOR THIS ONE RENDER (A9).
   *
   * Built here, from the request's OWN verified context, and passed down as an argument — never stored,
   * never cached, never module-global. Everything it reads was already proved by Foundation's
   * resolution of this request:
   *
   *  - `runtimeSegment` — the collision-free runtime identity of the OWNING Spoke;
   *  - `entity.id` / `site.id` — the verified EFS Entity and Site being rendered;
   *  - `binding.aliasOf ?? binding.id` — the CANONICAL binding, so an alias serves exactly the
   *    authorization its canonical route holds (rendering and submission therefore agree);
   *  - `siteConfig.communication` — the Spoke's own validated configuration, carried through
   *    `parseSiteConfig`, keyed by EFS Site id.
   *
   * The publisher identity is supplied only when this Installation identifies its Hubs: then a Spoke is
   * a distinguishable publisher and an author can name it. Without Hub identification there is one
   * publisher and nothing to disambiguate, so no identity is invented to fill the field.
   */
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

  const navItems = view.navigation ?? [];

  return (
    <>
      {withShell ? null : (
        <header className="border-b border-neutral-200">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-5">
            <a
              href={navItems.find((item) => item.pageId === "home")?.href ?? view.canonical}
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
          {document !== undefined ? (
            <PageDocumentContent
              document={document}
              locale={view.locale}
              resolveLink={resolveLink}
              renderContactForm={(formRef) => <EfsContactForm view={view} formRef={formRef} />}
            />
          ) : (
            <>
              <Heading level={1} tone="title">
                {typeof view.source.data.title === "string" ? view.source.data.title : view.page.id}
              </Heading>
              {rawMarkdown ? <SafeMarkdownContent markdown={rawMarkdown} className="mt-8" /> : null}
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
            {scheduleInputs === null ? null : (
              <div>
                <dt className="font-semibold">Open now</dt>
                <dd>
                  <EfsScheduleStatus
                    schedule={scheduleInputs.schedule}
                    timeZone={scheduleInputs.timeZone}
                    labels={{ open: "Open now", closed: "Closed now" }}
                  />
                </dd>
              </div>
            )}
          </dl>
          {withShell ? null : (
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
          )}
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
