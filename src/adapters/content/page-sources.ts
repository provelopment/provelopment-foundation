/**
 * THE PAGE-SOURCES COMPOSITION — the ONE wiring of modes, readers and order
 * ======================================================================
 *
 * `@/application/page-source-resolution` decides WHICH source answers a request; this
 * adapter wires the concrete sources it chooses between and interprets the winner. It is
 * the composition boundary the routes and the sitemap consume, so no route reimplements
 * the precedence or the file layout.
 *
 *   `json`      `content/pages/json/<site>/<locale>/<route-path>.json` — read through the
 *               declarative reader (`./json-page`) and validated against the ONE document
 *               schema (`@/core/page-document`). The validated document is rendered by the
 *               declarative page composer, and an invalid document stops the build naming
 *               the file and the property.
 *   `markdown`  `content/pages/markdown/<site>/<locale>/<route-path>.md` — read through
 *               the authoring reader (`./authoring-page`) and rendered under the safe
 *               Markdown policy.
 *
 * `<site>` is a recognized lowercase site code (`ca`, `fr`, `ww`) and `<locale>` a lowercase
 * locale PATH KEY (`en`, `fr`, `fr-ca`) — the two segments the public URL is built from too.
 *
 * A `<route-path>` is one segment (`about`) or several
 * (`offerings/website-design`): a page's route mirrors the folders it is authored in
 * (`@/core/page-route-path`), and the declared precedence applies to the COMPLETE route
 * path, so a nested page resolves exactly as a top-level one does.
 *
 * ONE SITE PER CALL (FOUNDATION-S1)
 * --------------------------------
 * A page's identity is `site + locale + routePath`, and this composition is bound to ONE
 * site's tree per call. The readers are therefore built from that site's CODE alone, which
 * makes a cross-site lookup unrepresentable: `ca`'s page tree is never consulted while
 * answering for `fr`, not even when the locale path key matches. The site's OWN locale
 * policy — its supported locales, its default locale and its fallback switch — decides what
 * may answer, and a locale outside the site is not a page request at all.
 *
 * ONE AUTHORED TREE PER CALL (FOUNDATION-MULTISITE-S3E1B)
 * -----------------------------------------------------
 * The same holds one level up. `sites` says WHOSE pages may be served; `roots` says WHICH
 * authored tree is read. When `roots` is absent it is the ACTIVE deployment's tree — today's
 * behaviour, byte for byte. When a caller supplies a Spoke's roots (S3E1A `SpokeResourcePaths`),
 * every question below is asked of THAT tree alone, so two Spokes may hold the same site code,
 * the same locale and the same route without colliding, and neither can answer for the other.
 * This composition still serves ONE tree per call; choosing the Spoke is S3F's job, not this
 * adapter's.
 *
 * There is no third source and no compatibility fallback: a page comes from one of those
 * two roots, or it does not exist. `content/` holds THIS platform's pages and assets — no
 * file outside the two roots can be consulted for a page.
 *
 * PUBLICATION IS DECIDED BY CONFIGURATION, NOT BY DIRECTORIES: both entry points take the
 * deployment's RESOLVED SITES, so a site or locale directory nobody configured can never
 * produce a route, a sitemap entry or a served page — a directory's existence is not
 * publication.
 *
 * SERVABILITY AND PUBLICATION ARE TWO QUESTIONS ANSWERED SEPARATELY (TEMPLATE-PV-A1)
 * ---------------------------------------------------------------------------------
 * `listRoutes` answers what EXISTS in this tree — every one of those routes is SERVED, and `resolve` still
 * answers each of them. `listPublicRoutes` answers the narrower question ordinary discovery asks: which of
 * those routes PUBLISH themselves. A page whose own resolved source declares `visibility: "unlisted"` is
 * therefore served at its exact URL while no discovery surface advertises it — and because both questions are
 * asked of THIS composition, the precedence (JSON over Markdown), the Site's locale fallback and the document
 * schema are decided once, never re-decided by a caller that only wants to know how a page is published.
 */
