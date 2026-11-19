import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { selectCityFromRequest } from "@/lib/city-selection";
import { boundaryToFeatureCollection } from "@/lib/geo/boundary";
import { getCityBoundary } from "@/lib/geo/city-boundaries";

/**
 * GET /api/map/boundary?city=95306
 *
 * The official boundary of the selected commune, served from a versioned local
 * GeoJSON file. The response is static for a given city and can be cached by
 * the browser. `Vary: Cookie` covers requests that omit `city` and rely on the
 * persisted selection.
 */
export function GET(request: NextRequest) {
  const selection = selectCityFromRequest(request);
  if (selection.invalidQuery) {
    return jsonError(400, "INVALID_CITY", "La commune demandée n'est pas prise en charge.");
  }

  const boundary = getCityBoundary(selection.city.insee);
  if (!boundary) {
    return jsonError(404, "CITY_NOT_FOUND", "Aucune limite communale n'est disponible.");
  }

  return NextResponse.json(boundaryToFeatureCollection(boundary), {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      Vary: "Cookie",
      "X-Data-Source": "geo.api.gouv.fr / Etalab 2.0",
      "X-Study-Area": selection.city.insee,
    },
  });
}
