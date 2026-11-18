/**
 * Small SQLite-backed rate limiter.
 *
 * We never store a raw IP address. The key is an HMAC of the client address
 * and a scope ("report", "login"), which is enough to count requests during a
 * time window without creating a browsing history.
 */

import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";

import { getSessionSecret } from "./config/env";
import { getDb } from "./db/client";
import { rateLimits } from "./db/schema";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const address =
    forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "local";
  const digest = createHmac("sha256", getSessionSecret())
    .update(`${scope}:${address}`)
    .digest("hex");
  return `${scope}:${digest.slice(0, 32)}`;
}

/**
 * Fixed-window rate limit.
 *
 * Kept intentionally simple: a proof of concept has a handful of simultaneous
 * users, and SQLite serialises writes correctly without an external service.
 */
export function checkRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const db = getDb();
  const key = clientKey(request, scope);
  const now = new Date();
  const row = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();

  if (!row || now.getTime() - row.windowStart.getTime() >= windowMs) {
    db.insert(rateLimits)
      .values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { windowStart: now, count: 1 },
      })
      .run();
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (row.count >= limit) {
    const elapsed = now.getTime() - row.windowStart.getTime();
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
    };
  }

  db.update(rateLimits)
    .set({ count: row.count + 1 })
    .where(eq(rateLimits.key, key))
    .run();

  return {
    allowed: true,
    remaining: limit - row.count - 1,
    retryAfterSeconds: 0,
  };
}

/** Reset helper for tests. */
export function clearRateLimits(): void {
  getDb().delete(rateLimits).run();
}
