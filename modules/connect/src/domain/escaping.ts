import type { InternalCode } from './error-codes.js';
import { err, ok, type Result } from './result.js';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes visitor text for safe insertion into an HTML/text template. Visitor input is never
 * parsed as markup (M1 §C.4 step 7): it is accepted as literal characters and neutralized here.
 */
export function escapeHtmlText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/** Mail-header safety: control characters (including CR/LF) are refused, never stripped silently. */
export function assertHeaderSafe(value: string): Result<string, InternalCode> {
  if (/[\r\n\u0000-\u001f\u007f]/.test(value)) return err('FRM-003');
  return ok(value);
}

const EXECUTABLE_MARKUP_PATTERN =
  /<\s*(?:script|iframe|object|embed|img|svg|style|link|meta|form)\b|<\s*[a-z][^>]*\bon[a-z]+\s*=|href\s*=\s*["']?\s*javascript:/i;

/**
 * Detection helper used by tests and by the renderer contract check: does this rendered output
 * still contain something a browser would execute? Escaped output must return `false`.
 */
export function containsExecutableMarkup(rendered: string): boolean {
  return EXECUTABLE_MARKUP_PATTERN.test(rendered);
}
