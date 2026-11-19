import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { CITY_COOKIE_MAX_AGE_SECONDS, CITY_COOKIE_NAME, getCityByInsee } from "@/lib/cities";

/**
 * Keep the selected municipality in sync with the URL.
 *
 * A valid `?city=<INSEE>` is:
 * - copied into the request cookie, so the server render that follows sees it
 *   immediately (no redirect and no client-side flash);
 * - persisted in a one-year response cookie.
 *
 * The cookie is readable by JavaScript on purpose: the client selector also
 * writes it so the choice survives direct navigation to another page.
 * Invalid or missing values leave the existing cookie untouched and simply
 * fall back through the normal query > cookie > default precedence.
 */
export function proxy(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("city");
  const city = getCityByInsee(requested?.trim() ?? null);
  if (!city) return NextResponse.next();

  // Mutating the request cookies updates its `Cookie` header in place; the
  // forwarded headers below make the value visible to the current render.
  request.cookies.set(CITY_COOKIE_NAME, city.insee);

  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set({
    name: CITY_COOKIE_NAME,
    value: city.insee,
    maxAge: CITY_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export const config = {
  // Pages only. API routes validate their own `city` parameter, and static
  // assets never need a cookie rewrite.
  matcher: [
    "/((?!api|_next/static|_next/image|vendor|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
  ],
};
