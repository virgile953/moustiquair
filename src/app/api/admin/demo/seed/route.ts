import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleApiError, jsonError } from "@/lib/api";
import { authorizeAdminRequest } from "@/lib/auth/session";
import { seedDemoData } from "@/lib/db/seed";

/** POST /api/admin/demo/seed — restore the reproducible demo dataset. */
export function POST(request: NextRequest) {
  try {
    const authorization = authorizeAdminRequest(request);
    if (!authorization.ok) {
      return jsonError(
        authorization.status,
        authorization.code,
        authorization.status === 401 ? "Connexion enseignant requise." : "Requête refusée.",
      );
    }

    const result = seedDemoData();
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
