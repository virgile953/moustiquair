import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleApiError, jsonError } from "@/lib/api";
import { authorizeAdminRequest } from "@/lib/auth/session";
import { clearDemoData } from "@/lib/db/seed";

/** DELETE /api/admin/demo — remove demo records only, never real reports. */
export function DELETE(request: NextRequest) {
  try {
    const authorization = authorizeAdminRequest(request);
    if (!authorization.ok) {
      return jsonError(
        authorization.status,
        authorization.code,
        authorization.status === 401 ? "Connexion enseignant requise." : "Requête refusée.",
      );
    }

    const removed = clearDemoData();
    return NextResponse.json({ ok: true, removed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
