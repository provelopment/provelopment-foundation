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
