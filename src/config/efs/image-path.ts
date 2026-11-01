/**
 * THE RESERVED OPEN GRAPH IMAGE ENDPOINT (`GEO-03` R04-C21)
 * =======================================================
 *
 * `opengraph-image` is a RESERVED image suffix, never an authored Page route: `reserved-site-identifiers`
 * already refuses it as a site identifier, and no Page may declare it. A public URL that ends in it asks
 * for the social preview of the **site/locale root** its binding prefix and locale name — nothing else.
 * There is no per-Page image and no compatibility alias, so no retired geographic shape
 * (`/ww/en/opengraph-image`, `/de/de/opengraph-image`) can be reinterpreted as one.
 *
 * WHY THE PUBLIC URL IS DISPATCHED BY THE BOUNDARY RATHER THAN ROUTED BY THE FILE TREE. Next.js requires a
 * catch-all segment to be the last segment that modifies the path, so neither a metadata segment nor an
 * image route may sit under `[[...segments]]` — the framework refuses to build that tree at all (measured;
 * `pages-authoring-contract` pins the absence). The request boundary therefore REWRITES exactly this one
 * reserved suffix to the internal route below and carries the ORIGINAL public path on a private header.
 * That header is the only public identity the internal route trusts: a direct request to the internal
 * path has none, and is refused. The rewrite is the narrowest possible: it selects no publication, reads
 * no configuration and decides nothing — ownership is resolved by the same EFS chain every Page uses.
 *
 * Pure constants only: this module is imported by the edge-facing boundary and must stay free of I/O.
 */

/** The reserved image suffix. It is an endpoint, not a Page route and not an alias. */
export const OPEN_GRAPH_IMAGE_SEGMENT = "opengraph-image";

/** The image's fixed platform size — the ONE definition every boundary renders and advertises. */
export const OPEN_GRAPH_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** The image's fixed content type — the ONE definition every boundary renders and advertises. */
export const OPEN_GRAPH_IMAGE_CONTENT_TYPE = "image/png";

/** The internal App Router path the boundary rewrites the reserved suffix to. */
export const EFS_OPEN_GRAPH_IMAGE_ROUTE = "/efs-opengraph-image";

/** The private upstream header that carries the original public path through the rewrite. */
export const EFS_IMAGE_PATH_HEADER = "x-foundation-efs-image-path";
