/**
 * THE PRIVATE REQUEST-PATH HEADER (FOUNDATION-COMPLETE-A1-R1)
 * ==========================================================
 *
 * A Server Action receives the request path only through Next's request headers. The edge proxy
 * owns the real pathname and SETS this header upstream; it deletes any client value first. The
 * contact-owner resolver therefore never trusts a form field, a client header or a client-supplied
 * EntityID to choose a publication.
 */
export const EFS_REQUEST_PATH_HEADER = "x-foundation-efs-request-path";

/**
 * THE PRIVATE RAW QUERY HEADER (`D40` Decision B)
 * ===============================================
 *
 * A casing redirect must carry the visitor's ORIGINAL query string unchanged — repeated keys, their order
 * and their encoded characters. A Server Component cannot read that: `searchParams` hands back decoded
 * values, so re-encoding them would silently rewrite the address the visitor supplied.
 *
 * The edge proxy therefore forwards the request's raw search text upstream on this private header, exactly
 * as it already does for the pathname, and DISCARDS any client-supplied value under the same name. It is an
 * address transcript, not an authorization: nothing selects a publication, Site or locale from it.
 */
export const EFS_REQUEST_QUERY_HEADER = "x-foundation-efs-request-query";
