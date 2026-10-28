/**
 * The **one** outbound-construction authority (`CONNECT-DIRECT-SEND-A4-SIMPLE-A1`).
 *
 * Both delivery modes build a message here: durable acceptance freezes a plan at commit time, and a direct
 * send builds one plan for its single attempt. That is the point of the extraction — if the direct-send path
 * could not import these functions it would grow a *second* sender/recipient/escape mapping, and two
 * implementations of "who receives this and what does it say" is exactly how a private address or an
 * unescaped value eventually reaches the wrong place.
 *
 * The functions are the released ones, moved: behaviour is identical, and `AcceptCommunication` imports them
 * instead of holding private copies. Typed over `PolicyAuthorizationCore`, so a durable policy and a
 * direct-send policy are both accepted without a cast.
 */
import type { NormalizedContent } from './content.js';
import type { DeliveryPlan } from './delivery.js';
import type { PolicyAuthorizationCore } from './destination-policy.js';

/**
 * Values the renderer inserts into the template. Visitor text is inserted as **escaped text** by the
 * renderer (M1 §E.5); nothing here is a header, an address or an authority claim.
 */
export function buildRenderValues(content: NormalizedContent): Readonly<Record<string, string>> {
  return {
    name: content.name,
    email: content.email,
    message: content.message,
    ...(content.phone === undefined ? {} : { phone: content.phone }),
    ...(content.subject === undefined ? {} : { subject: content.subject }),
    ...('organization' in content && content.organization !== undefined
      ? { organization: content.organization }
      : {}),
    ...('serviceInterest' in content ? { serviceInterest: content.serviceInterest } : {}),
  };
}

/**
 * Delivery authority for one message. Recipients and sender come from the **policy** only; the visitor's
 * address may appear as `replyTo` and only when the policy says `replyToMode: "visitor"`. It is never the
 * `from` identity.
 */
export function buildDeliveryPlan(
  policy: PolicyAuthorizationCore,
  content: NormalizedContent,
  submissionReference: string,
): DeliveryPlan {
  const to = policy.recipients
    .filter((recipient) => recipient.kind === 'to')
    .map((recipient) => recipient.address);
  const cc = policy.recipients
    .filter((recipient) => recipient.kind === 'cc')
    .map((recipient) => recipient.address);
  const replyTo =
    policy.sender.replyToMode === 'visitor' ? content.email : policy.sender.replyToAddress;
  return {
    to,
    cc,
    from: { address: policy.sender.fromAddress, displayName: policy.sender.fromDisplayName },
    ...(replyTo === undefined ? {} : { replyTo }),
    template: policy.template,
    renderValues: buildRenderValues(content),
    submissionReference,
  };
}
