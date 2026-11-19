/**
 * Server-side activity service.
 *
 * This file glues the pure spatial model to SQLite and to the HTTP layer:
 * - it selects only validated sightings in the requested period,
 * - it restricts the database query with projected coordinate bounds,
 * - it computes the activity grid with the reusable spatial model,
 * - it removes cells outside the municipality,
 * - and it applies the public privacy threshold.
 *
 * No caching is used. At this scale the calculation takes a few milliseconds,
 * and approving or rejecting a report is reflected immediately.
 */

import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { DEFAULT_CITY_INSEE } from "./cities";
import {
  DEFAULT_PERIOD,
  INFLUENCE_RADIUS_METERS,
  type PeriodValue,
  PUBLIC_MIN_CONTRIBUTING_REPORTS,
} from "./config/model";
import { getDb } from "./db/client";
import { sightings } from "./db/schema";
import { isInsideBoundary } from "./geo/boundary";
import { getCityBoundaryGeometry } from "./geo/city-boundaries";
import { cellToGeoJSON } from "./geo/grid";
import { calculateActivityGrid } from "./geo/influence";
import { formatActivityScore, getActivityLevel, normalizeActivityScore } from "./geo/intensity";
import { lambert93ToLonLat } from "./geo/projection";
import type { ActivityCell, LambertBounds } from "./geo/types";
import { getPeriodStart } from "./time";

export interface ActivityQuery {
  period?: PeriodValue;
  /** INSEE code of the municipality being studied. */
  cityInsee?: string;
  /** Display resolution in metres: 10, 50 or 100. */
  resolution?: number;
  /** Lambert-93 bounds of the viewport. */
  bbox?: LambertBounds;
  /** Teacher mode: keep cells below the public privacy threshold. */
  includeUnpublished?: boolean;
  now?: Date;
}

export interface ActivityFeatureProperties {
  cellId: string;
  score: number;
  intensity: number;
  level: "none" | "low" | "moderate" | "high";
  contributingReports: number;
  resolution: number;
  latestObservedAt?: string;
}

export type ActivityFeature = Feature<Polygon, ActivityFeatureProperties>;

/** Load only the approved observations that may influence the requested area. */
function loadApprovedSightings(query: ActivityQuery) {
  const db = getDb();
  const period = query.period ?? DEFAULT_PERIOD;
  const resolution = query.resolution ?? 10;
  const cityInsee = query.cityInsee ?? DEFAULT_CITY_INSEE;
  const start = getPeriodStart(period, query.now ?? new Date());

  const conditions = [eq(sightings.status, "approved"), eq(sightings.cityInsee, cityInsee)];
  if (start) conditions.push(gte(sightings.observedAt, start));

  if (query.bbox) {
    // Include a margin so that a sighting just outside the viewport can still
    // influence cells inside it. The margin equals the influence radius plus
    // one display cell diagonal.
    const margin = INFLUENCE_RADIUS_METERS + resolution * 1.5;
    conditions.push(
      gte(sightings.projectedX, query.bbox.minX - margin),
      lte(sightings.projectedX, query.bbox.maxX + margin),
      gte(sightings.projectedY, query.bbox.minY - margin),
      lte(sightings.projectedY, query.bbox.maxY + margin),
    );
  }

  return db
    .select({
      id: sightings.id,
      longitude: sightings.longitude,
      latitude: sightings.latitude,
      projectedX: sightings.projectedX,
      projectedY: sightings.projectedY,
      observedAt: sightings.observedAt,
    })
    .from(sightings)
    .where(and(...conditions))
    .all();
}

/** A cell is displayed only when its centre belongs to the selected municipality. */
function isCellInStudyArea(
  cell: ActivityCell,
  boundary: ReturnType<typeof getCityBoundaryGeometry>,
): boolean {
  if (!boundary) return false;
  const center = lambert93ToLonLat({ x: cell.centerX, y: cell.centerY });
  return isInsideBoundary(center.longitude, center.latitude, boundary);
}

/**
 * Compute the activity cells for a viewport.
 *
 * The raw score is returned untouched by the visual normalisation, so the
 * teacher interface and the public cell panel can explain both values.
 */
export function computeActivityCells(query: ActivityQuery = {}): ActivityCell[] {
  const resolution = query.resolution ?? 10;
  const includeUnpublished = query.includeUnpublished ?? false;
  const cityInsee = query.cityInsee ?? DEFAULT_CITY_INSEE;
  const boundary = getCityBoundaryGeometry(cityInsee);

  const rows = loadApprovedSightings({ ...query, cityInsee });
  const candidates = calculateActivityGrid(rows, {
    gridSize: 10,
    resolution,
    radius: INFLUENCE_RADIUS_METERS,
    bbox: query.bbox,
  });

  return candidates.filter((cell) => {
    if (cell.score <= 0 || cell.contributingReports === 0) return false;
    if (!isCellInStudyArea(cell, boundary)) return false;
    if (!includeUnpublished && cell.contributingReports < PUBLIC_MIN_CONTRIBUTING_REPORTS) {
      return false;
    }
    return true;
  });
}

