/**
 * Diagnostic redaction (M4 §7).
 *
 * Telemetry and lifecycle records are built from identifiers and counts only. Anything that does reach a
 * log sink — an adapter error, a provider response excerpt, a support bundle — must pass through this
 * helper first, so visitor content and recipient addresses cannot leak into diagnostics.
 *
 * Redaction is by **key name** and is intentionally conservative: unknown keys survive (so operators keep
 * useful context), sensitive keys are replaced entirely, strings are truncated, and the traversal is
 * depth-limited so a cyclic or pathological structure cannot hang a caller.
 */
export const REDACTED_PLACEHOLDER = '[redacted]';

const SENSITIVE_KEY_PATTERN =
  /(e-?mail|name|message|phone|subject|body|content|recipient|address|reply-?to|payload|secret|token)/i;

/** Envelope keys carry addresses even when their names are short. */
const SENSITIVE_EXACT_KEYS: ReadonlySet<string> = new Set(['to', 'cc', 'bcc', 'from']);

const MAX_STRING_LENGTH = 200;
const MAX_DEPTH = 6;

export function redactForDiagnostics(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[depth-limit]';

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => redactForDiagnostics(entry, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const sensitive =
      SENSITIVE_EXACT_KEYS.has(key.toLowerCase()) || SENSITIVE_KEY_PATTERN.test(key);
    redacted[key] = sensitive ? REDACTED_PLACEHOLDER : redactForDiagnostics(entry, depth + 1);
  }
  return redacted;
}
