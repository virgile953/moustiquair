/**
 * Zod schemas shared by API routes.
 *
 * Every public input is validated on the server; client-side validation is a
 * convenience, never a security boundary.
 */

import { z } from "zod";

import {
  MAX_NOTES_LENGTH,
  MOSQUITO_COUNT_VALUES,
  REPORTER_CONFIDENCE_VALUES,
} from "../config/model";

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

export const dateKeySchema = z
  .string()
  .regex(dateKeyPattern, "La date doit être au format AAAA-MM-JJ.")
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Cette date n'existe pas.");

export const sightingSubmissionSchema = z.object({
  longitude: z
    .number({ error: "La longitude est requise." })
    .finite("La longitude est invalide.")
    .min(-180, "La longitude doit être comprise entre -180 et 180.")
    .max(180, "La longitude doit être comprise entre -180 et 180."),
  latitude: z
    .number({ error: "La latitude est requise." })
    .finite("La latitude est invalide.")
    .min(-90, "La latitude doit être comprise entre -90 et 90.")
    .max(90, "La latitude doit être comprise entre -90 et 90."),
  observedOn: dateKeySchema,
  mosquitoCount: z.enum(MOSQUITO_COUNT_VALUES, {
    error: "Choisissez une tranche de moustiques observés.",
  }),
  reporterConfidence: z.enum(REPORTER_CONFIDENCE_VALUES, {
    error: "Précisez votre niveau de certitude.",
  }),
  notes: z
    .string()
    .max(MAX_NOTES_LENGTH, `Les notes ne peuvent pas dépasser ${MAX_NOTES_LENGTH} caractères.`)
    .optional()
    .default(""),
  confirmation: z.literal(true, {
    error: "Vous devez confirmer que l'observation est réelle.",
  }),
  // Honeypot: invisible to humans, filled by naive bots. The route returns a
  // fake success without storing anything when this field is non-empty.
  website: z.string().max(200).optional().default(""),
  // Optional target commune. It is only a hint until the route validates it
  // against the supported-city catalog; an unknown code is rejected.
  cityInsee: z.string().trim().max(10).optional(),
});

export type SightingSubmission = z.infer<typeof sightingSubmissionSchema>;

export const adminLoginSchema = z.object({
  password: z.string().min(1, "Le mot de passe est requis.").max(200),
});

export const adminReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export const adminSightingsQuerySchema = z.object({
  status: z.enum(["all", "pending", "approved", "rejected"]).optional().default("pending"),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const periodSchema = z.enum(["7", "30", "90", "all"]);

export const resolutionSchema = z.union([z.literal(10), z.literal(50), z.literal(100)]);
