/**
 * Shared geographic types.
 *
 * GeoJSON always stores coordinates as `[longitude, latitude]` (EPSG:4326).
 * Metric calculations use Lambert-93 (EPSG:2154), an official French
 * projection whose unit is the metre.
 */

/** A GPS position in degrees, EPSG:4326. */
export interface LonLat {
  longitude: number;
  latitude: number;
}

/** A position in the Lambert-93 projection, in metres. */
export interface Lambert93 {
  /** Easting (x), metres. */
  x: number;
  /** Northing (y), metres. */
  y: number;
}

/** Integer indices identifying a cell on the infinite metric grid. */
export interface GridIndex {
  gridX: number;
  gridY: number;
}

/** A grid cell identifier, stable across requests: `gridX:gridY`. */
export type CellId = string;

/** Axis-aligned bounds expressed in Lambert-93 metres. */
export interface LambertBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A sighting as consumed by the spatial model. */
export interface ModelSighting {
  id: string;
  longitude: number;
  latitude: number;
  /**
   * Projected coordinates are stored in the database to avoid projecting the
   * same point on every request. They are optional so that scripts and tests
   * can pass raw GPS coordinates only.
   */
  projectedX?: number | null;
  projectedY?: number | null;
  observedAt: Date | string;
}

/** Parameters of the spatial model. */
export interface ActivityModelOptions {
  /** Scientific grid size in metres. Defaults to 10 m. */
  gridSize?: number;
  /**
   * Display resolution in metres (multiple of gridSize).
   * The model is always evaluated at gridSize; coarse cells average all the
   * underlying fine cells, including those with a zero score.
   */
  resolution?: number;
  /** Influence radius in metres. Defaults to 100 m. */
  radius?: number;
  /** Optional Lambert-93 bounds used to restrict the computed area. */
  bbox?: LambertBounds;
}

/** One aggregated activity value, before or after display normalisation. */
export interface ActivityCell {
  cellId: CellId;
  gridX: number;
  gridY: number;
  /** Southwest corner, Lambert-93 metres. */
  cellX: number;
  cellY: number;
  /** Cell centre, Lambert-93 metres. */
  centerX: number;
  centerY: number;
  /** Raw observation-derived score: the sum of all contributions. */
  score: number;
  /** Number of distinct validated reports contributing to this cell. */
  contributingReports: number;
  /** Most recent observation date among contributing reports (ISO string). */
  latestObservedAt: string | null;
}
