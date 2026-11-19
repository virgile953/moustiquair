/**
 * Queries used by the teacher interface.
 * These rows contain private data (coordinates, notes) and must never be sent
 * to a public endpoint. Every query is scoped to one supported commune.
 */

import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { DEFAULT_CITY_INSEE } from "./cities";
import type { SightingStatus } from "./config/model";
import { getDb } from "./db/client";
import { sightings } from "./db/schema";

export interface AdminSighting {
  id: string;
  cityInsee: string;
  longitude: number;
  latitude: number;
  observedAt: string;
  createdAt: string;
  mosquitoCount: string;
  reporterConfidence: "likely" | "certain";
  notes: string | null;
  status: SightingStatus;
  isDemo: boolean;
  reviewedAt: string | null;
}

export type AdminStatusFilter = "all" | SightingStatus;

export interface AdminSightingList {
  items: AdminSighting[];
  total: number;
  counts: Record<SightingStatus, number>;
}

function toAdminSighting(row: typeof sightings.$inferSelect): AdminSighting {
  return {
    id: row.id,
    cityInsee: row.cityInsee,
    longitude: row.longitude,
    latitude: row.latitude,
    observedAt: row.observedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    mosquitoCount: row.mosquitoCount,
    reporterConfidence: row.reporterConfidence,
    notes: row.notes,
    status: row.status,
    isDemo: row.isDemo,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

export function listSightings(options: {
  status?: AdminStatusFilter;
  cityInsee?: string;
  limit?: number;
  offset?: number;
}): AdminSightingList {
  const db = getDb();
  const status = options.status ?? "pending";
  const cityInsee = options.cityInsee ?? DEFAULT_CITY_INSEE;
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  // The city filter is always applied: a teacher moderating Saint-Leu must
  // never see (or count) Herblay reports.
  const conditions: SQL[] = [eq(sightings.cityInsee, cityInsee)];
  if (status !== "all") conditions.push(eq(sightings.status, status));
  const where = and(...conditions);

  const rows = db
    .select()
    .from(sightings)
    .where(where)
    .orderBy(desc(sightings.observedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const total = db.select({ value: count() }).from(sightings).where(where).get()?.value ?? 0;

  const statusRows = db
    .select({ status: sightings.status, value: count() })
    .from(sightings)
    .where(eq(sightings.cityInsee, cityInsee))
    .groupBy(sightings.status)
    .all();

  const counts: Record<SightingStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of statusRows) {
    counts[row.status] = row.value;
  }

  return {
    items: rows.map(toAdminSighting),
    total,
    counts,
  };
}

export function reviewSighting(
  id: string,
  status: "approved" | "rejected",
  cityInsee: string = DEFAULT_CITY_INSEE,
): AdminSighting | null {
  const db = getDb();
  const scopedWhere = and(eq(sightings.id, id), eq(sightings.cityInsee, cityInsee));
  const existing = db.select().from(sightings).where(scopedWhere).get();
  if (!existing) return null;

  const now = new Date();
  db.update(sightings).set({ status, reviewedAt: now, updatedAt: now }).where(scopedWhere).run();

  const updated = db.select().from(sightings).where(scopedWhere).get();
  if (!updated) return null;

  return toAdminSighting(updated);
}
