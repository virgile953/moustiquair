/**
 * Test preload.
 *
 * It runs before any test file imports the database client, so the application
 * always talks to a throwaway SQLite database instead of `data/moustiquair.db`.
 * The real database and the demo dataset are never touched by `bun test`.
 */

import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { hashPassword } from "../src/lib/auth/password";
import { getDb } from "../src/lib/db/client";
import { TEST_ADMIN_PASSWORD } from "./constants";

const testDirectory = path.join(tmpdir(), "moustiquair-tests");
mkdirSync(testDirectory, { recursive: true });

process.env.DATABASE_PATH = path.join(testDirectory, `test-${process.pid}.db`);
process.env.SESSION_SECRET = "test-session-secret-not-used-in-production";
process.env.SESSION_TTL_HOURS = "1";
process.env.ADMIN_PASSWORD_HASH = hashPassword(TEST_ADMIN_PASSWORD);

migrate(getDb(), { migrationsFolder: path.join(process.cwd(), "drizzle") });

process.on("exit", () => {
  try {
    rmSync(process.env.DATABASE_PATH ?? "", { force: true });
    rmSync(`${process.env.DATABASE_PATH ?? ""}-wal`, { force: true });
    rmSync(`${process.env.DATABASE_PATH ?? ""}-shm`, { force: true });
  } catch {
    // Temporary files are harmless if the runtime has already closed them.
  }
});
