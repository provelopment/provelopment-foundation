/**
 * Deterministic content fingerprint (FNV-1a, 32-bit, hex).
 *
 * Used only as the secondary duplicate signal of M1 §C.6 — it never authorizes anything and never
 * replaces the context-scoped idempotency identity. Deliberately dependency-free: the domain layer
 * must not reach for a crypto module, a clock or randomness.
 */
export function fingerprintOf(parts: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (const character of `${part}\u0000`) {
      hash ^= character.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}
