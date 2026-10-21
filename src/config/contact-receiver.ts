/**
 * Collision-free contact receiver keys.
 *
 * `spokeHubId` is present only for an Installation that identifies its Spoke Hubs. The pair is the
 * composite identity; a local Spoke id alone is never treated as composite.
 */
export interface ContactOwnerIdentity {
  readonly id: string;
  readonly spokeHubId?: string;
}

export interface ContactReceiverLegacyGroup {
  readonly key: string;
  readonly owners: readonly ContactOwnerIdentity[];
}

/**
 * A legacy-compatible key is a LOWERCASE ASCII identity segment beginning with a letter/digit and
 * containing only letters, digits and hyphens. These are the conventional authored Spoke/Hub ids.
 *
 * Keeping this deliberately narrow is what makes the legacy key safe: underscores, uppercase,
 * dots, slashes, Unicode or whitespace cannot be folded into another identity's key.
 */
function isLegacySafe(segment: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(segment);
}

function legacySegment(segment: string): string {
  return segment.toUpperCase().replaceAll("-", "_");
}

function encodedSegment(segment: string): string {
  return Buffer.from(segment, "utf8").toString("hex").toUpperCase();
}

/**
 * The environment suffix for ONE owner.
 *
 * Flat legacy-safe ids keep the published `ACME_SPOKE` spelling. Identified-Hub identities get a
 * reserved `__COMPOSITE__` namespace, so a flat id containing double hyphens can never collide with a
 * Hub/Spoke pair. Anything that cannot be represented safely by the legacy rule is hex-encoded under
 * a reserved `__ENC_` namespace. The namespaces are disjoint, so every valid identity has one key and
 * distinct identities cannot share it.
 */
export function contactReceiverKey(owner: ContactOwnerIdentity): string {
  if (owner.spokeHubId !== undefined) {
    return isLegacySafe(owner.spokeHubId) && isLegacySafe(owner.id)
      ? `__COMPOSITE__${legacySegment(owner.spokeHubId)}__${legacySegment(owner.id)}`
      : `__ENC_HUB_${encodedSegment(owner.spokeHubId)}__${encodedSegment(owner.id)}`;
  }
  return isLegacySafe(owner.id) ? legacySegment(owner.id) : `__ENC_FLAT_${encodedSegment(owner.id)}`;
}

/** The old, lossy spelling. Used only to detect an ambiguous legacy environment variable. */
export function contactReceiverLegacyKey(owner: ContactOwnerIdentity): string {
  return (owner.spokeHubId === undefined ? owner.id : `${owner.spokeHubId}__${owner.id}`)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

function ownerIdentity(owner: ContactOwnerIdentity): string {
  return `${owner.spokeHubId ?? ""}\u0000${owner.id}`;
}

function distinctOwners(owners: readonly ContactOwnerIdentity[]): ContactOwnerIdentity[] {
  const seen = new Set<string>();
  return owners.filter((owner) => {
    const key = ownerIdentity(owner);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Groups of DISTINCT owners whose old lossy key is the same. The application boundary rejects a group
 * only when that old key is actually configured; an installation-wide shared receiver is still valid.
 */
export function contactReceiverLegacyGroups(
  owners: readonly ContactOwnerIdentity[],
): readonly ContactReceiverLegacyGroup[] {
  const groups = new Map<string, ContactOwnerIdentity[]>();
  for (const owner of distinctOwners(owners)) {
    const key = contactReceiverLegacyKey(owner);
    const group = groups.get(key) ?? [];
    group.push(owner);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, owners: group }));
}

/** A human-readable identity for a diagnostic, never an environment value or filesystem path. */
export function contactOwnerLabel(owner: ContactOwnerIdentity): string {
  return owner.spokeHubId === undefined ? owner.id : `${owner.spokeHubId}/${owner.id}`;
}
