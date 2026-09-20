import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import type { DirectionLinkResolver, DirectionsAction } from "@/application/direction-link";
import type { BusinessLocation, ExceptionalHours, Weekday } from "@/core/business";
import { formatAddress, resolveBusinessForLocale } from "@/core/business";
import { resolveTimezone } from "@/core/business-hours";
import { timezoneDisplayLabel } from "@/core/display-labels";
import { CurrentStatus } from "./current-status";
import { FOOTER_LINK_CLASS } from "./footer-link-class";

const WEEKDAY_ORDER: readonly Weekday[] = [
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
];

/** Localized short weekday names in Mon..Sun order (via `Intl`, no dict keys). */
function localizeWeekdays(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return WEEKDAY_ORDER.map((_, index) =>
    formatter.format(new Date(Date.UTC(1970, 0, 5 + index))), // 1970-01-05 is a Monday
  );
}

/** "mon..fri" -> "Mon–Fri"; non-contiguous runs joined with "/". */
function formatDayRange(locale: string, days: readonly Weekday[]): string {
  const names = localizeWeekdays(locale);
  const indices = days.map((day) => WEEKDAY_ORDER.indexOf(day));
  const contiguous =
    indices.length > 1 &&
    indices.every((value, index) => index === 0 || value === indices[index - 1] + 1);
  if (contiguous) {
    return `${names[indices[0]]}–${names[indices[indices.length - 1]]}`;
  }
  return indices.map((index) => names[index]).join(" / ");
}

/** "2026-12-25" -> localized "24 Dec 2026". */
function formatISODate(locale: string, iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric", month: "short", year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function describeExceptional(exception: ExceptionalHours, closedLabel: string): string {
  if (exception.closed) return closedLabel;
  if (exception.open && exception.close) return `${exception.open}–${exception.close}`;
  return "";
}

interface LocationBlockProps {
  readonly location: BusinessLocation;
  readonly locale: string;
  /** The provider-resolved directions action for this (already localized) location. */
  readonly direction: DirectionsAction;
}

function LocationBlock({ location, locale, direction }: LocationBlockProps) {
  const dictionary = getDictionary(locale);
  const addressText = formatAddress(location.address);
  const internationalText =
    location.addressMode === "local-international" && location.addressInternational
      ? formatAddress(location.addressInternational)
      : null;
  const hasAddress = Boolean(location.address.street || location.address.city);
  const hasHours = Boolean(location.hours && location.hours.intervals.length);
  const timeZone = resolveTimezone(location, siteConfig.business.timezone);

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-foreground">
        {location.name ?? siteConfig.name}
      </h3>

      {hasAddress ? (
        <address className="mt-2 break-words not-italic text-muted-foreground">
          {direction.kind === "link" ? (
            <a
              href={direction.href}
              className={FOOTER_LINK_CLASS}
              target="_blank"
              rel="noreferrer"
            >
              {addressText}
            </a>
          ) : (
            <span>{addressText}</span>
          )}
          {internationalText ? (
            <span className="mt-1 block">{internationalText}</span>
          ) : null}
        </address>
      ) : null}

      {location.phone ? (
        <p className="mt-2">
          <a href={`tel:${location.phone}`} className={FOOTER_LINK_CLASS}>
            {location.phone}
          </a>
        </p>
      ) : null}

      {hasHours ? (
        <div className="mt-3">
          {/* Phase M refinement — Business Hours + timezone are ONE heading
              unit (`localized (English) — IANA`); the IANA id is always shown. */}
          <h4 className="break-words text-xs font-semibold tracking-wide text-muted-foreground">
            {dictionary.business.hoursLabel} (
            {dictionary.business.hoursTimeZoneLabel}: {timezoneDisplayLabel(locale, timeZone)})
          </h4>

          <CurrentStatus
            location={location}
            timeZone={timeZone}
            labels={{
              open: dictionary.business.open,
              closed: dictionary.business.closed,
            }}
          />

          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {location.hours!.intervals.map((interval, index) => (
              <li key={index}>
                <span className="text-foreground">
                  {formatDayRange(locale, interval.days)}:
                </span>{" "}
                {interval.open}–{interval.close}
              </li>
            ))}
          </ul>

          {location.hours!.exceptional.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {location.hours!.exceptional.map((exception) => (
                <li key={exception.date}>
                  <span className="text-foreground">
                    {formatISODate(locale, exception.date)}:
                  </span>{" "}
                  {describeExceptional(exception, dictionary.business.closed)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface BusinessInfoProps {
  readonly locale: string;
  /** A provider-resolved direction link resolver (composed at the app boundary). */
  readonly directionLinkResolver: DirectionLinkResolver;
}

export function BusinessInfo({ locale, directionLinkResolver }: BusinessInfoProps) {
  const dictionary = getDictionary(locale);
  // Resolve the business profile (customer-facing contact + every location) for
  // this locale so the visible footer shows locale-appropriate contact and
  // address data, never a silently global fixed number/address.
  const business = resolveBusinessForLocale(siteConfig.business, locale);
  const primaryEmail = business.contact.email ?? "";
  const primaryPhone = business.contact.phone ?? "";

  if (!business.locations.length && !primaryEmail && !primaryPhone) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {dictionary.sections.contact}
      </h2>

      {primaryEmail ? (
        <p className="mt-3">
          <a href={`mailto:${primaryEmail}`} className={FOOTER_LINK_CLASS}>
            {primaryEmail}
          </a>
        </p>
      ) : null}
      {primaryPhone ? (
        <p className="mt-3">
          <a href={`tel:${primaryPhone}`} className={FOOTER_LINK_CLASS}>
            {primaryPhone}
          </a>
        </p>
      ) : null}

      {business.locations.map((location) => (
        <LocationBlock
          key={location.id}
          location={location}
          locale={locale}
          direction={directionLinkResolver.resolve(location)}
        />
      ))}
    </div>
  );
}