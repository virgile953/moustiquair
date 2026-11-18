import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { authorizeAdminRequest, clearedSessionCookie, destroySession } from "@/lib/auth/session";

/** POST /api/admin/logout — invalidates the session server-side. */
export function POST(request: NextRequest) {
  const authorization = authorizeAdminRequest(request);
  if (!authorization.ok) {
    return jsonError(
      authorization.status,
      authorization.code,
      authorization.status === 401 ? "Connexion requise." : "Requête refusée.",
    );
  }

  destroySession(request.headers.get("cookie"));
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.headers.append("Set-Cookie", clearedSessionCookie());
  return response;
}
