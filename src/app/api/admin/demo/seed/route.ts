import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleApiError, jsonError } from "@/lib/api";
import { authorizeAdminRequest } from "@/lib/auth/session";
import { selectCityFromRequest } from "@/lib/city-selection";
import { seedDemoData } from "@/lib/db/seed";

/**
 * POST /api/admin/demo/seed?city=95306
 *
 * Restore the reproducible demo dataset for the selected commune only.
 */
export function POST(request: NextRequest) {
  try {
    const authorization = authorizeAdminRequest(request);
    if (!authorization.ok) {
      return jsonError(
        authorization.status,
        authorization.code,
        authorization.status === 401 ? "Connexion enseignant requise." : "Requête refusée.",
      );
    }

    const selection = selectCityFromRequest(request);
    if (selection.invalidQuery) {
      return jsonError(400, "INVALID_CITY", "La commune demandée n'est pas prise en charge.");
    }

    const result = seedDemoData(selection.city);
    return NextResponse.json(
      { ok: true, cityInsee: selection.city.insee, ...result },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
