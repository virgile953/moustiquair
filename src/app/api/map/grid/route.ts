import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { activityCellsToFeatureCollection, computeActivityCells } from "@/lib/activity-service";
import { jsonError } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth/session";
import { selectCityFromRequest } from "@/lib/city-selection";
import {
  DEFAULT_PERIOD,
  DISPLAY_RESOLUTIONS,
  isPeriodValue,
  type PeriodValue,
} from "@/lib/config/model";
import { getCityBoundingBox } from "@/lib/geo/city-boundaries";
import { lonLatToLambert93 } from "@/lib/geo/projection";
import type { LambertBounds } from "@/lib/geo/types";

/** Maximum number of geographic cells evaluated for one request. */
const MAX_EVALUATED_CELLS = 250_000;
/** Maximum number of published cells in one response. */
const MAX_FEATURES = 25_000;
/** Extra margin around the municipality in which viewports are accepted. */
const STUDY_PADDING_DEGREES = 0.02;
/**
 * The map is bounded to one commune at a time. A viewport wider than half a
 * degree (about 55 km) is necessarily a malformed or abusive request.
 */
const MAX_BBOX_SPAN_DEGREES = 0.5;

interface GeographicBbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

function parseBbox(raw: string | null): GeographicBbox | null {
  if (!raw) return null;
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];
  if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLon >= maxLon || minLat >= maxLat) return null;
  return { minLon, minLat, maxLon, maxLat };
}

function bboxToLambert(bounds: GeographicBbox): LambertBounds {
  const corners = [
    lonLatToLambert93({ longitude: bounds.minLon, latitude: bounds.minLat }),
    lonLatToLambert93({ longitude: bounds.maxLon, latitude: bounds.minLat }),
    lonLatToLambert93({ longitude: bounds.maxLon, latitude: bounds.maxLat }),
    lonLatToLambert93({ longitude: bounds.minLon, latitude: bounds.maxLat }),
  ];
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  };
}

/**
 * GET /api/map/grid?bbox=west,south,east,north&period=30&resolution=10&city=95306
 *
 * Returns only cells that:
 * - have a positive modelled activity,
 * - are centred inside the selected commune,
 * - pass the public privacy threshold (unless a teacher asks for the full view).
 *
 * The response never contains individual sighting coordinates or report IDs.
 */
export function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawBbox = url.searchParams.get("bbox");
  const rawPeriod = url.searchParams.get("period") ?? DEFAULT_PERIOD;
  const rawResolution = url.searchParams.get("resolution") ?? "10";
  const wantsTeacherView = url.searchParams.get("view") === "full";

  const selection = selectCityFromRequest(request);
  if (selection.invalidQuery) {
    return jsonError(400, "INVALID_CITY", "La commune demandée n'est pas prise en charge.");
  }
  const city = selection.city;
  const study = getCityBoundingBox(city.insee);
  if (!study) {
    return jsonError(400, "INVALID_CITY", "La commune demandée n'est pas prise en charge.");
  }

  const bbox = parseBbox(rawBbox);
  if (!bbox) {
    return jsonError(
      400,
      "INVALID_BBOX",
      "Le paramètre bbox doit contenir quatre coordonnées : ouest,sud,est,nord.",
    );
  }

  if (
    bbox.maxLon - bbox.minLon > MAX_BBOX_SPAN_DEGREES ||
    bbox.maxLat - bbox.minLat > MAX_BBOX_SPAN_DEGREES
  ) {
    return jsonError(
      400,
      "BBOX_TOO_LARGE",
      `La zone demandée est trop étendue. Zoomez sur ${city.name}.`,
    );
  }

  if (!isPeriodValue(rawPeriod)) {
    return jsonError(400, "INVALID_PERIOD", "La période demandée n'est pas valide.");
  }
  const period: PeriodValue = rawPeriod;

  const resolution = Number(rawResolution);
  if (!DISPLAY_RESOLUTIONS.includes(resolution as (typeof DISPLAY_RESOLUTIONS)[number])) {
    return jsonError(400, "INVALID_RESOLUTION", "La résolution doit être 10, 50 ou 100 mètres.");
  }

  let includeUnpublished = false;
  if (wantsTeacherView) {
    if (!getSessionFromRequest(request)) {
      return jsonError(401, "UNAUTHENTICATED", "La vue enseignant nécessite une connexion.");
    }
    includeUnpublished = true;
  }

  // Restrict the requested viewport to the study area (with a small margin for
  // map padding). Cells outside the commune are filtered out later anyway.
  const clipped: GeographicBbox = {
    minLon: Math.max(bbox.minLon, study.minLon - STUDY_PADDING_DEGREES),
    minLat: Math.max(bbox.minLat, study.minLat - STUDY_PADDING_DEGREES),
    maxLon: Math.min(bbox.maxLon, study.maxLon + STUDY_PADDING_DEGREES),
    maxLat: Math.min(bbox.maxLat, study.maxLat + STUDY_PADDING_DEGREES),
  };
  if (clipped.minLon >= clipped.maxLon || clipped.minLat >= clipped.maxLat) {
    return jsonError(
      400,
      "OUTSIDE_STUDY_AREA",
      `La zone demandée ne recoupe pas le territoire de ${city.name}.`,
    );
  }

  const lambertBbox = bboxToLambert(clipped);
  const evaluatedCells =
    ((lambertBbox.maxX - lambertBbox.minX) / resolution + 2) *
    ((lambertBbox.maxY - lambertBbox.minY) / resolution + 2);
  if (evaluatedCells > MAX_EVALUATED_CELLS) {
    return jsonError(
      400,
      "AREA_TOO_LARGE",
      "La zone demandée est trop grande pour cette résolution. Zoomez ou utilisez une maille plus large.",
    );
  }

  const cells = computeActivityCells({
    period,
    resolution,
    bbox: lambertBbox,
    includeUnpublished,
    cityInsee: city.insee,
  });

  if (cells.length > MAX_FEATURES) {
    return jsonError(
      400,
      "OVERLAY_TOO_LARGE",
      "Trop de cellules à afficher. Zoomez ou utilisez une maille plus large.",
    );
  }

  const featureCollection = activityCellsToFeatureCollection(cells, resolution, includeUnpublished);

  return NextResponse.json(featureCollection, {
    headers: {
      "Cache-Control": wantsTeacherView
        ? "private, no-store"
        : "public, max-age=15, stale-while-revalidate=30",
      Vary: "Cookie",
    },
  });
}
