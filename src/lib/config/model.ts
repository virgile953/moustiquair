/**
 * Scientific and visual parameters of the Moustiq'Air model.
 *
 * Every assumption is written here, in one place, so that it can be explained
 * to students and changed without hunting through the codebase.
 *
 * Important: these values describe a *relative observation activity index*.
 * They are not a mosquito population estimate, nor a public-health risk level.
 */

/** The scientific reference grid: each cell is a 10 m × 10 m square. */
export const GRID_SIZE_METERS = 10;

/**
 * A sighting influences cells up to 100 m away.
 *
 * This is a simplified teaching assumption based on the short flight range of
 * tiger mosquitoes. It is not a hard biological boundary.
 */
export const INFLUENCE_RADIUS_METERS = 100;

/**
 * Controls the visual red scale. `intensity = 1 - exp(-score / scale)`.
 * A larger scale makes the map appear lighter for the same raw score.
 */
export const INTENSITY_SCALE = 1.5;

/**
 * Privacy threshold: a public map cell is only published when at least this
 * many independent validated reports contribute to it.
 */
export const PUBLIC_MIN_CONTRIBUTING_REPORTS = 3;

/** Raw activity thresholds used for the textual level (low / moderate / high). */
export const ACTIVITY_LEVEL_THRESHOLDS = {
  moderate: 0.5,
  high: 1.5,
} as const;

/** Available display resolutions. The underlying scientific model stays at 10 m. */
export const DISPLAY_RESOLUTIONS = [10, 50, 100] as const;
export type DisplayResolution = (typeof DISPLAY_RESOLUTIONS)[number];

/**
 * Level-of-detail thresholds based on MapLibre zoom levels.
 * Below 13.5 we show 100 m cells, then 50 m, then the native 10 m grid.
 */
export const LOD_ZOOM_THRESHOLDS = {
  fine: 15.5,
  medium: 13.5,
} as const;

/** Default observation window. */
export const DEFAULT_PERIOD = "30" as const;

export const PERIODS = [
  { value: "7", label: "7 derniers jours", shortLabel: "7 jours", days: 7 },
  { value: "30", label: "30 derniers jours", shortLabel: "30 jours", days: 30 },
  { value: "90", label: "90 derniers jours", shortLabel: "90 jours", days: 90 },
  { value: "all", label: "Toute la période", shortLabel: "Tout", days: null },
] as const;

export type PeriodValue = (typeof PERIODS)[number]["value"];

export function isPeriodValue(value: string): value is PeriodValue {
  return PERIODS.some((period) => period.value === value);
}

export function getPeriodMeta(period: PeriodValue) {
  return PERIODS.find((entry) => entry.value === period) ?? PERIODS[1];
}

/** Reported mosquito-count categories (metadata, not a score multiplier). */
export const MOSQUITO_COUNT_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2-5", label: "2 – 5" },
  { value: "6-10", label: "6 – 10" },
  { value: "10+", label: "Plus de 10" },
  { value: "unknown", label: "Je ne sais pas" },
] as const;

export type MosquitoCount = (typeof MOSQUITO_COUNT_OPTIONS)[number]["value"];
export const MOSQUITO_COUNT_VALUES = MOSQUITO_COUNT_OPTIONS.map((option) => option.value) as [
  MosquitoCount,
  ...MosquitoCount[],
];

export const REPORTER_CONFIDENCE_OPTIONS = [
  { value: "likely", label: "Je pense avoir vu un moustique tigre." },
  { value: "certain", label: "Je suis certain(e) de mon identification." },
] as const;

export type ReporterConfidence = (typeof REPORTER_CONFIDENCE_OPTIONS)[number]["value"];
export const REPORTER_CONFIDENCE_VALUES = REPORTER_CONFIDENCE_OPTIONS.map(
  (option) => option.value,
) as [ReporterConfidence, ...ReporterConfidence[]];

export const SIGHTING_STATUSES = ["pending", "approved", "rejected"] as const;
export type SightingStatus = (typeof SIGHTING_STATUSES)[number];

/** Maximum age of an observation accepted by the public form. */
export const MAX_OBSERVATION_AGE_DAYS = 365;

/** Maximum free-text length in the report form. */
export const MAX_NOTES_LENGTH = 500;
