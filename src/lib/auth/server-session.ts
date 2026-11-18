/**
 * Read the teacher session from Next.js server components.
 *
 * API routes read the raw Cookie header, but server components use the
 * `cookies()` helper from `next/headers`. This small adapter keeps both worlds
 * on the same session verification code.
 */

import { cookies } from "next/headers";

import { getSessionFromCookieHeader, SESSION_COOKIE_NAME, type TeacherSession } from "./session";

export async function getServerSession(): Promise<TeacherSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const cookieHeader = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
  return getSessionFromCookieHeader(cookieHeader);
}
