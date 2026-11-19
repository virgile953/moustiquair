import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { reviewSighting } from "@/lib/admin-data";
import { handleApiError, jsonError, parseWithSchema, readJsonBody } from "@/lib/api";
import { authorizeAdminRequest } from "@/lib/auth/session";
import { selectCityFromRequest } from "@/lib/city-selection";
import { adminReviewSchema } from "@/lib/validation/schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** PATCH /api/admin/sightings/:id — approve or reject a report. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const authorization = authorizeAdminRequest(request);
    if (!authorization.ok) {
      return jsonError(
        authorization.status,
        authorization.code,
        authorization.status === 401 ? "Connexion enseignant requise." : "Requête refusée.",
      );
    }

    const { id } = await context.params;
    if (!id || id.length > 100) {
      return jsonError(400, "INVALID_ID", "Signalement introuvable.");
    }

    const selection = selectCityFromRequest(request);
    if (selection.invalidQuery) {
      return jsonError(400, "INVALID_CITY", "La commune demandée n'est pas prise en charge.");
    }

    const payload = await readJsonBody(request);
    const input = parseWithSchema(adminReviewSchema, payload);

    const updated = reviewSighting(id, input.status, selection.city.insee);
    if (!updated) {
      return jsonError(404, "NOT_FOUND", "Ce signalement n'existe pas dans cette commune.");
    }

    return NextResponse.json(
      { item: updated },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