import {
  authoringPageRoutesFor,
  authoringSourceDiscoveryFor,
  readAuthoringPageFile,
  type PageAuthoringRoots,
} from "./authoring-source-discovery";
import { parseAuthoringPageFile } from "./authoring-page";
import { parseJsonPageFile } from "./json-page";
import { resolvePageSource } from "@/application/page-source-resolution";
import {
  isUnlistedPage,
  pageVisibilityOf,
  type PageDocument,
  type PageVisibility,
} from "@/core/page-document";
import type { Locale } from "@/core/locale";
import type { PageAuthoringMode } from "@/core/page-source";
import type { SiteCode } from "@/core/site-code";
import { siteSupportsLocalePath, type ResolvedSite } from "@/core/site";

/**
 * One page ready to render — the winner of the declared precedence, in the shape its mode
 * produces. The two modes are the ONLY shapes: a page is safe Markdown with a body, or a
 * validated declarative document.
 */
export interface ResolvedMarkdownPage {
  readonly kind: "markdown";
  readonly siteId: SiteCode;
  /** The page's route path inside its site+locale directory, e.g. `offerings/website-design`. */
  readonly routePath: string;
  /**
   * The LOCALE PATH KEY that actually answered (which may be the site's default one standing
   * in) — the value the page's filesystem identity was spelled with.
   */
  readonly locale: Locale;
  /** True when the site's default locale answered for a different requested locale. */
  readonly fallback: boolean;
  readonly title: string;
  readonly body: string;
  /** An author-supplied summary, when the page declared one. */
  readonly description?: string;
}

export interface ResolvedJsonPage {
  readonly kind: "json";
  readonly siteId: SiteCode;
  readonly routePath: string;
  readonly locale: Locale;
  readonly fallback: boolean;
  readonly title: string;
  /** The validated declarative document, in authoring order. */
  readonly document: PageDocument;
  /**
   * HOW THIS PAGE PUBLISHES ITSELF (TEMPLATE-PV-A1), exactly as its OWN document declares it: `public` unless
   * the document says `unlisted`. It is carried on the RESOLVED page so a consumer never re-reads a file, never
   * re-decides precedence and never re-derives the default merely to learn how the page is published.
   */
  readonly visibility: PageVisibility;
  readonly description?: string;
}

export type ResolvedPage = ResolvedMarkdownPage | ResolvedJsonPage;

export interface PageSourcesOptions {
  /** The deployment's resolved sites. Only a declared site can publish anything. */
  readonly sites: readonly ResolvedSite[];
  /**
   * THE AUTHORED PAGE ROOTS THIS COMPOSITION READS (FOUNDATION-MULTISITE-S3E1B).
   *
   * Absent → the ACTIVE deployment's roots: exactly what every current runtime and build consumer
   * gets, and the only binding today's runtime resolves. Present → the caller has already CHOSEN a
   * Spoke and supplies that Spoke's `SpokeResourcePaths` (S3E1A), so this composition reads that
   * Spoke's tree alone. Both entry points behave identically either way; only the tree differs.
   */
  readonly roots?: PageAuthoringRoots | undefined;
}

