/**
 * Visual normalisation — deliberately separate from the scientific score.
 *
 * Raw scores can exceed 1 when reports overlap. Painting every value above 1
 * in the same colour would hide the differences between moderately and highly
 * reported areas. Instead we compress the raw score into [0, 1):
 *
 *   intensity(score) = 1 - exp(-score / scale)
 *
 * `scale` is fixed by configuration, not by the viewport, so a cell keeps the
 * same colour when the user zooms or pans.
 *
 * The intensity is a display value. It must never be used as a scientific
 * result, and the raw score stays available next to it.
 */

import { ACTIVITY_LEVEL_THRESHOLDS, INTENSITY_SCALE } from "../config/model";

export type ActivityLevel = "none" | "low" | "moderate" | "high";

/** Compress a non-negative raw score into a 0–1 visual intensity. */
export function normalizeActivityScore(score: number, scale: number = INTENSITY_SCALE): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  if (!Number.isFinite(scale) || scale <= 0) return 0;
  return 1 - Math.exp(-score / scale);
}

/** Fixed textual categories, independent of the current viewport. */
export function getActivityLevel(score: number): ActivityLevel {
  if (!Number.isFinite(score) || score <= 0) return "none";
  if (score < ACTIVITY_LEVEL_THRESHOLDS.moderate) return "low";
  if (score < ACTIVITY_LEVEL_THRESHOLDS.high) return "moderate";
  return "high";
}

export function getActivityLevelLabel(level: ActivityLevel): string {
  switch (level) {
    case "none":
      return "Aucune activité signalée";
    case "low":
      return "Activité faible";
    case "moderate":
      return "Activité modérée";
    case "high":
      return "Activité élevée";
  }
}

/** French decimal formatting: 1.24 becomes "1,24". */
export function formatActivityScore(score: number, digits = 2): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(score);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}
