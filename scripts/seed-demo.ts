/**
 * Create the reproducible demo dataset.
 * Usage: bun run db:seed (or bun run db:reset-demo)
 */

import { resolve } from "node:path";

import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { getDatabaseFilename, getDb } from "../src/lib/db/client";
import { seedDemoData } from "../src/lib/db/seed";

migrate(getDb(), { migrationsFolder: resolve(import.meta.dir, "../drizzle") });

const result = seedDemoData();

console.log(`Base : ${getDatabaseFilename()}`);
console.log(
  `Données de démonstration : ${result.inserted} signalements (${result.approved} validés, ` +
    `${result.pending} en attente, ${result.rejected} rejetés), ${result.hotspots} foyers simulés.`,
);
