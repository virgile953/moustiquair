import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleApiError, jsonError } from "@/lib/api";
import { authorizeAdminRequest } from "@/lib/auth/session";
import { selectCityFromRequest } from "@/lib/city-selection";
import { clearDemoData } from "@/lib/db/seed";

/**
 * DELETE /api/admin/demo?city=95306
 *
 * Remove demo records for the selected commune only, never real reports and
 * never another city's dataset.
 */
export function DELETE(request: NextRequest) {
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

    const removed = clearDemoData(selection.city.insee);
    return NextResponse.json(
      { ok: true, removed, cityInsee: selection.city.insee },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
