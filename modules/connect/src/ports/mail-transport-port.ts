import type { TransportObservation } from '../domain/delivery.js';

/**
 * The fully resolved outbound message. Recipients, sender and subject are already fixed by policy
 * and template; a transport adapter may not add, replace or infer any of them.
 */
export interface OutboundMailMessage {
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly from: { readonly address: string; readonly displayName: string };
  readonly replyTo?: string;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody?: string;
  /** Stable per logical job, so a provider can deduplicate its own physical copies (M1 §D.4.1). */
  readonly providerIdempotencyKey: string;
  readonly submissionReference: string;
}

export interface MailTransportPort {
  /**
   * Contract obligations (M1 §D.4.1):
   * - report acceptance, ambiguity and refusal **honestly**: a timeout after the payload was sent
   *   must be reported as `timeout` with `payloadSent: true`, never as a bare exception or as a
   *   refusal, so the Module can avoid a blind resend;
   * - pass `providerIdempotencyKey` to the provider wherever the provider supports one;
   * - never claim delivery: a transport knows at most that the provider took the message.
   */
  send(request: { readonly message: OutboundMailMessage }): Promise<TransportObservation>;

  /** Optional reconciliation of an earlier ambiguous attempt, when the provider exposes a status. */
  reconcile?(request: { readonly providerReference: string }): Promise<TransportObservation>;
}
