/**
 * THE OPENGRAPH IMAGE VIEW (FOUNDATION-MULTISITE-M16)
 * ==================================================
 *
 * The VISUAL part of the social image — its size, its content type and the pure style constants that draw it —
 * extracted so BOTH boundaries that render it compose exactly ONE view:
 *
 *   `/[site]/[locale]/opengraph-image`          the ONE-Spoke compatibility boundary (public path)
 *   `/~spoke/[segment]/[site]/[locale]/…`       the hostname-selected Spoke (internal path)
 *
 * Neither boundary owns a style, a size or a word: the Spoke-specific values come from the context-bound
 * model (`./opengraph-model`), and the two boundaries cannot drift apart because there is one view.
 */
import type { ReactElement } from "react";

/**
 * WHAT THE IMAGE NEEDS TO KNOW — and nothing else.
 *
 * `GEO-03` R04-C21 adds a THIRD boundary that draws this same card (the EFS-native reserved endpoint), so the
 * parameter is stated as the presentation-neutral minimum rather than as one caller's model: three strings
 * that are already resolved, authorized and localized by whoever composes them. Any caller with these three
 * facts composes the ONE view, and no caller can make this file decide a fact it does not hold.
 */
export interface OpenGraphImageContent {
  /** The owning publication's public brand name. */
  readonly siteName: string;
  /** The localized sentence the card carries. */
  readonly tagline: string;
  /** The canonical public identity the card carries. */
  readonly imageUrl: string;
}

/** The image's fixed platform size and content type — ONE definition, shared by every boundary. */
export { OPEN_GRAPH_IMAGE_CONTENT_TYPE, OPEN_GRAPH_IMAGE_SIZE } from "@/config/efs/image-path";

/** The branded preview: the context's name, its localized tagline and its canonical origin. */
export function openGraphImageElement(model: OpenGraphImageContent): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1e3a8a 100%)",
        padding: "80px",
        color: "#ededed",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 28,
          letterSpacing: 8,
          textTransform: "uppercase",
          color: "#60a5fa",
        }}
      >
        {model.siteName}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1.15,
          maxWidth: 940,
        }}
      >
        {model.tagline}
      </div>

      <div style={{ display: "flex", fontSize: 26, color: "#a3a3a3" }}>{model.imageUrl}</div>
    </div>
  );
}
