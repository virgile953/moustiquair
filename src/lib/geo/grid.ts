/**
 * Deterministic metric grid.
 *
 * The whole municipality is covered by one infinite grid of 10 m squares,
 * anchored at the origin of Lambert-93 (x = 0, y = 0). A cell is therefore
 * identified by two integers:
 *
 *   gridX = floor(easting / 10)
 *   gridY = floor(northing / 10)
 *
 * This is independent of the map viewport, the request, or the server restart.
 * Negative coordinates work naturally because `Math.floor` rounds towards
 * minus infinity.
 */

import type { Feature, Polygon } from "geojson";

import { lambert93ToLonLat } from "./projection";
import type { CellId, GridIndex, Lambert93, LambertBounds, LonLat } from "./types";

/** Build the stable identifier of a cell. */
export function makeCellId(gridX: number, gridY: number): CellId {
  return `${gridX}:${gridY}`;
}

/** Read a cell identifier such as "-12034:56789". */
export function parseCellId(id: CellId): GridIndex | null {
  const match = /^(-?\d+):(-?\d+)$/.exec(id);
  if (!match) return null;
  return { gridX: Number(match[1]), gridY: Number(match[2]) };
}

/**
 * Find the cell containing a projected point.
 *
 * A point exactly on a cell boundary belongs to the cell to the north/east,
 * because the southwest corner is included and the northeast corner is not.
 */
export function coordinateToCell(position: Lambert93, gridSize = 10): GridIndex {
  if (!(gridSize > 0)) throw new RangeError("gridSize must be positive.");
  return {
    gridX: Math.floor(position.x / gridSize),
    gridY: Math.floor(position.y / gridSize),
  };
}

/** Southwest corner and metric bounds of a cell. */
export function cellToBounds(gridX: number, gridY: number, gridSize = 10): LambertBounds {
  const minX = gridX * gridSize;
  const minY = gridY * gridSize;
  return { minX, minY, maxX: minX + gridSize, maxY: minY + gridSize };
}

/** Centre of a cell, used for distance calculations. */
export function cellToCenter(gridX: number, gridY: number, gridSize = 10): Lambert93 {
  return {
    x: gridX * gridSize + gridSize / 2,
    y: gridY * gridSize + gridSize / 2,
  };
}

/** Round to ~1 cm, enough for a map and much lighter in JSON. */
function roundCoordinate(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

/**
 * Build the closed polygon ring of a cell, in GeoJSON order
 * ([longitude, latitude]). The first and last points are identical.
 */
export function cellToLonLatRing(gridX: number, gridY: number, gridSize = 10): [number, number][] {
  const b = cellToBounds(gridX, gridY, gridSize);
  const corners: Lambert93[] = [
    { x: b.minX, y: b.minY }, // south-west
    { x: b.maxX, y: b.minY }, // south-east
    { x: b.maxX, y: b.maxY }, // north-east
    { x: b.minX, y: b.maxY }, // north-west
  ];

  const ring = corners.map((corner) => {
    const { longitude, latitude } = lambert93ToLonLat(corner);
    return [roundCoordinate(longitude), roundCoordinate(latitude)] as [number, number];
  });

  // GeoJSON polygons must be closed.
  const first = ring[0];
  if (!first) throw new Error("A cell ring must contain at least one point.");
  ring.push([first[0], first[1]]);
  return ring;
}

/** Convert a cell to a GeoJSON Feature, ready for MapLibre. */
export function cellToGeoJSON<P>(
  gridX: number,
  gridY: number,
  gridSize: number,
  properties: P,
): Feature<Polygon, P> {
  const cellId =
    properties && typeof properties === "object" && "cellId" in properties
      ? String(properties.cellId)
      : undefined;

  return {
    type: "Feature",
    id: cellId,
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [cellToLonLatRing(gridX, gridY, gridSize)],
    },
  };
}

/**
 * Integer grid range covering a metric bounding box.
 * Used to skip cells that are outside the requested viewport.
 */
export function getGridRangeForBounds(bounds: LambertBounds, gridSize = 10) {
  return {
    minGridX: Math.floor(bounds.minX / gridSize),
    maxGridX: Math.floor(bounds.maxX / gridSize),
    minGridY: Math.floor(bounds.minY / gridSize),
    maxGridY: Math.floor(bounds.maxY / gridSize),
  };
}

export interface InfluencedCell extends GridIndex {
  cellId: CellId;
  centerX: number;
  centerY: number;
  distance: number;
}

/**
 * Enumerate the cells whose centre lies within `radius` metres of a point.
 *
 * This is a *candidate* enumeration. The influence function still applies its
 * own distance test, and cells at exactly the radius have a zero contribution.
 */
export function getCellsWithinRadius(
  center: Lambert93,
  radius: number,
  gridSize = 10,
): InfluencedCell[] {
  if (radius < 0) throw new RangeError("radius must not be negative.");

  const cells: InfluencedCell[] = [];
  const minGridX = Math.floor((center.x - radius) / gridSize);
  const maxGridX = Math.floor((center.x + radius) / gridSize);
  const minGridY = Math.floor((center.y - radius) / gridSize);
  const maxGridY = Math.floor((center.y + radius) / gridSize);

  for (let gridY = minGridY; gridY <= maxGridY; gridY += 1) {
    for (let gridX = minGridX; gridX <= maxGridX; gridX += 1) {
      const cellCenter = cellToCenter(gridX, gridY, gridSize);
      const distance = Math.hypot(cellCenter.x - center.x, cellCenter.y - center.y);
      if (distance <= radius) {
        cells.push({
          gridX,
          gridY,
          cellId: makeCellId(gridX, gridY),
          centerX: cellCenter.x,
          centerY: cellCenter.y,
          distance,
        });
      }
    }
  }

  return cells;
}

/** Convert a GeoJSON coordinate to a position object (ordering reminder). */
export function geoJsonPositionToLonLat(position: [number, number]): LonLat {
  return { longitude: position[0], latitude: position[1] };
}
