/**
 * Influence model: how a validated sighting affects nearby grid cells.
 *
 * Each sighting is a point. For every nearby cell centre we calculate the
 * distance `d` and apply a quadratic decay:
 *
 *   weight(d) = max(0, 1 - d / R)²
 *
 * A sighting at distance 0 has a full weight of 1. At 50 m with R = 100 m the
 * weight is 0.25. At 100 m or more it is 0. Overlapping sightings are summed:
 * repeated observations deliberately increase the score.
 *
 * The score is an observation-derived index. It is NOT a count of mosquitoes.
 */

import { GRID_SIZE_METERS, INFLUENCE_RADIUS_METERS } from "../config/model";
import { coordinateToCell, getGridRangeForBounds, makeCellId } from "./grid";
import { lonLatToLambert93 } from "./projection";
import type { ActivityCell, ActivityModelOptions, Lambert93, ModelSighting } from "./types";

/**
 * Quadratic influence of a sighting at a given distance.
 *
 * @param distance Distance in metres. Must not be negative.
 * @param radius Influence radius in metres. Defaults to 100 m.
 */
export function calculateInfluence(
  distance: number,
  radius: number = INFLUENCE_RADIUS_METERS,
): number {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new RangeError("distance must be a finite, non-negative number.");
  }
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  if (distance >= radius) return 0;

  const remaining = 1 - distance / radius;
  return remaining * remaining;
}

interface MutableActivityCell {
  gridX: number;
  gridY: number;
  cellX: number;
  cellY: number;
  centerX: number;
  centerY: number;
  score: number;
  reportIds: Set<string>;
  latestObservedAt: number | null;
}

function projectSighting(sighting: ModelSighting): Lambert93 {
  if (
    typeof sighting.projectedX === "number" &&
    Number.isFinite(sighting.projectedX) &&
    typeof sighting.projectedY === "number" &&
    Number.isFinite(sighting.projectedY)
  ) {
    return { x: sighting.projectedX, y: sighting.projectedY };
  }

  return lonLatToLambert93({
    longitude: sighting.longitude,
    latitude: sighting.latitude,
  });
}

function observedTime(sighting: ModelSighting): number {
  const time = new Date(sighting.observedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Core aggregation.
 *
 * Efficiency: we never loop over the whole municipality for every sighting.
 * For each sighting we compute the small rectangle of candidate cells around
 * it (roughly 21 × 21 cells at 10 m), then discard cells beyond the radius.
 *
 * Coarse display resolutions are built from the same scientific model:
 * a coarse cell score is the mean of the scores of all underlying 10 m cell
 * centres, *including* the zero-activity sub-cells. This keeps city-wide views
 * comparable to the detailed 10 m view instead of inflating scores.
 */
export function calculateActivityGrid(
  sightings: ModelSighting[],
  options: ActivityModelOptions = {},
): ActivityCell[] {
  const gridSize = options.gridSize ?? GRID_SIZE_METERS;
  const radius = options.radius ?? INFLUENCE_RADIUS_METERS;
  const resolution = options.resolution ?? gridSize;
  const bbox = options.bbox;

  if (!(gridSize > 0) || !(radius > 0)) {
    throw new RangeError("gridSize and radius must be positive.");
  }
  if (resolution < gridSize || resolution % gridSize !== 0) {
    throw new RangeError("resolution must be a positive multiple of gridSize.");
  }

  const factor = resolution / gridSize;
  // A coarse cell can overlap the influence disc even if its centre is farther
  // than the radius, so candidate enumeration uses the half-diagonal margin.
  const halfDiagonal = Math.hypot(resolution, resolution) / 2;
  const cells = new Map<string, MutableActivityCell>();

  // Sorting makes the floating-point additions deterministic regardless of
  // the order returned by the database.
  const sortedSightings = [...sightings].sort((a, b) => a.id.localeCompare(b.id));

  for (const sighting of sortedSightings) {
    const point = projectSighting(sighting);
    const reportedAt = observedTime(sighting);

    const minGridX = Math.floor((point.x - radius - halfDiagonal) / resolution);
    const maxGridX = Math.floor((point.x + radius + halfDiagonal) / resolution);
    const minGridY = Math.floor((point.y - radius - halfDiagonal) / resolution);
    const maxGridY = Math.floor((point.y + radius + halfDiagonal) / resolution);

    const bboxRange = bbox ? getGridRangeForBounds(bbox, resolution) : null;
    const startX = bboxRange ? Math.max(minGridX, bboxRange.minGridX) : minGridX;
    const endX = bboxRange ? Math.min(maxGridX, bboxRange.maxGridX) : maxGridX;
    const startY = bboxRange ? Math.max(minGridY, bboxRange.minGridY) : minGridY;
    const endY = bboxRange ? Math.min(maxGridY, bboxRange.maxGridY) : maxGridY;

    for (let gridY = startY; gridY <= endY; gridY += 1) {
      for (let gridX = startX; gridX <= endX; gridX += 1) {
        const cellX = gridX * resolution;
        const cellY = gridY * resolution;

        // Skip cells that do not overlap the requested viewport.
        if (
          bbox &&
          (cellX + resolution < bbox.minX ||
            cellX > bbox.maxX ||
            cellY + resolution < bbox.minY ||
            cellY > bbox.maxY)
        ) {
          continue;
        }

        let subScore = 0;
        let samples = 0;
        let touched = false;

        // Evaluate every 10 m sub-cell centre. For factor = 1 this is simply
        // the centre of the displayed cell.
        for (let subY = 0; subY < factor; subY += 1) {
          for (let subX = 0; subX < factor; subX += 1) {
            const sampleX = cellX + subX * gridSize + gridSize / 2;
            const sampleY = cellY + subY * gridSize + gridSize / 2;
            const distance = Math.hypot(sampleX - point.x, sampleY - point.y);
            const weight = calculateInfluence(distance, radius);
            subScore += weight;
            samples += 1;
            if (weight > 0) touched = true;
          }
        }

        if (!touched) continue;

        const contribution = subScore / samples;
        const cellId = makeCellId(gridX, gridY);
        let cell = cells.get(cellId);

        if (!cell) {
          cell = {
            gridX,
            gridY,
            cellX,
            cellY,
            centerX: cellX + resolution / 2,
            centerY: cellY + resolution / 2,
            score: 0,
            reportIds: new Set(),
            latestObservedAt: null,
          };
          cells.set(cellId, cell);
        }

        cell.score += contribution;
        cell.reportIds.add(sighting.id);
        if (reportedAt > 0) {
          cell.latestObservedAt = Math.max(cell.latestObservedAt ?? 0, reportedAt);
        }
      }
    }
  }

  const result: ActivityCell[] = [...cells.values()].map((cell) => ({
    cellId: makeCellId(cell.gridX, cell.gridY),
    gridX: cell.gridX,
    gridY: cell.gridY,
    cellX: cell.cellX,
    cellY: cell.cellY,
    centerX: cell.centerX,
    centerY: cell.centerY,
    score: cell.score,
    contributingReports: cell.reportIds.size,
    latestObservedAt: cell.latestObservedAt ? new Date(cell.latestObservedAt).toISOString() : null,
  }));

  // Stable order: south to north, then west to east.
  result.sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX);
  return result;
}

/**
 * Convenience helper: the cell containing a sighting, mostly useful in tests
 * and in the teacher interface.
 */
export function sightingCellId(sighting: ModelSighting, gridSize = GRID_SIZE_METERS): string {
  const point = projectSighting(sighting);
  const { gridX, gridY } = coordinateToCell(point, gridSize);
  return makeCellId(gridX, gridY);
}
