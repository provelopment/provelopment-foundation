import type { Metadata } from "next";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { createBookingActionResolver } from "@/adapters/booking";
import { BookingAction } from "@/components/site/booking-action";
import { MarkdownContent } from "@/components/site/markdown-content";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { buildLanguageAlternates } from "@/core/locale";
import { buildOpenGraphData, buildTwitterData, resolveOgImageUrl } from "@/core/seo-metadata";

const localeCodes = siteConfig.locales.map((locale) => locale.code);

// Composition boundary: the factory selects the booking adapter from validated
// configuration. A disabled (or absent) booking feature resolves to `none` and
// the CTA simply does not render.
const bookingActionResolver = createBookingActionResolver(siteConfig.bookingFeature);

/**
 * The home page is CONTENT-FIRST and OPTIONAL.
 *
 * A site may author its home page as ordinary content —
 * `content/pages/<locale>/home.md` — and this route renders it through the SAME
 * content repository every other page uses (same trust boundary, same Markdown
 * treatment, same per-locale fallback). A site that authors no `home.md` keeps
 * the generic configuration-driven starter homepage below, unchanged.
 *
 * The reserved slug lives in `@/core/page-content` so this route, the `[item]`
 * route and the sitemap cannot drift: `/{locale}/home` is never generated and
 * never advertised, because the home page's real URL is the locale root.
 *
 * Metadata stays configuration-driven (site name + description) for the home
 * route in both cases — the authored title renders as the page's `h1`, exactly
 * as the other content routes render theirs.
 */
const homeContentRepository = createFileSystemPageContentRepository({
  defaultLocale: siteConfig.defaultLocale,
});

interface HomePageProps {
  readonly params: Promise<{ readonly locale: string }>;
}

export async function generateMetadata({
  params,
}: HomePageProps): Promise<Metadata> {
  const { locale } = await params;

  const canonical = `${siteConfig.url}/${locale}`;
  const ogImage = resolveOgImageUrl(siteConfig.assets?.ogImage, siteConfig.url, locale);
  const title = siteConfig.name;

  return {
    // No explicit `title`: the layout default/template renders the site name
    // alone (never "Name | Name").
    description: siteConfig.description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
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

export default async function HomePage({
  params,
}: HomePageProps) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);

  // CONTENT-FIRST: an authored `content/pages/<locale>/home.md` supplies the
  // locale-root homepage through the normal content repository. Absent → the
  // generic starter homepage below renders exactly as it always has, so a site
  // that authors no home page is unaffected.
  const authoredHome = await homeContentRepository.findBySlug(HOME_CONTENT_SLUG, locale);
  if (authoredHome) {
    return (
      <Section as="article">
        <Heading level={1} tone="title">
          {authoredHome.title}
        </Heading>
        <div className="mt-6">
          <MarkdownContent markdown={authoredHome.body} />
        </div>
      </Section>
    );
  }

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
              action={bookingActionResolver.resolve({ locale })}
              label={dictionary.booking.book}
            />
          ) : null}
        </div>
      </header>

      <section
        aria-labelledby="home-about-heading"
        className="mx-auto max-w-page px-4 pb-16"
      >
        <div className="home-card rounded-lg border border-border bg-muted p-6">
          <Heading level={2} tone="section" id="home-about-heading">
            {dictionary.sections.about}
          </Heading>
          <p className="mt-2 text-muted-foreground">
            {dictionary.home.description}
          </p>
        </div>
      </section>
    </>
  );
}

