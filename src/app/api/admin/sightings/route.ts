import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { listSightings } from "@/lib/admin-data";
import { jsonError } from "@/lib/api";
import { requireAdminRead } from "@/lib/auth/session";
import { selectCityFromRequest } from "@/lib/city-selection";
import { adminSightingsQuerySchema } from "@/lib/validation/schemas";

/** GET /api/admin/sightings?status=pending&city=95306 — private, city-scoped queue. */
export function GET(request: NextRequest) {
  if (!requireAdminRead(request)) {
    return jsonError(401, "UNAUTHENTICATED", "Connexion enseignant requise.");
  }

  const selection = selectCityFromRequest(request);
  if (selection.invalidQuery) {
    return jsonError(400, "INVALID_CITY", "La commune demandée n'est pas prise en charge.");
  }

  const url = new URL(request.url);
  const parsed = adminSightingsQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError(400, "INVALID_QUERY", "Les filtres demandés ne sont pas valides.");
  }

  const result = listSightings({ ...parsed.data, cityInsee: selection.city.insee });
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
