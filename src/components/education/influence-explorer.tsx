"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { INFLUENCE_RADIUS_METERS } from "@/lib/config/model";
import { calculateInfluence } from "@/lib/geo/influence";
import { formatActivityScore } from "@/lib/geo/intensity";

/**
 * Small interactive illustration used on the educational page.
 *
 * It deliberately uses the same `calculateInfluence` function as the real
 * model, so the number displayed to students cannot drift away from the map.
 */
export function InfluenceExplorer() {
  const [distance, setDistance] = useState(50);
  const weight = calculateInfluence(distance, INFLUENCE_RADIUS_METERS);

  // SVG coordinates: 1 metre = 1.35 pixels. The sighting is at x = 46.
  const scale = 1.35;
  const sightingX = 46;
  const sightingY = 92;
  const radiusPx = INFLUENCE_RADIUS_METERS * scale;
  const cellX = sightingX + distance * scale - 10;
  const cellY = sightingY - 10;

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_28px_70px_-52px_rgba(33,29,25,0.55)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-bold tracking-[0.14em] text-primary uppercase">
            Expérience interactive
          </p>
          <h3 className="mt-1 text-lg font-extrabold tracking-tight">
            Déplacez la maille, observez le poids
          </h3>
        </div>
        <div className="rounded-xl bg-brand-50 px-3 py-2 text-right">
          <p className="text-[0.62rem] font-semibold tracking-wide text-brand-700 uppercase">
            Contribution
          </p>
          <p className="text-xl font-extrabold tabular-nums text-brand-900">
            {formatActivityScore(weight)}
          </p>
        </div>
      </div>

      <svg
        viewBox="0 0 400 180"
        className="mt-3 w-full"
        role="img"
        aria-label={`Un signalement influence une maille située à ${distance} mètres avec un poids de ${formatActivityScore(weight)}.`}
      >
        <defs>
          <radialGradient id="influence-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d94b38" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#d94b38" stopOpacity="0" />
          </radialGradient>
        </defs>

        <line
          x1={sightingX}
          y1={sightingY}
          x2={cellX + 10}
          y2={sightingY}
          stroke="#c9b8a7"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />

        <circle
          cx={sightingX}
          cy={sightingY}
          r={radiusPx}
          fill="url(#influence-glow)"
          stroke="#e7b4a7"
          strokeWidth="1.5"
          strokeDasharray="5 5"
        />
        <circle cx={sightingX} cy={sightingY} r="15" fill="#d94b38" opacity="0.15" />
        <circle cx={sightingX} cy={sightingY} r="6" fill="#b52f21" />

        <rect
          x={cellX}
          y={cellY}
          width="20"
          height="20"
          rx="2"
          fill="#d94b38"
          fillOpacity={0.12 + weight * 0.8}
          stroke="#8f2d20"
          strokeWidth="1.5"
        />

        <text
          x={sightingX}
          y={sightingY + 32}
          textAnchor="middle"
          className="fill-[#756b60]"
          fontSize="10"
          fontWeight="600"
        >
          Signalement
        </text>
        <text
          x={Math.min(cellX + 10, 370)}
          y={cellY - 9}
          textAnchor="middle"
          className="fill-[#756b60]"
          fontSize="10"
          fontWeight="600"
        >
          Maille
        </text>
        <text
          x={(sightingX + cellX + 10) / 2}
          y={sightingY - 10}
          textAnchor="middle"
          className="fill-[#756b60]"
          fontSize="10"
          fontWeight="700"
        >
          {distance} m
        </text>
      </svg>

      <div className="mt-2">
        <label htmlFor="influence-distance" className="text-xs font-semibold">
          Distance entre le signalement et le centre de la maille
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="influence-distance"
            type="range"
            min={0}
            max={120}
            step={5}
            value={distance}
            onChange={(event) => setDistance(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(90deg,#d94b38,#f0a292,#e7ddd1)] accent-[#d94b38]"
            aria-valuetext={`${distance} mètres`}
          />
          <Input
            id="influence-distance-number"
            name="influence-distance-number"
            type="number"
            min={0}
            max={120}
            value={distance}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) {
                setDistance(Math.min(120, Math.max(0, value)));
              }
            }}
            className="h-9 w-20 text-right tabular-nums"
            aria-label="Distance en mètres"
          />
        </div>
      </div>

      <div className="mt-4">
        <div
          className="h-2.5 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Poids de la contribution : ${formatActivityScore(weight)}`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-300 to-brand-700 transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${weight * 100}%` }}
          />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          À {distance} m du signalement, la maille reçoit{" "}
          <strong className="font-semibold text-foreground">{formatActivityScore(weight)}</strong>{" "}
          point d&apos;activité. Au-delà de {INFLUENCE_RADIUS_METERS} m, elle ne reçoit plus rien.
        </p>
      </div>
    </div>
  );
}