export interface PageSources {
  /**
   * The page that answers `routePath` for `siteId` + `locale`, or `null` when no source of
   * THAT site does.
   *
   * Throws when a source EXISTS but cannot be interpreted — a malformed JSON file, a
   * document the schema refuses, unsupported Markdown metadata. The author must be told
   * rather than served something else.
   */
  resolve(siteCode: SiteCode, routePath: string, localePath: Locale): Promise<ResolvedPage | null>;
  /** The publishable page route paths for one configured site + locale (both modes, sorted). */
  listRoutes(siteCode: SiteCode, localePath: Locale): Promise<readonly string[]>;
  /**
   * THE PUBLIC ROUTES of one configured site + locale (TEMPLATE-PV-A1): every route `listRoutes` reports,
   * MINUS the pages whose own resolved source declares `visibility: "unlisted"`.
   *
   * THE INVENTORY ORDINARY DISCOVERY USES. A sitemap reads this one, so an unlisted page is served at its
   * exact URL while nothing advertises it — and `listRoutes` keeps its existing meaning (what EXISTS in the
   * tree) for callers that need existence rather than publication.
   */
  listPublicRoutes(siteCode: SiteCode, localePath: Locale): Promise<readonly string[]>;
  /**
   * WHETHER THE SOURCE THAT WOULD ANSWER ONE ROUTE PUBLISHES ITSELF (TEMPLATE-PV-A1)
   * ===============================================================================
   *
   * `listPublicRoutes` answers the inventory question; this answers the SAME question about ONE route path,
   * which is what a caller that ALREADY KNOWS its route needs — a discovery surface whose URL comes from
   * CONFIGURATION (a regional landing or a configured regional page) rather than from a directory listing.
   * Such a caller asks here instead of assembling a second inventory, so a URL is never taken apart to guess
   * which document answers it.
   *
   * ASKED OF `resolve`, so the answer is this composition's own: JSON over Markdown, the Site's locale
   * fallback and the document schema are all included, and no consumer can hold a second opinion.
   */
  isUnlistedRoute(siteCode: SiteCode, routePath: string, localePath: Locale): Promise<boolean>;
}

