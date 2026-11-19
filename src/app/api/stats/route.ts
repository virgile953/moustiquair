import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getStats } from "@/lib/activity-service";
import { jsonError } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth/session";
import { selectCityFromRequest } from "@/lib/city-selection";
import { DEFAULT_PERIOD, isPeriodValue, type PeriodValue } from "@/lib/config/model";

/**
 * GET /api/stats?period=30&city=95306
 *
 * Public aggregates only. Pending and rejected counts, as well as unpublished
 * activity cells, are returned only to an authenticated teacher asking for the
 * full view. Aggregates are always scoped to one commune.
 */
export function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawPeriod = url.searchParams.get("period") ?? DEFAULT_PERIOD;
  if (!isPeriodValue(rawPeriod)) {
    return jsonError(400, "INVALID_PERIOD", "La période demandée n'est pas valide.");
  }
  const period: PeriodValue = rawPeriod;

  const selection = selectCityFromRequest(request);
  if (selection.invalidQuery) {
    return jsonError(400, "INVALID_CITY", "La commune demandée n'est pas prise en charge.");
  }

  const teacherView = url.searchParams.get("view") === "full";
  if (teacherView && !getSessionFromRequest(request)) {
    return jsonError(401, "UNAUTHENTICATED", "La vue enseignant nécessite une connexion.");
  }

  const stats = getStats(period, teacherView, selection.city.insee);
  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": teacherView ? "private, no-store" : "no-store",
      Vary: "Cookie",
    },
  });
}
