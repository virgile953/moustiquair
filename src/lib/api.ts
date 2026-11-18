/**
 * Shared helpers for JSON API routes:
 * consistent error bodies, body size limits and query parsing.
 */

import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";

export const JSON_BODY_LIMIT_BYTES = 16 * 1024;

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, string[]>,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

/** Read and parse a JSON body while enforcing a maximum payload size. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > JSON_BODY_LIMIT_BYTES) {
    throw new RequestError(413, "PAYLOAD_TOO_LARGE", "Le contenu envoyé est trop volumineux.");
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new RequestError(400, "INVALID_BODY", "Impossible de lire le contenu envoyé.");
  }

  // Measure the actual UTF-8 size, not JavaScript string length.
  if (new TextEncoder().encode(text).byteLength > JSON_BODY_LIMIT_BYTES) {
    throw new RequestError(413, "PAYLOAD_TOO_LARGE", "Le contenu envoyé est trop volumineux.");
  }
  if (text.trim().length === 0) {
    throw new RequestError(400, "EMPTY_BODY", "Le contenu envoyé est vide.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError(400, "INVALID_JSON", "Le contenu envoyé n'est pas un JSON valide.");
  }
}

/** Convert Zod issues into a compact field => messages map. */
export function zodDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    const bucket = details[path] ?? [];
    bucket.push(issue.message);
    details[path] = bucket;
  }
  return details;
}

export function parseWithSchema<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new RequestError(
      400,
      "VALIDATION_ERROR",
      "Certaines informations du formulaire sont invalides.",
      zodDetails(result.error),
    );
  }
  return result.data;
}

/** Convert an unknown thrown value into a JSON response. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof RequestError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }
  console.error("[api] Unexpected error:", error);
  return jsonError(500, "INTERNAL_ERROR", "Une erreur interne est survenue. Réessayez plus tard.");
}

/** True when the request looks like it comes from another site. */
export function isCrossSiteRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return true;
  }
}

export function noStoreHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Cache-Control": "no-store",
    ...extra,
  };
}
