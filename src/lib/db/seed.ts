/**
 * Reproducible synthetic dataset for demonstrations and classroom tests.
 *
 * All records are marked `isDemo = true`. Seeding a city deletes only that
 * city's previous demo dataset, so the operation is safe and idempotent: real
 * reports and other cities are never touched.
 *
 * Positions are generated in Lambert-93 so that the spatial spread is
 * expressed in metres, then converted back to GPS for storage.
 */

import { and, eq } from "drizzle-orm";

import { type City, DEFAULT_CITY, SUPPORTED_CITIES } from "../cities";
import type { MosquitoCount, ReporterConfidence } from "../config/model";
import { isInsideBoundary } from "../geo/boundary";
import { getCityBoundaryGeometry, getCityBoundingBox } from "../geo/city-boundaries";
import { lambert93ToLonLat, lonLatToLambert93 } from "../geo/projection";
import type { LonLat } from "../geo/types";
import { addDaysToDateKey, parisDateKey, parisWallTimeToUtc } from "../time";
import { getDb } from "./client";
import { sightings } from "./schema";

interface DemoHotspot {
  longitude: number;
  latitude: number;
  spread: number;
}

/** Five curated hotspots for Herblay, kept stable for the original demo. */
const HERBLAY_HOTSPOTS: DemoHotspot[] = [
  { longitude: 2.15892, latitude: 48.99116, spread: 58 }, // south
  { longitude: 2.13914, latitude: 48.99919, spread: 52 }, // west
  { longitude: 2.15233, latitude: 49.00321, spread: 64 }, // centre
  { longitude: 2.16552, latitude: 49.00723, spread: 55 }, // north-east
  { longitude: 2.13255, latitude: 49.01125, spread: 48 }, // north-west
];

const NOTES = [
  "Vu près du jardin, en fin de journée.",
  "Plusieurs piqûres pendant le repas dehors.",
  "Moustique noir et blanc, assez petit.",
  "Présent autour des plantes en pot.",
  "Activité surtout à l'ombre, vers 19 h.",
  "Vu près du point d'eau du quartier.",
  "Vol lent, proche du sol.",
];

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function random(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  // Box–Muller transform.
  const u = Math.max(random(), Number.EPSILON);
  const v = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pick<T>(random: () => number, values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error("Cannot pick from an empty list.");
  return value;
}

function randomPointInside(random: () => number, city: City): LonLat {
  const boundary = getCityBoundaryGeometry(city.insee);
  const bbox = getCityBoundingBox(city.insee);
  if (!boundary || !bbox) throw new Error(`No boundary found for ${city.name}.`);

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const longitude = bbox.minLon + random() * (bbox.maxLon - bbox.minLon);
    const latitude = bbox.minLat + random() * (bbox.maxLat - bbox.minLat);
    if (isInsideBoundary(longitude, latitude, boundary)) {
      return { longitude, latitude };
    }
  }
  throw new Error(`Unable to generate a demo point inside ${city.name}.`);
}

function gaussianPointAround(
  random: () => number,
  city: City,
  center: LonLat,
  spreadMeters: number,
): LonLat | null {
  const boundary = getCityBoundaryGeometry(city.insee);
  if (!boundary) throw new Error(`No boundary found for ${city.name}.`);
  const projected = lonLatToLambert93(center);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const point = {
      x: projected.x + gaussian(random) * spreadMeters,
      y: projected.y + gaussian(random) * spreadMeters,
    };
    const { longitude, latitude } = lambert93ToLonLat(point);
    if (isInsideBoundary(longitude, latitude, boundary)) {
      return { longitude, latitude };
    }
  }
  return null;
}

/**
 * Herblay keeps its hand-placed hotspots. Other communes get five deterministic
 * clusters around their official centre, which produces a convincing demo
 * without pretending that any real neighbourhood is infested.
 */
function buildHotspots(city: City, random: () => number): DemoHotspot[] {
  if (city.insee === "95306") return HERBLAY_HOTSPOTS;

  const boundary = getCityBoundaryGeometry(city.insee);
  if (!boundary) throw new Error(`No boundary found for ${city.name}.`);
  const center = lonLatToLambert93(city.center);
  const offsets = [
    { x: 0, y: 0 },
    { x: 480, y: 160 },
    { x: -420, y: 300 },
    { x: 260, y: -430 },
    { x: -380, y: -280 },
  ];
  const spreads = [58, 52, 64, 55, 48];
  const hotspots: DemoHotspot[] = [];

  for (let index = 0; index < offsets.length; index += 1) {
    const offset = offsets[index];
    if (!offset) continue;
    const { longitude, latitude } = lambert93ToLonLat({
      x: center.x + offset.x,
      y: center.y + offset.y,
    });
    const point = isInsideBoundary(longitude, latitude, boundary)
      ? { longitude, latitude }
      : randomPointInside(random, city);
    hotspots.push({ ...point, spread: spreads[index] ?? 55 });
  }

  return hotspots;
}

function randomDayOffset(random: () => number, maxDays = 90): number {
  // More observations in the recent past, so the 7/30/90 day filters differ.
  return Math.min(maxDays - 1, Math.floor(random() ** 1.55 * maxDays));
}

