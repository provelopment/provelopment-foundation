import { OPEN_GRAPH_IMAGE_SEGMENT } from "@/config/efs/image-path";

/**
 * THE EFS OPEN GRAPH IMAGE MODEL (`GEO-03` R04-C21)
 * =================================================
 *
 * ONE pure composition step that turns already-resolved, already-authorized EFS facts into the three
 * texts the shared social image draws. It reads no manifest, no file, no request and no framework call, so
 * two publications can be compared before a single pixel is rendered — and it cannot become a second
 * ownership authority, because every field it receives was resolved by the EFS chain that resolves Pages.
 *
 * THE FACTS IT REFUSES. The image is a *public* artefact, so the model refuses rather than degrades:
 *
 *   · no usable brand name        → `null`. `brand.name` reaches here through `D40` Decision C's resolver, so
 *                                   a PRIVATE or SUPPRESSED declaration arrives as `undefined` and is NOT
 *                                   replaced by the Spoke's configured name. A card that silently relabels a
 *                                   business which chose privacy is worse than no card, and the Page that
 *                                   advertises it refuses in the same state.
 *   · a canonical URL that is not absolute `https` → `null`: the image must never be advertised from an
 *                                   origin we cannot state, and a relative URL is a broken card.
 *
 * THE FACTS IT DOES NOT REFUSE. The tagline falls back from the representation's own description to its own
 * title and then to the empty string, because the *brand* is what makes the card truthful; a missing
 * sentence is a thinner card, not a false one. Keeping the refusal set to exactly one condition is also
 * what keeps the HTML and the endpoint in agreement (`efsOpenGraphImage` uses the same predicate).
 */

/** The presentation-neutral content the shared image view draws (structurally `OpenGraphImageContent`). */
export interface EfsOpenGraphImageContent {
  /** The owning publication's public brand name. */
  readonly siteName: string;
  /** The site/locale root's own localized sentence — never a dictionary entry and never invented. */
  readonly tagline: string;
  /** The canonical public identity the card carries: the site/locale root's absolute URL. */
  readonly imageUrl: string;
}

/** Everything the model needs — all of it already resolved and authorized by the caller. */
export interface EfsOpenGraphImageFacts {
  /** `D40`-C resolved public `brand.name`; `undefined` for private, suppressed or absent-and-unfallbacked. */
  readonly brandName: string | undefined;
  /** The root representation's own public description, if its document declares one. */
  readonly description: string | undefined;
  /** The root representation's own public title, if its document declares one. */
  readonly title: string | undefined;
  /** Absolute canonical URL of the site/locale root (`https://<host>/<…>/<localeKey>`). */
  readonly canonicalRoot: string;
}

/** One model that passed the refusal rules: what to draw, and where the image is published. */
export interface EfsOpenGraphImage {
  readonly content: EfsOpenGraphImageContent;
  /** The absolute URL this image is served at — the `og:image` a Page advertises. */
  readonly url: string;
  /** The absolute canonical URL of the site/locale root the card describes. */
  readonly canonicalRoot: string;
}

const usable = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

export function openGraphImageForEfs(facts: EfsOpenGraphImageFacts): EfsOpenGraphImage | null {
  const siteName = usable(facts.brandName);
  if (siteName === undefined) return null;

  const canonicalRoot = facts.canonicalRoot.replace(/\/+$/, "");
  if (!canonicalRoot.startsWith("https://")) return null;

  return {
    content: {
      siteName,
      tagline: usable(facts.description) ?? usable(facts.title) ?? "",
      imageUrl: canonicalRoot,
    },
    url: `${canonicalRoot}/${OPEN_GRAPH_IMAGE_SEGMENT}`,
    canonicalRoot,
  };
}
