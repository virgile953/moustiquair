import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  handleApiError,
  isCrossSiteRequest,
  jsonError,
  parseWithSchema,
  readJsonBody,
} from "@/lib/api";
import { createTeacherSession, sessionCookie, verifyAdminPassword } from "@/lib/auth/session";
import { getAdminPasswordHash } from "@/lib/config/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { adminLoginSchema } from "@/lib/validation/schemas";

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** POST /api/admin/login — rate-limited password login. */
export async function POST(request: NextRequest) {
  try {
    if (isCrossSiteRequest(request)) {
      return jsonError(403, "CROSS_SITE_REQUEST", "Requête refusée.");
    }

    const rate = checkRateLimit(request, "admin-login", LOGIN_LIMIT, LOGIN_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Trop de tentatives. Réessayez dans quelques minutes.",
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfterSeconds),
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const payload = await readJsonBody(request);
    const input = parseWithSchema(adminLoginSchema, payload);

    let valid = false;
    try {
      valid = verifyAdminPassword(input.password, getAdminPasswordHash());
    } catch (error) {
      console.error("[auth] Admin password hash is not configured correctly.", error);
      return jsonError(
        500,
        "AUTH_NOT_CONFIGURED",
        "La connexion enseignant n'est pas configurée sur ce serveur.",
      );
    }

    if (!valid) {
      // Deliberately generic: do not reveal whether a configuration exists.
      return jsonError(401, "INVALID_CREDENTIALS", "Mot de passe incorrect.");
    }

    const session = createTeacherSession();
    const response = NextResponse.json(
      { ok: true, expiresAt: session.expiresAt.toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.headers.append("Set-Cookie", sessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
