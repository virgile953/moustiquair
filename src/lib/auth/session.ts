/**
 * Teacher authentication.
 *
 * A single teacher account is configured with ADMIN_PASSWORD_HASH. Successful
 * login creates an opaque random token; only its HMAC is stored in SQLite.
 * The cookie is HttpOnly, SameSite=Strict, Secure in production, and expires.
 */

import { createHmac, randomBytes } from "node:crypto";

import { eq, lt } from "drizzle-orm";

import { getSessionSecret, getSessionTtlHours, isProduction } from "../config/env";
import { getDb } from "../db/client";
import { sessions } from "../db/schema";
import { verifyPassword } from "./password";

export const SESSION_COOKIE_NAME = "moustiquair_session";
export const CSRF_HEADER_NAME = "x-moustiquair-csrf";
export const CSRF_HEADER_VALUE = "1";

export interface TeacherSession {
  id: string;
  expiresAt: Date;
}

function hashToken(token: string): string {
  return createHmac("sha256", getSessionSecret()).update(token).digest("hex");
}

export function verifyAdminPassword(password: string, storedHash: string): boolean {
  return verifyPassword(password, storedHash);
}

/** Create a new teacher session and return the raw token for the cookie. */
export function createTeacherSession(): { token: string; expiresAt: Date } {
  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getSessionTtlHours() * 3_600_000);

  // Housekeeping: expired sessions are useless.
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run();

  const token = randomBytes(32).toString("base64url");
  db.insert(sessions)
    .values({
      id: hashToken(token),
      createdAt: now,
      expiresAt,
    })
    .run();

  return { token, expiresAt };
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    if (trimmed.slice(0, separator) === name) {
      return decodeURIComponent(trimmed.slice(separator + 1));
    }
  }
  return null;
}

/** Resolve a session from a raw Cookie header (API routes). */
export function getSessionFromCookieHeader(cookieHeader: string | null): TeacherSession | null {
  const token = readCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (!token) return null;

  const db = getDb();
  const hash = hashToken(token);
  const row = db.select().from(sessions).where(eq(sessions.id, hash)).get();
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    db.delete(sessions).where(eq(sessions.id, hash)).run();
    return null;
  }

  return { id: row.id, expiresAt: row.expiresAt };
}

export function getSessionFromRequest(request: Request): TeacherSession | null {
  return getSessionFromCookieHeader(request.headers.get("cookie"));
}

export function destroySession(cookieHeader: string | null): void {
  const token = readCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (!token) return;
  getDb()
    .delete(sessions)
    .where(eq(sessions.id, hashToken(token)))
    .run();
}

/** Build the Set-Cookie value for a new session. */
export function sessionCookie(token: string, expiresAt: Date): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

export function clearedSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

export interface AdminAuthorization {
  session: TeacherSession;
}

/**
 * Authorise a state-changing admin request.
 * Returns a string code describing the failure, or a session.
 *
 * SameSite=Strict already blocks most cross-site form posts; the Origin check
 * and custom header add a second line of defence (CSRF).
 */
export function authorizeAdminRequest(
  request: Request,
): { ok: true; session: TeacherSession } | { ok: false; status: number; code: string } {
  const session = getSessionFromRequest(request);
  if (!session) return { ok: false, status: 401, code: "UNAUTHENTICATED" };

  const csrfHeader = request.headers.get(CSRF_HEADER_NAME);
  if (csrfHeader !== CSRF_HEADER_VALUE) {
    return { ok: false, status: 403, code: "CSRF_HEADER_MISSING" };
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return { ok: false, status: 403, code: "CROSS_SITE_REQUEST" };
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const requestHost = request.headers.get("host") ?? new URL(request.url).host;
      if (originHost !== requestHost) {
        return { ok: false, status: 403, code: "ORIGIN_MISMATCH" };
      }
    } catch {
      return { ok: false, status: 403, code: "INVALID_ORIGIN" };
    }
  }

  return { ok: true, session };
}

/** For read-only admin routes: authentication only, no CSRF token needed. */
export function requireAdminRead(request: Request): TeacherSession | null {
  return getSessionFromRequest(request);
}
