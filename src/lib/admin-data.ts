/**
 * Queries used by the teacher interface.
 * These rows contain private data (coordinates, notes) and must never be sent
 * to a public endpoint.
 */

import { and, count, desc, eq, type SQL } from "drizzle-orm";
import type { SightingStatus } from "./config/model";
import { getDb } from "./db/client";
import { sightings } from "./db/schema";

export interface AdminSighting {
  id: string;
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

export function listSightings(options: {
  status?: AdminStatusFilter;
  limit?: number;
  offset?: number;
}): AdminSightingList {
  const db = getDb();
  const status = options.status ?? "pending";
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const conditions: SQL[] = [];
  if (status !== "all") conditions.push(eq(sightings.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

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
    items: rows.map((row) => ({
      id: row.id,
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
    })),
    total,
    counts,
  };
}

export function reviewSighting(id: string, status: "approved" | "rejected"): AdminSighting | null {
  const db = getDb();
  const existing = db.select().from(sightings).where(eq(sightings.id, id)).get();
  if (!existing) return null;

  const now = new Date();
  db.update(sightings)
    .set({ status, reviewedAt: now, updatedAt: now })
    .where(eq(sightings.id, id))
    .run();

  const updated = db.select().from(sightings).where(eq(sightings.id, id)).get();
  if (!updated) return null;

  return {
    id: updated.id,
    longitude: updated.longitude,
    latitude: updated.latitude,
    observedAt: updated.observedAt.toISOString(),
    createdAt: updated.createdAt.toISOString(),
    mosquitoCount: updated.mosquitoCount,
    reporterConfidence: updated.reporterConfidence,
    notes: updated.notes,
    status: updated.status,
    isDemo: updated.isDemo,
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
  };
}
