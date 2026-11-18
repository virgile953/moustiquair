import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  handleApiError,
  isCrossSiteRequest,
  jsonError,
  parseWithSchema,
  RequestError,
  readJsonBody,
} from "@/lib/api";
import { MAX_OBSERVATION_AGE_DAYS, type SightingStatus } from "@/lib/config/model";
import { getDb } from "@/lib/db/client";
import { sightings } from "@/lib/db/schema";
import { isInsideBoundary } from "@/lib/geo/boundary";
import { HERBLAY_BOUNDARY_GEOMETRY } from "@/lib/geo/herblay-boundary";
import { projectSighting } from "@/lib/geo/projection";
import { checkRateLimit } from "@/lib/rate-limit";
import { daysBetweenDateKeys, isFutureDateKey, parisDateKey, parisWallTimeToUtc } from "@/lib/time";
import { sightingSubmissionSchema } from "@/lib/validation/schemas";

const REPORT_LIMIT = 5;
const REPORT_WINDOW_MS = 15 * 60 * 1000;

/**
 * POST /api/sightings
 *
 * Public report submission. Every report starts as `pending`; it cannot alter
 * the public map until a teacher approves it.
 */
export async function POST(request: NextRequest) {
  try {
    if (isCrossSiteRequest(request)) {
      return jsonError(403, "CROSS_SITE_REQUEST", "Requête refusée.");
    }

    const rate = checkRateLimit(request, "report", REPORT_LIMIT, REPORT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message:
              "Trop de signalements envoyés récemment. Patientez quelques minutes avant de réessayer.",
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
    const input = parseWithSchema(sightingSubmissionSchema, payload);

    // Honeypot: a bot filled a field that no human can see. Pretend success,
    // store nothing. This keeps the feedback deliberately unhelpful to bots.
    if (input.website.length > 0) {
      return NextResponse.json(
        {
          id: "pending",
          status: "pending" satisfies SightingStatus,
          message: "Merci ! Votre signalement a bien été envoyé et sera vérifié par un enseignant.",
        },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }

    const now = new Date();
    const today = parisDateKey(now);

    if (isFutureDateKey(input.observedOn, now)) {
      return jsonError(
        400,
        "FUTURE_OBSERVATION",
        "La date d'observation ne peut pas être future.",
        {
          observedOn: ["Choisissez aujourd'hui ou une date passée."],
        },
      );
    }

    const ageDays = daysBetweenDateKeys(input.observedOn, today);
    if (!Number.isFinite(ageDays) || ageDays > MAX_OBSERVATION_AGE_DAYS) {
      return jsonError(
        400,
        "OBSERVATION_TOO_OLD",
        `La date d'observation doit dater de moins de ${MAX_OBSERVATION_AGE_DAYS} jours.`,
        {
          observedOn: [
            `Cette observation est trop ancienne (${MAX_OBSERVATION_AGE_DAYS} jours maximum).`,
          ],
        },
      );
    }

    if (!isInsideBoundary(input.longitude, input.latitude, HERBLAY_BOUNDARY_GEOMETRY)) {
      return jsonError(
        422,
        "OUTSIDE_STUDY_AREA",
        "Ce point se trouve en dehors de la commune d'Herblay-sur-Seine.",
        { location: ["Placez le point à l'intérieur de la commune."] },
      );
    }

    let projected: { projectedX: number; projectedY: number };
    try {
      projected = projectSighting({
        longitude: input.longitude,
        latitude: input.latitude,
      });
    } catch {
      return jsonError(400, "INVALID_COORDINATES", "Les coordonnées sont invalides.");
    }

    // A date (not a precise time) is stored at 12:00 Paris time. This avoids
    // an observation jumping to the previous/next UTC day.
    const observedAt = parisWallTimeToUtc(input.observedOn, 12, 0);
    const notes = input.notes.trim().length > 0 ? input.notes.trim() : null;
    const id = randomUUID();

    getDb()
      .insert(sightings)
      .values({
        id,
        longitude: input.longitude,
        latitude: input.latitude,
        projectedX: projected.projectedX,
        projectedY: projected.projectedY,
        observedAt,
        createdAt: now,
        updatedAt: now,
        mosquitoCount: input.mosquitoCount,
        reporterConfidence: input.reporterConfidence,
        notes,
        status: "pending",
        isDemo: false,
        reviewedAt: null,
      })
      .run();

    return NextResponse.json(
      {
        id,
        status: "pending" satisfies SightingStatus,
        message:
          "Merci ! Votre signalement a bien été envoyé. Il sera vérifié par un enseignant avant d'apparaître sur la carte.",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RequestError) {
      return handleApiError(error);
    }
    return handleApiError(error);
  }
}
