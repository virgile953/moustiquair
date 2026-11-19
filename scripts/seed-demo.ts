/**
 * Create the reproducible demo dataset.
 *
 * Usage:
 *   bun run db:seed             # every supported commune (idempotent)
 *   bun run db:seed -- 95563    # one commune (INSEE code)
 */

import { resolve } from "node:path";

import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { getCityByInsee, SUPPORTED_CITIES } from "../src/lib/cities";
import { getDatabaseFilename, getDb } from "../src/lib/db/client";
import { type DemoSeedResult, seedAllDemoData, seedDemoData } from "../src/lib/db/seed";

migrate(getDb(), { migrationsFolder: resolve(import.meta.dir, "../drizzle") });

function printResult(label: string, result: DemoSeedResult): void {
  console.log(
    `${label} : ${result.inserted} signalements (${result.approved} validés, ` +
      `${result.pending} en attente, ${result.rejected} rejetés), ${result.hotspots} foyers simulés.`,
  );
}

const requestedInsee = process.argv[2]?.trim();

console.log(`Base : ${getDatabaseFilename()}`);

if (requestedInsee) {
  const city = getCityByInsee(requestedInsee);
  if (!city) {
    console.error(
      `Commune inconnue : ${requestedInsee}. Codes pris en charge : ${SUPPORTED_CITIES.map(
        (item) => `${item.insee} (${item.name})`,
      ).join(", ")}.`,
    );
    process.exit(1);
  }

  printResult(city.name, seedDemoData(city));
} else {
  const results = seedAllDemoData();
  let total = 0;

  for (const city of SUPPORTED_CITIES) {
    const result = results.get(city.insee);
    if (!result) continue;
    total += result.inserted;
    printResult(city.name, result);
  }

  console.log(
    `Total : ${total} signalements de démonstration sur ${SUPPORTED_CITIES.length} communes.`,
  );
}
