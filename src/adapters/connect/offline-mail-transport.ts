/**
 * THE OFFLINE MAIL TRANSPORT — Foundation's only shipped transport
 * ===============================================================
 * FOUNDATION-RELEASE-CANDIDATE (A2)
 *
 * Foundation is a public template: it must build, run and demonstrate a contact form with no provider
 * account, no credential and no outbound network I/O. This adapter satisfies Connect's `MailTransportPort`
 * without contacting anything.
 *
 * WHAT IT CLAIMS, EXACTLY. It reports `{ kind: "accepted" }`, which is the strongest statement a transport
 * can honestly make and means only "the handoff succeeded". It is NOT delivery, NOT provider acceptance and
 * NOT inbox receipt — nothing was transmitted anywhere. The reference configuration tells the visitor this
 * is a demonstration, and the visitor-facing copy never says a message was delivered.
 *
 * DETERMINISM. The provider reference is derived from the idempotency key Connect already minted, so the
 * same submission produces the same reference and no clock, random source or filesystem is involved. A test
 * can therefore assert the exact outcome.
 *
 * WHAT IT NEVER DOES: no network, no filesystem, no logging of the message body, the visitor's address, the
 * policy recipients or the sender. An adopter who wants real delivery supplies their own `MailTransportPort`
 * (see `modules/connect/README.md`); Foundation does not ship a provider sender, because a public
 * Installation cannot guarantee the abuse controls a live sender requires.
 */
import { createHash } from "node:crypto";

import type {
  MailTransportPort,
  TransportObservation,
} from "../../../modules/connect/src/index";

/** Marks every reference this adapter produces, so no reader can mistake one for a provider's. */
export const OFFLINE_TRANSPORT_REFERENCE_PREFIX = "offline";

export function createOfflineMailTransport(): MailTransportPort {
  return {
    async send(request: {
      readonly message: { readonly providerIdempotencyKey: string };
    }): Promise<TransportObservation> {
      const digest = createHash("sha256")
        .update(request.message.providerIdempotencyKey)
        .digest("hex")
        .slice(0, 16);
      return {
        kind: "accepted",
        providerReference: `${OFFLINE_TRANSPORT_REFERENCE_PREFIX}:${digest}`,
      };
    },
  };
}
