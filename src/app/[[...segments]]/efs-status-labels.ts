/**
 * THE COMPUTED-STATUS DICTIONARY BINDING (`GEO-02-R02` D, corrected by `R03`)
 * ========================================================================
 *
 * The computed opening status has to be LABELLED, and its labels must come from the established
 * dictionary authority in the language the Page is actually published in. This module is the whole
 * of that binding: it answers one question — "which `dictionary.business` labels apply to THIS
 * representation?" — and nothing else.
 *
 * THREE RULES, EACH A DEFECT THIS CORRECTION FIXED
 * ------------------------------------------------
 * 1. LOOK UP BY THE PATH KEY, NOT THE CANONICAL TAG (`R03` A). A Page carries two established
 *    language representations: `locale` (the canonical, authored BCP47 tag — `de-DE`, used for
 *    language identity and metadata) and `localeKey` (its lowercase path/dictionary key — `de-de`).
 *    Dictionary files and the registry are keyed by the PATH KEY, so passing the canonical tag would
 *    miss `config/i18n/de-de.json` and silently fall through to another language.
 *
 * 2. REQUIRE AN APPLICABLE DICTIONARY (`R03` B). The registry accepts a locale's exact dictionary,
 *    its LANGUAGE BASE (`en` for `en-001`), or — last — the deployment's DEFAULT locale. The first
 *    two are legitimate; the third is an unrelated language, and a status labelled `Open` in English
 *    on a French Page is worse than no status. So the consumer asks `applicable()` first and emits
 *    NOTHING when no dictionary applies. The registry's own `get` keeps that fallback unchanged for
 *    every other consumer.
 *
 * 3. LET VALIDATION FAILURES BE VISIBLE (`R03` C). "No applicable dictionary" is a normal answer for
 *    an optional fact. A malformed dictionary file, a declared locale with no dictionary, or a failed
 *    Installation-validation rule is NOT: it is an Installation defect and must surface as one. There
 *    is therefore NO blanket `try/catch` here — an empty answer comes from `applicable()`, never from
 *    swallowing an error.
 *
 * The locale is the representation's own authored tag. It is never derived from a Site id, a
 * hostname, a publication prefix, a place or a timezone, and this module negotiates no language of
 * its own: it consults the same context-bound access the shared shell uses.
 */
import type { EfsView } from "@/app/[[...segments]]/efs-request";
import type { EfsScheduleStatusLabels } from "@/components/efs/efs-schedule-status";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";

/**
 * The localized labels for this Page's computed status, or `undefined` when none apply.
 *
 * `undefined` is returned in exactly two cases, both of which mean "say nothing":
 *
 *   - no dictionary applies to the published language (`applicable()` is false);
 *   - a dictionary applies but does not carry the `business` section.
 *
 * Anything thrown while binding the dictionaries — a malformed dictionary, a declared locale without
 * one, a failed invariant — propagates, because that is an Installation defect rather than a missing
 * label.
 */
export function efsScheduleStatusLabels(view: EfsView): EfsScheduleStatusLabels | undefined {
  const access = dictionaryAccessForRuntimeContext(view.context);
  const siteCode = view.publication.presentationSiteCode;

  // Rule 1: the PATH KEY (`de-de`), never the canonical tag (`de-DE`).
  const locale = view.localeKey;

  // Rule 2: only a dictionary that APPLIES to this language may label this representation.
  if (!access.applicable(locale, siteCode)) return undefined;

  const business = access.get(locale, siteCode).business;
  if (!business) return undefined;

  return { hoursLabel: business.hoursLabel, open: business.open, closed: business.closed };
}