function observedTimestamp(random: () => number, now: Date, daysAgo: number): Date {
  const today = parisDateKey(now);
  const dateKey = addDaysToDateKey(today, -daysAgo);
  const hour = 7 + Math.floor(random() * 14); // 07:00 – 20:00 Paris time
  const date = parisWallTimeToUtc(dateKey, hour, Math.floor(random() * 60));
  return date.getTime() > now.getTime() ? now : date;
}

export interface DemoSeedResult {
  inserted: number;
  approved: number;
  pending: number;
  rejected: number;
  hotspots: number;
}

/** Remove demo rows, optionally only for one commune. */
export function clearDemoData(cityInsee?: string): number {
  const db = getDb();
  const condition = cityInsee
    ? and(eq(sightings.isDemo, true), eq(sightings.cityInsee, cityInsee))
    : eq(sightings.isDemo, true);

  const before = db.select({ id: sightings.id }).from(sightings).where(condition).all().length;
  db.delete(sightings).where(condition).run();
  return before;
}

export function seedDemoData(city: City = DEFAULT_CITY, now: Date = new Date()): DemoSeedResult {
  const db = getDb();
  const hotspots = buildHotspots(city, mulberry32(20260921 + Number(city.insee)));
  // Keep the original Herblay sequence so its curated map does not change.
  const random = mulberry32(city.insee === "95306" ? 20260921 : 20260921 + Number(city.insee));

  clearDemoData(city.insee);

  const mosquitoCounts: readonly MosquitoCount[] = [
    "1",
    "1",
    "2-5",
    "2-5",
    "2-5",
    "6-10",
    "6-10",
    "10+",
    "unknown",
  ];

  let index = 0;
  const rows: (typeof sightings.$inferInsert)[] = [];

  const addSighting = (
    longitude: number,
    latitude: number,
    status: "approved" | "pending" | "rejected",
    daysAgo: number,
  ) => {
    const projected = lonLatToLambert93({ longitude, latitude });
    const observedAt = observedTimestamp(random, now, daysAgo);
    const createdAt = new Date(Math.min(now.getTime(), observedAt.getTime() + 3 * 3_600_000));
    const reviewedAt =
      status === "pending"
        ? null
        : new Date(Math.min(now.getTime(), createdAt.getTime() + 2 * 3_600_000));

    index += 1;
    rows.push({
      id: `demo-${city.insee}-${String(index).padStart(3, "0")}`,
      cityInsee: city.insee,
      longitude,
      latitude,
      projectedX: projected.x,
      projectedY: projected.y,
      observedAt,
      createdAt,
      updatedAt: createdAt,
      mosquitoCount: pick(random, mosquitoCounts),
      reporterConfidence: (random() < 0.72 ? "likely" : "certain") satisfies ReporterConfidence,
      notes: random() < 0.32 ? pick(random, NOTES) : null,
      status,
      isDemo: true,
      reviewedAt,
    });
  };

  // 1. Hotspots: 92 approved reports, with 18 or 19 per hotspot.
  const hotspotCounts = [19, 18, 20, 18, 17];
  for (let hotspotIndex = 0; hotspotIndex < hotspots.length; hotspotIndex += 1) {
    const hotspot = hotspots[hotspotIndex];
    if (!hotspot) continue;
    const count = hotspotCounts[hotspotIndex] ?? 18;
    for (let i = 0; i < count; i += 1) {
      const point = gaussianPointAround(random, city, hotspot, hotspot.spread);
      if (!point) continue;
      addSighting(point.longitude, point.latitude, "approved", randomDayOffset(random));
    }
  }

  // 2. Isolated approved observations spread across the commune.
  for (let i = 0; i < 24; i += 1) {
    const point = randomPointInside(random, city);
    addSighting(point.longitude, point.latitude, "approved", randomDayOffset(random));
  }

  // 3. Pending reports for practising moderation.
  for (let i = 0; i < 10; i += 1) {
    const hotspot = hotspots[i % hotspots.length];
    if (!hotspot) continue;
    const point =
      random() < 0.7
        ? gaussianPointAround(random, city, hotspot, 220)
        : randomPointInside(random, city);
    if (!point) continue;
    addSighting(point.longitude, point.latitude, "pending", Math.floor(random() * 12));
  }

  // 4. A few rejected reports demonstrate that moderation works.
  for (let i = 0; i < 3; i += 1) {
    const point = randomPointInside(random, city);
    addSighting(point.longitude, point.latitude, "rejected", 5 + Math.floor(random() * 40));
  }

  db.transaction((tx) => {
    for (const row of rows) {
      tx.insert(sightings).values(row).run();
    }
  });

  return {
    inserted: rows.length,
    approved: rows.filter((row) => row.status === "approved").length,
    pending: rows.filter((row) => row.status === "pending").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
    hotspots: hotspots.length,
  };
}

/** Seed every supported commune; used by `bun run db:seed`. */
export function seedAllDemoData(now: Date = new Date()): Map<string, DemoSeedResult> {
  const results = new Map<string, DemoSeedResult>();
  for (const city of SUPPORTED_CITIES) {
    results.set(city.insee, seedDemoData(city, now));
  }
  return results;
}
