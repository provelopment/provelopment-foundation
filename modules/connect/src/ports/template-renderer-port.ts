import type { TemplateReference } from '../domain/destination-policy.js';

export interface RenderRequest {
  readonly template: TemplateReference;
  readonly values: Readonly<Record<string, string>>;
  readonly submissionReference: string;
}

export interface RenderedMessage {
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody?: string;
}

export interface TemplateRendererPort {
  /**
   * Contract obligations (M1 §E.5):
   * - insert every visitor-derived value as **escaped text** — the value is never parsed as markup
   *   and never becomes unescaped markup;
   * - build `subject` from approved template text only, never from a raw visitor string;
   * - resolve the template language from the policy's `localeFallbacks`;
   * - fail closed (throw) on a missing template rather than sending a partially rendered message.
   */
  render(request: RenderRequest): Promise<RenderedMessage>;
}
