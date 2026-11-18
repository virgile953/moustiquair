/**
 * Reproducible synthetic dataset for demonstrations and classroom tests.
 *
 * All records are marked `isDemo = true`. Seeding always deletes the previous
 * demo dataset first, so the operation is safe and idempotent: real reports
 * are never touched.
 *
 * Positions are generated in Lambert-93 so that the spatial spread is
 * expressed in metres, then converted back to GPS for storage.
 */

import { eq } from "drizzle-orm";
import type { MosquitoCount, ReporterConfidence } from "../config/model";
import { isInsideBoundary } from "../geo/boundary";
import { HERBLAY_BOUNDARY_BBOX, HERBLAY_BOUNDARY_GEOMETRY } from "../geo/herblay-boundary";
import { lambert93ToLonLat, lonLatToLambert93 } from "../geo/projection";
import { addDaysToDateKey, parisDateKey, parisWallTimeToUtc } from "../time";
import { getDb } from "./client";
import { sightings } from "./schema";

/** Five deliberate hotspots, all verified inside the commune. */
const HOTSPOTS: { longitude: number; latitude: number; weight: number; spread: number }[] = [
  { longitude: 2.15892, latitude: 48.99116, weight: 1.1, spread: 58 }, // south
  { longitude: 2.13914, latitude: 48.99919, weight: 1.0, spread: 52 }, // west
  { longitude: 2.15233, latitude: 49.00321, weight: 1.3, spread: 64 }, // centre
  { longitude: 2.16552, latitude: 49.00723, weight: 0.9, spread: 55 }, // north-east
  { longitude: 2.13255, latitude: 49.01125, weight: 0.7, spread: 48 }, // north-west
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

function randomPointInside(random: () => number): { longitude: number; latitude: number } {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const longitude =
      HERBLAY_BOUNDARY_BBOX.minLon +
      random() * (HERBLAY_BOUNDARY_BBOX.maxLon - HERBLAY_BOUNDARY_BBOX.minLon);
    const latitude =
      HERBLAY_BOUNDARY_BBOX.minLat +
      random() * (HERBLAY_BOUNDARY_BBOX.maxLat - HERBLAY_BOUNDARY_BBOX.minLat);
    if (isInsideBoundary(longitude, latitude, HERBLAY_BOUNDARY_GEOMETRY)) {
      return { longitude, latitude };
    }
  }
  throw new Error("Unable to generate a demo point inside Herblay-sur-Seine.");
}

function gaussianPointAround(
  random: () => number,
  center: { longitude: number; latitude: number },
  spreadMeters: number,
): { longitude: number; latitude: number } | null {
  const projected = lonLatToLambert93(center);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const point = {
      x: projected.x + gaussian(random) * spreadMeters,
      y: projected.y + gaussian(random) * spreadMeters,
    };
    const { longitude, latitude } = lambert93ToLonLat(point);
    if (isInsideBoundary(longitude, latitude, HERBLAY_BOUNDARY_GEOMETRY)) {
      return { longitude, latitude };
    }
  }
  return null;
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

export function clearDemoData(): number {
  const db = getDb();
  const before = db
    .select({ id: sightings.id })
    .from(sightings)
    .where(eq(sightings.isDemo, true))
    .all().length;
  db.delete(sightings).where(eq(sightings.isDemo, true)).run();
  return before;
}

export function seedDemoData(now: Date = new Date()): DemoSeedResult {
  const db = getDb();
  const random = mulberry32(20260921);

  clearDemoData();

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
      id: `demo-${String(index).padStart(3, "0")}`,
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
  for (let hotspotIndex = 0; hotspotIndex < HOTSPOTS.length; hotspotIndex += 1) {
    const hotspot = HOTSPOTS[hotspotIndex];
    if (!hotspot) continue;
    const count = hotspotCounts[hotspotIndex] ?? 18;
    for (let i = 0; i < count; i += 1) {
      const point = gaussianPointAround(random, hotspot, hotspot.spread);
      if (!point) continue;
      addSighting(point.longitude, point.latitude, "approved", randomDayOffset(random));
    }
  }

  // 2. Isolated approved observations spread across the town.
  for (let i = 0; i < 24; i += 1) {
    const point = randomPointInside(random);
    addSighting(point.longitude, point.latitude, "approved", randomDayOffset(random));
  }

  // 3. Pending reports for practising moderation.
  for (let i = 0; i < 10; i += 1) {
    const hotspot = HOTSPOTS[i % HOTSPOTS.length];
    if (!hotspot) continue;
    const point =
      random() < 0.7 ? gaussianPointAround(random, hotspot, 220) : randomPointInside(random);
    if (!point) continue;
    addSighting(point.longitude, point.latitude, "pending", Math.floor(random() * 12));
  }

  // 4. A few rejected reports demonstrate that moderation works.
  for (let i = 0; i < 3; i += 1) {
    const point = randomPointInside(random);
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
    hotspots: HOTSPOTS.length,
  };
}
