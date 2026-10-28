import type { CommunicationContext } from '../domain/communication-context.js';

/**
 * Integrity and binding check for the anonymous form token (M1 §C.6).
 *
 * A token rendered into a public form is visitor-controlled. When this port is configured, an
 * edited, transplanted or expired token is refused (`FRM-005`). When it is **not** configured, the
 * Module accepts the token only as untrusted dedupe input — it never becomes authority.
 */
export type FormTokenVerdict =
  | { readonly kind: 'verified'; readonly dedupeKey: string }
  | {
      readonly kind: 'rejected';
      readonly reason: 'malformed' | 'expired' | 'bindingMismatch' | 'integrityFailed';
    };

export interface FormTokenPort {
  /**
   * Contract obligations:
   * - verify integrity with a server-held secret (never a value shipped to the browser);
   * - verify the binding to this exact context (`deploymentId`, `publisherRef`, `ownerRef`,
   *   `siteRef`, `placement`, `formRef`, `purpose`) and the issue/expiry window;
   * - return a `dedupeKey` that is stable for the same token and unique per rendered form.
   */
  verify(request: {
    readonly token: string;
    readonly context: CommunicationContext;
    readonly atEpochMs: number;
  }): Promise<FormTokenVerdict>;
}
