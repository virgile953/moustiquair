/**
 * Server-side selection of the municipality a request is about.
 *
 * Precedence is always: valid `?city=` query parameter, then the persisted
 * `moustiquair_city` cookie, then Herblay-sur-Seine. Unknown INSEE codes are
 * never trusted and never throw: an invalid explicit query is reported to the
 * caller (so APIs can answer 400) while the resolved city falls back to the
 * cookie or the default.
 *
 * The proxy (`src/proxy.ts`) copies a valid `?city=` value into the request
 * cookie, so a server render only has to read `cookies()` to see the selection.
 */

import { cookies } from "next/headers";

import { CITY_COOKIE_NAME, type City, DEFAULT_CITY, getCityByInsee } from "./cities";

export interface CitySelection {
  city: City;
  /** True when a `city` query parameter was supplied but is not supported. */
  invalidQuery: boolean;
}

/** Pure precedence helper, used by the proxy, pages, APIs and tests. */
export function selectCity(
  queryCity: string | null | undefined,
  cookieCity: string | null | undefined,
): CitySelection {
  const requestedInsee = queryCity?.trim() ?? "";
  if (requestedInsee.length > 0) {
    const requested = getCityByInsee(requestedInsee);
    if (requested) return { city: requested, invalidQuery: false };
    return { city: getCityByInsee(cookieCity) ?? DEFAULT_CITY, invalidQuery: true };
  }

  return { city: getCityByInsee(cookieCity) ?? DEFAULT_CITY, invalidQuery: false };
}

/** Read one cookie from a raw `Cookie` header without importing Next.js. */
export function readCookieValue(header: string | null, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

/**
 * Select the city for an API request. Callers that need strict validation
 * should reject `invalidQuery` with the shared 400 `INVALID_CITY` error.
 */
export function selectCityFromRequest(request: Request): CitySelection {
  const url = new URL(request.url);
  return selectCity(
    url.searchParams.get("city"),
    readCookieValue(request.headers.get("cookie"), CITY_COOKIE_NAME),
  );
}

/**
 * Selected city for a server component or page. The optional query value lets
 * pages resolve correctly even when the proxy has not run (tests, direct calls).
 */
export async function getSelectedCity(queryCity?: string | null): Promise<City> {
  const store = await cookies();
  return selectCity(queryCity, store.get(CITY_COOKIE_NAME)?.value).city;
}
