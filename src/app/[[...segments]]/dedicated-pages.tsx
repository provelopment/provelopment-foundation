import type { ReactNode } from "react";
import type { PageLinkResolver } from "@/core/page-document";
import type { BookingActionResolver } from "@/application/booking-action";
import type { ResolvedPage } from "@/adapters/content/page-sources";
import { BookingAction } from "@/components/site/booking-action";
import { connectMethodLabel } from "@/components/site/connect-method-label";
import { connectivityIcon } from "@/components/site/connectivity-links";
import { ContactForm } from "@/components/site/contact-form";
import { PageDocumentContent } from "@/components/site/page-document-content";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Grid } from "@/components/ui/grid";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import type { RuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import type { RuntimeDictionaryAccess } from "@/config/runtime-dictionaries";
import type { SiteConfig } from "@/config/site-config";
import { resolveSiteNotice } from "@/core/notice";

/**
 * THE DEDICATED PAGE CHROME (S1); CONTEXT-BOUND INPUTS (FOUNDATION-MULTISITE-M13)
 * ===============================================================================
 *
 * Two URLs carry specialised chrome rather than the generic page frame — `/connect` (the
 * connectivity inventory) and `/contact` (the contact form) — and a site with no authored home
 * page keeps the configuration-driven starter homepage. All three are ordinary pages at the
 * SOURCE level (authored under `content/pages/<siteId>/<locale>/…` like any other), resolved by
 * the SAME page-source composition the route uses.
 *
 * They live HERE rather than as sibling route files because a site-scoped URL space
 * (`/{sitePrefix}/{locale}/…`) cannot express them as static routes: their URL carries no fixed
 * number of leading segments. Nothing here decides where a page comes from — each component
 * renders a page the route already resolved, inside ONE site's context.
 *
 * M13 — THE CHROME'S FACTS ARE INPUTS: the rendering context's configuration, its dictionary
 * answers and its asset resolver (for the connectivity-icon screening) arrive from the shared
 * composition, so these pages cannot read another Spoke's configuration. The booking-action
 * resolver is likewise built from the SAME context's configuration by the composition.
 *
 * R2 — ONE INTRODUCTORY NOTICE PER PAGE, IF THE SPOKE SAYS SO. Both pages used to add their own
 * introductory demonstration notice on top of the site-wide banner, so a visitor read the same warning twice.
 * A Spoke whose presented notice declares `replacesDemoNotices: true` (see `@/core/notice`) now renders that
 * banner as the ONE introductory notice and neither page adds one of its own. A Spoke that declares nothing —
 * every existing installation — keeps both notices exactly as they were, and a Spoke with NO notice keeps
 * them too, because there would be nothing to replace them with. This is an INTRODUCTORY notice only:
 * the contact form's submission feedback, its validation errors and its accessibility wiring are operational
 * and stay untouched.
 */
interface DedicatedPageChrome {
  readonly locale: string;
  readonly siteId?: string;
  /** The rendering context's configuration (never a module-global). */
  readonly siteConfig: SiteConfig;
  /** The same context's dictionary answers. */
  readonly dictionaryAccess: RuntimeDictionaryAccess;
  /** The same context's asset resolver — connectivity icons are screened against ITS namespaces. */
  readonly assets: RuntimeAssetOwnershipResolver;
}

/**
 * THE AUTHORED SOURCE A DEDICATED PAGE RENDERS — ONE SHAPE, TWO PROVENANCES (GEO-04 C09-R08).
 *
 * The Connect and Contact chrome never needed a whole `ResolvedPage`: they read the page's authored
 * KIND and then either its Markdown body or its already-validated JSON document. Naming exactly those
 * two facts lets the SAME specialised composition serve
 *
 *   - the legacy route, whose source is a `ResolvedPage` (which structurally satisfies this), and
 *   - an EFS request, whose source is an `EfsPageSource` for a DECLARED EFS Page,
 *
 * without casting one object type into the other, without a second card renderer and without a fake
 * `ResolvedPage`. Nothing about the page's identity is inferred here: the caller has already resolved
 * and authorized the Page, its representation and its owning Spoke.
 */
export type ConnectAuthoredPage =
  | Pick<Extract<ResolvedPage, { kind: "markdown" }>, "kind" | "body">
  | Pick<Extract<ResolvedPage, { kind: "json" }>, "kind" | "document">;

/** The one URL leaf whose chrome is the connectivity inventory (`./server-composition` dispatches on it). */
export const CONNECT_PAGE_ROUTE_PATH = "connect";

/**
 * R2 — DOES THIS SPOKE'S PRESENTED NOTICE STAND IN FOR THE PAGE-LEVEL INTRODUCTORY NOTICES?
 *
 * ONE question, answered ONCE, by the SAME pure resolver the shell uses to compose the banner
 * (`@/core/notice`), so the banner's decision and this page chrome's decision cannot drift: both read the
 * resolved notice, never the raw configuration. A Spoke with no notice — or one that does not opt in —
 * answers `false`, and every page-level notice keeps rendering.
 */
function replacesIntroductoryNotices(siteConfig: SiteConfig): boolean {
  return resolveSiteNotice(siteConfig.siteNotice)?.replacesDemoNotices === true;
}

/** The Connect page: the dictionary heading, the authored body, the configured methods. */
export function ConnectPageContent({
  locale,
  siteId,
  page,
  siteConfig,
  dictionaryAccess,
  assets,
  resolveRoute,
  resolveLink,
  renderContactForm,
}: DedicatedPageChrome & {
  readonly page: ConnectAuthoredPage;
  /**
   * THE PER-RENDER EFS AUTHORITIES, WHEN THIS PAGE IS AN EFS PAGE (GEO-04 C09-R09).
   *
   * Optional on purpose: the released legacy `/connect` caller passes none of them, so its JSON pages
   * keep the pre-EFS locale-first behavior EXACTLY as before. An EFS Connect caller supplies the
   * shared `efsPageLinkContext` answers — the same ones the generic EFS view uses — so an authored
   * `route` reaches the binding-owned address and an authored application `link` is resolved by the
   * verified EFS owner, instead of falling back to `/<locale>/<route>` and 404ing.
   */
  readonly resolveRoute?: (routePath: string) => string | null;
  readonly resolveLink?: PageLinkResolver;
  readonly renderContactForm?: (formRef: string) => ReactNode;
}) {
  const dictionary = dictionaryAccess.get(locale, siteId ?? siteConfig.defaultSite.code);
  const replacesNotice = replacesIntroductoryNotices(siteConfig);

  return (
    <Section as="article">
      <Heading level={1} tone="title">
        {dictionary.connect.heading}
      </Heading>
      <div className="mt-6">
        {page.kind === "markdown" ? (
          <SafeMarkdownContent markdown={page.body} />
        ) : (
          // A JSON page authored for `/connect` supplies its sections; this page keeps its own
          // heading (the interface dictionary owns the h1), so the document's title is metadata
          // rather than a second page-level heading.
          <PageDocumentContent
            document={page.document}
            locale={locale}
            withTitle={false}
            {...(resolveRoute === undefined ? {} : { resolveRoute })}
            {...(resolveLink === undefined ? {} : { resolveLink })}
            {...(renderContactForm === undefined ? {} : { renderContactForm })}
          />
        )}
      </div>

      <Grid columns="sm:grid-cols-2" gap="gap-4" className="mt-8">
        {siteConfig.connect?.methods.map((method) => {
          const label = connectMethodLabel(dictionary, method);
          return (
            <li
              key={method.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <AssetIcon
                  asset={connectivityIcon(method.icon, assets.availableIconUrl)}
                  className="ui-nav-item-icon"
                />
                <span className="min-w-0 break-words">{label}</span>
                {method.demoOnly ? (
                  <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                    {dictionary.connect.demoBadge}
                  </span>
                ) : null}
              </span>
              <a
                href={method.href}
                {...(method.href.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" })}
                className="text-sm font-medium text-primary hover:underline"
              >
                {label}
              </a>
            </li>
          );
        })}
      </Grid>

      {replacesNotice ? null : (
        <p className="mt-8 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          {dictionary.connect.demoNotice}
        </p>
      )}
    </Section>
  );
}

/** The Contact page: the dictionary heading, the authored body, the configured form. */
export function ContactPageContent({
  locale,
  siteId,
  page,
  siteConfig,
  dictionaryAccess,
}: DedicatedPageChrome & { readonly page: ResolvedPage }) {
  const dictionary = dictionaryAccess.get(locale, siteId ?? siteConfig.defaultSite.code);
  const config = siteConfig.contactFeature;
  const demoMode = config?.provider === "stub";
  // R2 — an adopter that declares its notice stands in for the page-level introductory notices gets ONE
  // notice per page, never a second card here. The FORM is untouched: `config` still decides the provider, and
  // the form's own submission feedback (`unconfiguredDemo`) is operational, not introductory.
  const replacesNotice = replacesIntroductoryNotices(siteConfig);

  return (
    <Section as="article">
      <Heading level={1} tone="title">
        {dictionary.contact.heading}
      </Heading>

      {demoMode && !replacesNotice ? (
        <p className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          {dictionary.contact.demoNotice}
        </p>
      ) : null}

      <div className="mt-6">
        {page.kind === "markdown" ? (
          <SafeMarkdownContent markdown={page.body} />
        ) : (
          <PageDocumentContent document={page.document} locale={locale} withTitle={false} />
        )}
      </div>
      <div className="mt-8">
        <ContactForm config={config} locale={locale} dict={dictionary.contact} />
      </div>
    </Section>
  );
}

/**
 * The generic starter homepage: configuration + dictionary copy, rendered ONLY when the site
 * authors no home page of its own. Authoring one is optional and changes nothing else.
 */
export function StarterHome({
  locale,
  siteId,
  siteConfig,
  dictionaryAccess,
  bookingActions,
}: Omit<DedicatedPageChrome, "assets"> & { readonly bookingActions: BookingActionResolver }) {
  const dictionary = dictionaryAccess.get(locale, siteId ?? siteConfig.defaultSite.code);

  return (
    <>
      <header className="home-hero mx-auto max-w-page px-4 pt-16 pb-10">
        <div className="home-hero-copy">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            {siteConfig.name}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            {dictionary.home.tagline}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            {dictionary.home.description}
          </p>
        </div>
        <div className="home-hero-actions mt-6">
          {dictionary.booking?.book ? (
            <BookingAction
              action={bookingActions.resolve({ locale })}
              label={dictionary.booking.book}
            />
          ) : null}
        </div>
      </header>

      <section aria-labelledby="home-about-heading" className="mx-auto max-w-page px-4 pb-16">
        <div className="home-card rounded-lg border border-border bg-muted p-6">
          <Heading level={2} tone="section" id="home-about-heading">
            {dictionary.sections.about}
          </Heading>
          <p className="mt-2 text-muted-foreground">{dictionary.home.description}</p>
        </div>
      </section>
    </>
  );
}
