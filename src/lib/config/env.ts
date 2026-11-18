/**
 * Server-side environment access.
 *
 * This module must never be imported from a client component: it reads secrets.
 */

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function getDatabasePath(): string {
  return optional("DATABASE_PATH") ?? "./data/moustiquair.db";
}

export function getAdminPasswordHash(): string {
  const hash = optional("ADMIN_PASSWORD_HASH");
  if (!hash) {
    throw new Error(
      "ADMIN_PASSWORD_HASH is missing. Run `bun run admin:hash` and add the result to .env.",
    );
  }
  return hash;
}

export function getSessionSecret(): string {
  const secret = optional("SESSION_SECRET");
  if (secret) return secret;

  // A development fallback keeps `bun run dev` pleasant after cloning, while
  // production deployments are forced to provide a real secret.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production (32+ random characters).");
  }
  return "moustiquair-development-secret-change-me";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getSessionTtlHours(): number {
  const raw = Number(optional("SESSION_TTL_HOURS") ?? "12");
  return Number.isFinite(raw) && raw > 0 ? raw : 12;
}