export function createPageSources(options: PageSourcesOptions): PageSources {
  const { sites, roots } = options;

  /**
   * WHICH AUTHORED TREE this composition reads (S3E1B): `null` → the ACTIVE deployment's, through
   * the legacy entry points exactly as today; otherwise the capability bound to the supplied roots.
   * Everything else below is shared, so a rule can never be true for one tree and false for another.
   */
  const discovery = roots === undefined ? null : authoringSourceDiscoveryFor(roots);

  /** One mode's route paths for this site + locale, read from THIS tree. */
  const pageRoutesOf = (
    mode: PageAuthoringMode,
    siteCode: SiteCode,
    localePath: Locale,
  ): Promise<readonly string[]> =>
    discovery === null
      ? authoringPageRoutesFor(mode, siteCode, localePath)
      : discovery.pageRoutesFor(mode, siteCode, localePath);

  /** One candidate locale's raw source for this route, read from THIS tree. */
  const sourceTextOf = (
    mode: PageAuthoringMode,
    siteCode: SiteCode,
    localePath: Locale,
    routePath: string,
  ): Promise<string | null> =>
    discovery === null
      ? readAuthoringPageFile(mode, siteCode, localePath, routePath)
      : discovery.readPageFile(mode, siteCode, localePath, routePath);

  /** The declared site with this code, or null — an undeclared site serves nothing. */
  const siteOf = (siteCode: SiteCode): ResolvedSite | null =>
    sites.find((site) => site.code === siteCode) ?? null;

  /**
   * Only a CONFIGURED (site, locale) pair can be served. A locale path key outside the site's
   * own set is not a page request — and it is never satisfied by another site.
   */
  const isPublished = (site: ResolvedSite, localePath: Locale): boolean =>
    siteSupportsLocalePath(site, localePath);

  // Named, because the two publication operations below ask EACH OTHER: `listPublicRoutes` filters with
  // `isUnlistedRoute`, the ONE spelling of the question — so a directory listing and a configuration-driven
  // surface can never disagree about whether a page publishes itself.
  const sources: PageSources = {
    async resolve(siteCode, routePath, localePath) {
      const site = siteOf(siteCode);
      if (site === null || !isPublished(site, localePath)) return null;

      const resolved = await resolvePageSource<string>(
        // The SITE's own locale policy travels with the request: its default locale and its
        // fallback switch. The deployment's defaults play no part, so a fallback can only
        // ever come from inside this site — never from another site's tree.
        {
          siteId: site.code,
          routePath,
          locale: localePath,
          defaultLocale: site.defaultLocale,
          fallback: site.fallback,
        },
        {
          // Availability only — each provider answers "this locale contributes a source"
          // with the RAW source, and interpretation happens below. The providers are bound
          // to THIS site's code, which is what a cross-site answer would have to bypass.
          json: (candidate) => sourceTextOf("json", site.code, candidate, routePath),
          markdown: (candidate) => sourceTextOf("markdown", site.code, candidate, routePath),
        },
      );
      if (resolved === null) return null;

      if (resolved.kind === "json") {
        const page = parseJsonPageFile(resolved.source, site.code, routePath, resolved.locale);
        return {
          kind: "json",
          siteId: site.code,
          routePath,
          locale: resolved.locale,
          fallback: resolved.fallback,
          title: page.title,
          document: page.document,
          visibility: pageVisibilityOf(page.document),
          ...(page.description === undefined ? {} : { description: page.description }),
        };
      }

      const page = parseAuthoringPageFile(resolved.source, routePath, resolved.locale);
      return {
        kind: "markdown",
        siteId: site.code,
        routePath,
        locale: resolved.locale,
        fallback: resolved.fallback,
        title: page.title,
        body: page.body,
        ...(page.description === undefined ? {} : { description: page.description }),
      };
    },

    async listRoutes(siteCode, localePath) {
      const site = siteOf(siteCode);
      if (site === null || !isPublished(site, localePath)) return [];

      const [markdown, json] = await Promise.all([
        pageRoutesOf("markdown", site.code, localePath),
        pageRoutesOf("json", site.code, localePath),
      ]);

      return [...new Set([...markdown, ...json])].sort();
    },

    /**
     * THE PUBLIC INVENTORY — SERVABILITY AND DISCOVERABILITY, SEPARATED HERE (TEMPLATE-PV-A1)
     * ======================================================================================
     *
     * `listRoutes` answers what EXISTS in this tree and is unchanged: a route it reports is still served, and
     * `resolve` still answers it — unlisted pages included, at their exact URL alone. This operation answers the
     * narrower question ordinary discovery asks: which of those routes PUBLISH THEMSELVES.
     *
     * The decision is delegated to `resolve`, deliberately, so it is made by the ONE authority on precedence
     * (JSON over Markdown), on the Site's locale fallback and on the document schema — never by a filename
     * convention and never by a second inventory. A route is therefore excluded exactly when the source that
     * would ACTUALLY ANSWER it declares `visibility: "unlisted"`, which is what keeps a Markdown page from
     * hiding a JSON one that wins over it.
     *
     * Two behaviours are preserved on purpose:
     *
     *   · a route that does not resolve stays listed, exactly as it is listed today — this operation never turns
     *     a previously advertised route into a missing one;
     *   · a file that exists but cannot be interpreted still fails LOUDLY, naming the file, because `resolve` is
     *     asked rather than a raw text read.
     *
     * The reserved home route is an ordinary route here: it is served by a locale root, which is a Site's own
     * identity URL and every sitemap publishes it, so an unlisted home document is refused outright when it is
     * read (`@/adapters/content/json-page`) rather than silently hiding a Site root.
     */
    async listPublicRoutes(siteCode, localePath) {
      const routes = await sources.listRoutes(siteCode, localePath);
      const publicRoutes: string[] = [];

      for (const routePath of routes) {
        // ONE spelling of the question, through the operation every caller can ask.
        if (!(await sources.isUnlistedRoute(siteCode, routePath, localePath))) {
          publicRoutes.push(routePath);
        }
      }

      return publicRoutes;
    },

    /**
     * WHETHER ONE ROUTE'S OWN RESOLVED SOURCE IS UNLISTED (TEMPLATE-PV-A1)
     * ===================================================================
     *
     * The narrowest useful form of the publication question, and the ONE place it is decided: a route is
     * unlisted exactly when the source that would ACTUALLY ANSWER it is a declarative document declaring
     * `visibility: "unlisted"` — JSON over Markdown, the Site's locale fallback and the document schema all
     * included, because `resolve` is what answers. Everything else (no source at all, a Markdown page, a
     * document that declares nothing or says `public`) is NOT unlisted.
     */
    async isUnlistedRoute(siteCode, routePath, localePath) {
      const page = await sources.resolve(siteCode, routePath, localePath);
      return page !== null && page.kind === "json" && isUnlistedPage(page.document);
    },
  };

  return sources;
}