/** Serialise cells as GeoJSON. Suppressed cells never reach this function. */
export function activityCellsToFeatureCollection(
  cells: ActivityCell[],
  resolution: number,
  includeLatest = false,
): FeatureCollection<Polygon, ActivityFeatureProperties> {
  const features: ActivityFeature[] = cells.map((cell) => {
    const properties: ActivityFeatureProperties = {
      cellId: cell.cellId,
      score: Math.round(cell.score * 1000) / 1000,
      intensity: Math.round(normalizeActivityScore(cell.score) * 10_000) / 10_000,
      level: getActivityLevel(cell.score),
      contributingReports: cell.contributingReports,
      resolution,
    };
    if (includeLatest && cell.latestObservedAt) {
      properties.latestObservedAt = cell.latestObservedAt;
    }

    return cellToGeoJSON(cell.gridX, cell.gridY, resolution, properties);
  });

  return { type: "FeatureCollection", features };
}

export interface ActivityOverview {
  activeCells: number;
  averageIntensity: number;
  maxScore: number;
  totalScore: number;
}

/**
 * Municipality-wide summary used by statistics cards.
 * Computed at 100 m for speed; the scientific grid remains 10 m.
 */
export function computeActivityOverview(
  period: PeriodValue = DEFAULT_PERIOD,
  includeUnpublished = false,
  cityInsee: string = DEFAULT_CITY_INSEE,
  now?: Date,
): ActivityOverview {
  const cells = computeActivityCells({
    period,
    resolution: 100,
    includeUnpublished,
    cityInsee,
    now,
  });

  if (cells.length === 0) {
    return { activeCells: 0, averageIntensity: 0, maxScore: 0, totalScore: 0 };
  }

  const totalScore = cells.reduce((sum, cell) => sum + cell.score, 0);
  const totalIntensity = cells.reduce((sum, cell) => sum + normalizeActivityScore(cell.score), 0);
  const maxScore = cells.reduce((max, cell) => Math.max(max, cell.score), 0);

  return {
    activeCells: cells.length,
    averageIntensity: totalIntensity / cells.length,
    maxScore,
    totalScore,
  };
}

export interface PublicStats {
  period: PeriodValue;
  approvedTotal: number;
  approvedInPeriod: number;
  pendingCount: number | null;
  rejectedCount: number | null;
  latestApprovedAt: string | null;
  activeCells: number;
  averageIntensity: number;
  demoActive: boolean;
  demoApprovedInPeriod: number;
  realApprovedInPeriod: number;
}

/** Aggregate statistics. Pending/rejected counts are only exposed to teachers. */
export function getStats(
  period: PeriodValue = DEFAULT_PERIOD,
  includeAdminCounts = false,
  cityInsee: string = DEFAULT_CITY_INSEE,
  now: Date = new Date(),
): PublicStats {
  const db = getDb();
  const start = getPeriodStart(period, now);
  const cityCondition = eq(sightings.cityInsee, cityInsee);

  const approvedTotal =
    db
      .select({ value: count() })
      .from(sightings)
      .where(and(eq(sightings.status, "approved"), cityCondition))
      .get()?.value ?? 0;

  const approvedConditions = [eq(sightings.status, "approved"), cityCondition];
  if (start) approvedConditions.push(gte(sightings.observedAt, start));

  const approvedInPeriod =
    db
      .select({ value: count() })
      .from(sightings)
      .where(and(...approvedConditions))
      .get()?.value ?? 0;

  const latestRow = db
    .select({ observedAt: sightings.observedAt })
    .from(sightings)
    .where(and(eq(sightings.status, "approved"), cityCondition))
    .orderBy(desc(sightings.observedAt))
    .limit(1)
    .get();

  const demoConditions = [
    eq(sightings.status, "approved"),
    eq(sightings.isDemo, true),
    cityCondition,
  ];
  const demoAllTime =
    db
      .select({ value: count() })
      .from(sightings)
      .where(and(...demoConditions))
      .get()?.value ?? 0;

  const demoInPeriod =
    db
      .select({ value: count() })
      .from(sightings)
      .where(and(...demoConditions, ...(start ? [gte(sightings.observedAt, start)] : [])))
      .get()?.value ?? 0;

  let pendingCount: number | null = null;
  let rejectedCount: number | null = null;
  if (includeAdminCounts) {
    pendingCount =
      db
        .select({ value: count() })
        .from(sightings)
        .where(and(eq(sightings.status, "pending"), cityCondition))
        .get()?.value ?? 0;
    rejectedCount =
      db
        .select({ value: count() })
        .from(sightings)
        .where(and(eq(sightings.status, "rejected"), cityCondition))
        .get()?.value ?? 0;
  }

  const overview = computeActivityOverview(period, includeAdminCounts, cityInsee, now);

  return {
    period,
    approvedTotal,
    approvedInPeriod,
    pendingCount,
    rejectedCount,
    latestApprovedAt: latestRow?.observedAt.toISOString() ?? null,
    activeCells: overview.activeCells,
    averageIntensity: Math.round(overview.averageIntensity * 1000) / 1000,
    demoActive: demoAllTime > 0,
    demoApprovedInPeriod: demoInPeriod,
    realApprovedInPeriod: approvedInPeriod - demoInPeriod,
  };
}

/** Human-readable level used in the cell panel and tests. */
export function describeScore(score: number): string {
  return formatActivityScore(score);
}
