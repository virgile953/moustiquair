/**
 * SQLite schema, defined with Drizzle ORM.
 *
 * Timestamps are stored as UTC epoch milliseconds (`timestamp_ms`). SQLite
 * has no dedicated time-zone type, so the application always creates and
 * displays dates through the helpers in `src/lib/time.ts`.
 */

import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sightings = sqliteTable(
  "sightings",
  {
    id: text("id").primaryKey(),

    // Public GPS coordinates, EPSG:4326.
    longitude: real("longitude").notNull(),
    latitude: real("latitude").notNull(),

    // Cached EPSG:2154 coordinates, in metres.
    projectedX: real("projected_x").notNull(),
    projectedY: real("projected_y").notNull(),

    // Supported study area (INSEE commune code). Existing rows default to
    // Herblay when the multi-city migration is applied.
    cityInsee: text("city_insee").notNull().default("95306"),

    // Observation day, stored at 12:00 Paris time.
    observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),

    mosquitoCount: text("mosquito_count", {
      enum: ["1", "2-5", "6-10", "10+", "unknown"],
    }).notNull(),
    reporterConfidence: text("reporter_confidence", {
      enum: ["likely", "certain"],
    }).notNull(),
    notes: text("notes"),

    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),

    // Demo records are clearly marked so they can be reset without touching
    // real student observations.
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),

    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("sightings_status_idx").on(table.status),
    index("sightings_city_idx").on(table.cityInsee),
    index("sightings_observed_at_idx").on(table.observedAt),
    index("sightings_demo_idx").on(table.isDemo),
    index("sightings_projected_idx").on(table.projectedX, table.projectedY),
  ],
);

/**
 * Opaque teacher sessions. Only a SHA-256 hash of the random token is stored,
 * so a database leak does not immediately expose usable session cookies.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("sessions_expires_idx").on(table.expiresAt)],
);

/**
 * Tiny SQLite-backed rate limiter. Keys are hashed client identifiers, never
 * raw IP addresses.
 */
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
  count: integer("count").notNull(),
});

export type SightingRow = typeof sightings.$inferSelect;
export type NewSightingRow = typeof sightings.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
