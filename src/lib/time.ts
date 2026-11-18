/**
 * Dates and time zones.
 *
 * - The database stores UTC timestamps (epoch milliseconds in SQLite).
 * - Users see dates in the Europe/Paris time zone.
 * - A report contains a *day*, not a precise time. We store it at 12:00 Paris
 *   time so that it cannot jump to the previous or next UTC day.
 */

import { getPeriodMeta, type PeriodValue } from "./config/model";

export const PARIS_TIME_ZONE = "Europe/Paris";

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PARIS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD in the Paris time zone. */
export function parisDateKey(date: Date = new Date()): string {
  return dateKeyFormatter.format(date);
}

/** Human-readable date, e.g. "12 novembre 2026". */
export function formatDateFr(
  input: Date | string | number,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS_TIME_ZONE, ...options }).format(date);
}

export function formatDateTimeFr(input: Date | string | number): string {
  return formatDateFr(input, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Short date used in compact admin rows. */
export function formatShortDateFr(input: Date | string | number): string {
  return formatDateFr(input, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Offset of a time zone at a given instant, in minutes east of UTC.
 * Example: Europe/Paris in winter returns +60.
 */
function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }

  const asUtc = Date.UTC(
    values.year ?? 1970,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    values.hour ?? 0,
    values.minute ?? 0,
    values.second ?? 0,
  );

  return Math.round((asUtc - date.getTime()) / 60_000);
}

/**
 * Convert a Paris wall-clock time into a UTC Date.
 * `dateKey` is YYYY-MM-DD. The function accounts for summer time.
 */
export function parisWallTimeToUtc(dateKey: string, hour = 12, minute = 0): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new RangeError(`Invalid date key: ${dateKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = timeZoneOffsetMinutes(guess, PARIS_TIME_ZONE);
  let result = new Date(guess.getTime() - offset * 60_000);

  // Re-check the offset: close to a DST transition the first guess may have
  // used the wrong side of the transition.
  const correctedOffset = timeZoneOffsetMinutes(result, PARIS_TIME_ZONE);
  if (correctedOffset !== offset) {
    result = new Date(guess.getTime() - correctedOffset * 60_000);
  }
  return result;
}

/** Start of a Paris calendar day, returned as a UTC instant. */
export function startOfParisDayUtc(dateKey: string): Date {
  return parisWallTimeToUtc(dateKey, 0, 0);
}

/** ISO date key shifted by a whole number of days. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new RangeError(`Invalid date key: ${dateKey}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Start instant of an observation period.
 *
 * The window includes today: "7 derniers jours" starts at midnight Paris time
 * six days ago. `all` returns null (no lower bound).
 */
export function getPeriodStart(period: PeriodValue, now: Date = new Date()): Date | null {
  const meta = getPeriodMeta(period);
  if (meta.days === null) return null;
  const today = parisDateKey(now);
  const startDay = addDaysToDateKey(today, -(meta.days - 1));
  return startOfParisDayUtc(startDay);
}

/** True when the date key is strictly after today in Paris. */
export function isFutureDateKey(dateKey: string, now: Date = new Date()): boolean {
  return dateKey > parisDateKey(now);
}

/** Days between two date keys (b - a), using UTC calendar arithmetic. */
export function daysBetweenDateKeys(a: string, b: string): number {
  const first = Date.parse(`${a}T00:00:00Z`);
  const second = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(first) || Number.isNaN(second)) return Number.NaN;
  return Math.round((second - first) / 86_400_000);
}

/** Translate a period value into the French label used in the interface. */
export function periodLabel(period: PeriodValue): string {
  return getPeriodMeta(period).label;
}
