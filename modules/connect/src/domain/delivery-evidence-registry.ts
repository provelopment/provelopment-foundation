/**
 * Runtime provenance for delivery evidence.
 *
 * The Module must be able to answer *"did I mint this?"* without relying on a type, a brand or a symbol
 * that a consumer can also import. A module-private `WeakSet` does exactly that: only
 * `correlateDeliveryEvidence` reaches `mintAuthenticatedEvidence`, the set is unreachable from outside this
 * package, and **identity** — not shape — is what `recordDelivery` checks.
 *
 * Deliberate consequences, all of them safe:
 *
 * - a structural look-alike, a spread copy, a `JSON.parse` round-trip or a hand-written literal is refused;
 * - evidence never survives serialisation, so it cannot be stored and replayed later as proof;
 * - if two copies of the package are installed, evidence minted by one is refused by the other's
 *   `recordDelivery`. That is a refusal, not a false delivery; one composition root should use one copy.
 *
 * This module is intentionally **not** exported from the package entry point, and the package `exports` map
 * exposes only `.`, so there is no supported subpath import either. The honest boundary: code running in the
 * same process can always patch a library, so no in-process check can defeat a determined attacker. What is
 * guaranteed is that every **documented** route — the public entry point and its exported functions — offers
 * no way to obtain an object that `recordDelivery` accepts.
 */
const minted = new WeakSet<object>();

/**
 * Freeze an object graph. Evidence carries a nested recipient array, so freezing only the outer object would
 * leave a caller able to rewrite the proven recipient set after minting — the one field that decides whether a
 * delivery is complete.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

/** Freeze and register an evidence object. Called only by the verified-ingestion use case. */
export function mintAuthenticatedEvidence<T extends object>(evidence: T): T {
  const frozen = deepFreeze(evidence);
  minted.add(frozen);
  return frozen;
}

/** Identity check: was **this exact object** minted by this module instance? */
export function isMintedAuthenticatedEvidence(value: unknown): value is object {
  return typeof value === 'object' && value !== null && minted.has(value);
}
