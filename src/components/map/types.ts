import type { FeatureCollection, Polygon } from "geojson";

/** Properties returned by GET /api/map/grid. */
export interface ActivityFeatureProperties {
  cellId: string;
  score: number;
  intensity: number;
  level: "none" | "low" | "moderate" | "high";
  contributingReports: number;
  resolution: number;
  latestObservedAt?: string;
}

export type ActivityCollection = FeatureCollection<Polygon, ActivityFeatureProperties>;

/** The subset of a cell we keep for the information panel. */
export interface SelectedCell {
  cellId: string;
  score: number;
  intensity: number;
  level: ActivityFeatureProperties["level"];
  contributingReports: number;
  resolution: number;
}

/** Aggregates returned by GET /api/stats. */
export interface MapStats {
  period: string;
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

export interface ActivityLoadState {
  loading: boolean;
  error: string | null;
  featureCount: number;
  resolution: number;
}

export const EMPTY_ACTIVITY: ActivityCollection = {
  type: "FeatureCollection",
  features: [],
};
