import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createDirectionLinkResolver } from "@/adapters/maps";
import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { MarkdownContent } from "@/components/site/markdown-content";
import { Section } from "@/components/ui/section";
import { Heading } from "@/components/ui/heading";
import { ResolvedRegionBlock } from "@/components/site/region-block";
import { RegionStructuredData } from "@/components/site/region-structured-data";
import { siteConfig } from "@/config";
import { resolveRegionalPageContext } from "@/application/page-context";
import { buildLanguageAlternates } from "@/core/locale";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { regionsForLocale, regionalPath, buildRegionalLanguageAlternates } from "@/core/regional-pages";
import { buildOpenGraphData, buildTwitterData, resolveOgImageUrl } from "@/core/seo-metadata";

const pageContentRepository = createFileSystemPageContentRepository({
  defaultLocale: siteConfig.defaultLocale,
});

// Composition boundary (identical pattern to the app factories): the maps
// factory selects the directions adapter from validated configuration.
const directionLinkResolver = createDirectionLinkResolver(siteConfig.mapsFeature);

const localeCodes = siteConfig.locales.map((locale) => locale.code);

/**
 * Content slugs served by their own static routes and therefore never
 * generated here (`about`, `contact`, `resources`). New static page routes,
 * when added, must be listed here too so there is exactly one page
 * architecture: static routes keep precedence; `[item]` serves regional
 * landings and the remaining flat content pages.
 *
 * `HOME_CONTENT_SLUG` is reserved for the same reason: a site's home page may be
 * authored as ordinary content, but it is served by the locale-root route
 * (`/{locale}`) — never as `/{locale}/home`. The slug is imported from the ONE
 * authority (`@/core/page-content`) so this list, the home route and the sitemap
 * cannot drift.
 */
const STATIC_ROUTE_SLUGS: ReadonlySet<string> = new Set([
  HOME_CONTENT_SLUG,
  "about",
  "connect",
  "contact",
  "resources",
  // Phase T: dedicated collection routes (dedicated directories already take
  // precedence; listed here so a future content-page file with the same slug
  // can never double-route).
  "testimonials",
  "portfolio",
  "blog",
  "offerings",
]);

/**
 * Phase L — segment two dispatch: `/{locale}/{item}`.
 *
 *  - When `item` is a configured REGION LANDING for the locale (a landing
 *    entry `{ locale, region }`), this renders the regional home: the locale's
 *    flat content file for the region (`content/pages/{locale}/{region}.md`)
 *    plus the region's complete operational identity.
 *  - Otherwise it is the flat non-regional content page (Phase K behavior):
 *    `content/pages/{locale}/{item}.md` with no operational identity.
 *
 * Region availability is configuration-driven; an unknown `item` renders the
 * 404 (`dynamicParams`).
 */
export const dynamicParams = false;

interface ItemPageProps {
  readonly params: Promise<{ readonly locale: string; readonly item: string }>;
}

export async function generateStaticParams(): Promise<{ locale: string; item: string }[]> {
  const params: { locale: string; item: string }[] = [];
  for (const locale of siteConfig.locales) {
    // Flat non-regional content pages (Phase K behavior).
    const slugs = await pageContentRepository.listSlugs(locale.code);
    for (const slug of slugs) {
      if (STATIC_ROUTE_SLUGS.has(slug)) continue;
      if (regionsForLocale(siteConfig.pageBindings, locale.code).includes(slug)) continue;
      params.push({ locale: locale.code, item: slug });
    }

    // Regional landing pages `/{locale}/{region}`.
    for (const region of regionsForLocale(siteConfig.pageBindings, locale.code)) {
      params.push({ locale: locale.code, item: region });
    }
  }
  return params;
}

function isRegionalLanding(locale: string, item: string): boolean {
  return regionsForLocale(siteConfig.pageBindings, locale).includes(item);
}

export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const { locale, item } = await params;
  const content = await pageContentRepository.findBySlug(item, locale);
  if (!content) return {};

  const title = content.title;
  const ogImage = resolveOgImageUrl(siteConfig.assets?.ogImage, siteConfig.url, locale);

  if (isRegionalLanding(locale, item)) {
    const alternates = buildRegionalLanguageAlternates({
      baseUrl: siteConfig.url,
      locales: localeCodes,
      defaultLocale: siteConfig.defaultLocale,
      entries: siteConfig.pageBindings,
      region: item,
      slug: null,
    });
    const canonical = `${siteConfig.url}${regionalPath(locale, item, null)}`;
    return {
      title,
      description: siteConfig.description,
      alternates: {
        canonical,
        languages: Object.keys(alternates).length > 0 ? alternates : undefined,
      },
      openGraph: buildOpenGraphData({
        baseUrl: siteConfig.url,
        siteName: siteConfig.name,
        locale,
        title,
        fallbackDescription: siteConfig.description,
        url: canonical,
        imageUrl: ogImage,
        alternateLocales: localeCodes.filter((code) => code !== locale),
      }),
      twitter: buildTwitterData({
        title,
        fallbackDescription: siteConfig.description,
        imageUrl: ogImage,
      }),
    };
  }

  // Flat content page: content falls back to the default locale, so every
  // configured locale that renders this slug is a valid alternate.
  const canonical = `${siteConfig.url}/${locale}/${item}`;
  return {
    title,
    description: siteConfig.description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
        path: `/${item}`,
      }),
    },
    openGraph: buildOpenGraphData({
      baseUrl: siteConfig.url,
      siteName: siteConfig.name,
      locale,
      title,
      fallbackDescription: siteConfig.description,
      url: canonical,
      imageUrl: ogImage,
      alternateLocales: localeCodes.filter((code) => code !== locale),
    }),
    twitter: buildTwitterData({
      title,
      fallbackDescription: siteConfig.description,
      imageUrl: ogImage,
    }),
  };
}

export default async function ItemPage({ params }: ItemPageProps) {
  const { locale, item } = await params;
  const content = await pageContentRepository.findBySlug(item, locale);
  if (!content) notFound();

  const regionId = isRegionalLanding(locale, item) ? item : null;
  const context = resolveRegionalPageContext(
    { regions: siteConfig.regions },
    locale,
    regionId,
    null,
  );

  return (
    <Section as="article">
      <Heading level={1} tone="title">{content.title}</Heading>
      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
      </div>

      {context.region ? (
        <>
          <ResolvedRegionBlock
            region={context.region}
            locale={locale}
            directionLinkResolver={directionLinkResolver}
          />
          <RegionStructuredData
            region={context.region}
            canonicalUrl={`${siteConfig.url}/${regionalPath(locale, item, null)}`}
          />
        </>
      ) : null}
    </Section>
  );
}



