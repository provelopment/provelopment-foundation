/**
 * SPOKE HUB IDENTITY (FOUNDATION-ID-M3-P1) — the TYPED SURFACE
 * ============================================================
 *
 * The identity rules themselves live in `./spoke-hub-id.mjs`, as plain ESM, because two consumers need the
 * same answers and one of them (`src/config/spoke-declarations.mjs`) runs where TypeScript cannot be
 * executed: this module and the declaration/configuration seam both consume that ONE implementation, so an
 * Installation can never declare a Spoke Hub the domain refuses.
 *
 * This module keeps the TYPED surface the platform imports (`@/core/spoke`), so no consumer changes.
 */
import type { SpokeHubId } from "./model";

export { IMPLICIT_SPOKE_HUB_ID, spokeHubCollectionIssues } from "./spoke-hub-id.mjs";

/** Re-exported so the id type stays the one this module publishes. */
export type { SpokeHubId };
