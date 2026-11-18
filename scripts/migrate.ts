/**
 * Apply Drizzle migrations to the SQLite database.
 * Usage: bun run db:migrate
 */

import { resolve } from "node:path";

import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { getDatabaseFilename, getDb } from "../src/lib/db/client";

const migrationsFolder = resolve(import.meta.dir, "../drizzle");

migrate(getDb(), { migrationsFolder });

console.log(`Migrations applied to ${getDatabaseFilename()}`);
