import { PageDocumentContent } from "@/components/site/page-document-content";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { Heading } from "@/components/ui/heading";
import { EfsPageStructuredData, efsPageLinkContext } from "@/components/efs/efs-page-links";
import { EfsScheduleStatus, type EfsScheduleStatusLabels } from "@/components/efs/efs-schedule-status";
import { assetUrl } from "@/core/efs/publication";
import { ownerAssetReference } from "@/core/efs/public-facts";
import { publicScheduleInputs } from "@/core/efs/opening-schedule";

import type { EfsView } from "@/app/[[...segments]]/efs-request";

/**
 * A public-only EFS Page projection. Every property is read through the effective property
 * cascade's public projection; no EntityID and no private declaration is rendered.
 */
export function EfsPageView({
  view,
  withShell = false,
  statusLabels,
}: {
  readonly view: EfsView;
  readonly withShell?: boolean;
  /**
   * Localized status labels from the ESTABLISHED locale/dictionary authority
   * (`dictionary.business`), resolved by the caller for this Page's published representation.
   * Absent means no dictionary binding was available, in which case NO status is rendered at all —
   * never an English default and never a Site-derived language guess.
   */
  readonly statusLabels?: EfsScheduleStatusLabels;
}) {
  const publicProperties = view.properties.publicEntries();
  const valueOf = (key: string) => publicProperties.find((entry) => entry.key === key)?.value;
  const siteName = valueOf("brand.name");
  const logo = valueOf("brand.logo");
  /**
   * `D40` Decision C (`R04-C31`) — the SAME form check the shared shell applies, so the shell-free document
   * and the shelled one can never disagree about whether the declared reference is publishable artwork. A
   * reference that is not owner-bound (an absolute URL, a traversal, an encoded separator) publishes nothing
   * — never the configured artwork, and never another owner's.
   */
  const logoReference = ownerAssetReference(typeof logo === "string" ? logo : undefined);
  const logoPath = logoReference === undefined ? undefined : assetUrl(view.binding, logoReference);
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
  const { resolveRoute, resolveLink, renderContactForm } = efsPageLinkContext(view);

  const navItems = view.navigation ?? [];

  /**
   * THE PAGE-ROUTE DESTINATION FOR THIS ONE RENDER (GEO-04 C09-R06).
   *
   * An authored `route` names another Page of THIS site, so its address is the address this very request
   * is served under: the effective binding's public base (prefix, Site selector when open), the qualified
   * locale key, then the declared route — which is exactly what `contentSegments` already computes for
   * `canonicalUrl`, the navigation and the `og:image` root. Nothing new is inferred here: no Site code, no
   * presentation key, no language guess, no visitor Host, no second publication authority, no cache.
   *
   * The authored route is validated by the ONE route grammar (`pageRoutePathSegments`), which also gives
   * D43's casing normalization for free (the builder folds the segments). A route the grammar refuses —
   * an empty, absolute, traversal-shaped or over-deep value — answers `null`, and the caller renders the
   * label alone rather than a broken anchor.
   */
  // `resolveRoute` comes from the shared per-render context above — the SAME authority the specialised
  // Connect presentation uses, so no EFS renderer can disagree with another about a Page's address.

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
              resolveRoute={resolveRoute}
              renderContactForm={renderContactForm}
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
            {scheduleInputs === null || statusLabels === undefined ? null : (
              <div>
                <dt className="font-semibold">{statusLabels.hoursLabel}</dt>
                <dd>
                  <EfsScheduleStatus
                    schedule={scheduleInputs.schedule}
                    timeZone={scheduleInputs.timeZone}
                    labels={statusLabels}
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
          <EfsPageStructuredData view={view} />
        </article>
      </main>
    </>
  );
}
