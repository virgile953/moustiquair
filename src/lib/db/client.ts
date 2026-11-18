/**
 * Bun-native SQLite connection.
 *
 * We use `bun:sqlite` (not better-sqlite3) because Bun is both the package
 * manager and the runtime for this project. WAL mode keeps reads fast while a
 * teacher approves a report, and foreign keys are enabled for correctness.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { drizzle } from "drizzle-orm/bun-sqlite";

import { getDatabasePath } from "../config/env";
import * as schema from "./schema";

type DrizzleDatabase = ReturnType<typeof createDatabase>["db"];

function resolveDatabaseFile(): string {
  const configured = getDatabasePath();
  // The database path comes from an environment variable. The Turbopack hint
  // avoids tracing the whole project when the path is not statically known.
  return isAbsolute(configured)
    ? configured
    : resolve(/* turbopackIgnore: true */ process.cwd(), configured);
}

function createDatabase() {
  const filename = resolveDatabaseFile();
  mkdirSync(dirname(filename), { recursive: true });

  const sqlite = new Database(filename, { create: true });
  // WAL allows a reader (map) and a writer (moderation) to coexist.
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA busy_timeout = 5000;");

  const db = drizzle(sqlite, { schema });
  return { sqlite, db, filename };
}

// Next.js development mode reloads modules. Keeping the connection on
// globalThis prevents a new SQLite handle from being opened on every reload.
const globalForDb = globalThis as unknown as {
  __moustiquairDatabase?: ReturnType<typeof createDatabase>;
};

function database() {
  if (!globalForDb.__moustiquairDatabase) {
    globalForDb.__moustiquairDatabase = createDatabase();
  }
  return globalForDb.__moustiquairDatabase;
}

export function getDb(): DrizzleDatabase {
  return database().db;
}

export function getSqlite(): Database {
  return database().sqlite;
}

export function getDatabaseFilename(): string {
  return database().filename;
}

/** Used by tests and scripts that need to release the file handle. */
export function closeDb(): void {
  const existing = globalForDb.__moustiquairDatabase;
  if (existing) {
    existing.sqlite.close();
    globalForDb.__moustiquairDatabase = undefined;
  }
}

export type { DrizzleDatabase };
