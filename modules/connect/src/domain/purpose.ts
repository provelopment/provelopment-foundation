/** Closed P0 purpose set (M1 §C.1, decision `P-03` proposal A). No purpose may be added silently. */
export const PURPOSES = ['contact', 'service-enquiry'] as const;

export type Purpose = (typeof PURPOSES)[number];

export function isPurpose(value: unknown): value is Purpose {
  return typeof value === 'string' && (PURPOSES as readonly string[]).includes(value);
}

/** Purpose determines the accepted field set (M1 §C.2, §C.3). */
export const CONTACT_PURPOSES: readonly Purpose[] = PURPOSES;
