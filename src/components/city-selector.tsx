"use client";

import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Select } from "@/components/ui/select";
import {
  CITY_COOKIE_MAX_AGE_SECONDS,
  CITY_COOKIE_NAME,
  type City,
  cityLabel,
  getCityByInsee,
  SUPPORTED_CITIES,
} from "@/lib/cities";
import { cn } from "@/lib/utils";

interface CitySelectorProps {
  selected: City;
  /** `compact` is the header pill, `full` is the mobile menu variant. */
  tone?: "compact" | "full";
  className?: string;
  id?: string;
}

/**
 * Municipality selector.
 *
 * Selecting a value:
 * 1. preserves the current path and every other query parameter (`period`,
 *    `signaler`, …);
 * 2. writes the one-year `moustiquair_city` cookie from JavaScript, because the
 *    cookie is deliberately not HttpOnly;
 * 3. pushes the new URL, so the server components re-render for the new city.
 *
 * The proxy mirrors the same query parameter into the cookie on full page
 * loads, which keeps shared links consistent even without JavaScript state.
 */
export function CitySelector({
  selected,
  tone = "compact",
  className,
  id = "city-selector",
}: CitySelectorProps) {
  const router = useRouter();
  // The selector lives in the shared layout, which the App Router preserves
  // during soft navigation. Keeping a local value makes the control reflect the
  // new choice immediately, even before (or without) a layout re-render.
  const [value, setValue] = useState(selected.insee);

  useEffect(() => {
    setValue(selected.insee);
  }, [selected.insee]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = getCityByInsee(event.target.value);
    if (!next || next.insee === value) return;

    setValue(next.insee);

    const params = new URLSearchParams(window.location.search);
    params.set("city", next.insee);
    const query = params.toString();

    // biome-ignore lint/suspicious/noDocumentCookie: the city cookie is deliberately readable by this selector; the Cookie Store API is not available in every supported browser.
    document.cookie = `${CITY_COOKIE_NAME}=${next.insee}; Path=/; Max-Age=${CITY_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${
      window.location.protocol === "https:" ? "; Secure" : ""
    }`;

    router.push(`${window.location.pathname}${query ? `?${query}` : ""}`);
  };

  return (
    <div
      title={cityLabel(selected)}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border/80 bg-card/80 pr-0.5",
        tone === "compact" ? "pl-3" : "w-full pl-3",
        className,
      )}
    >
      <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <Select
        id={id}
        aria-label={`Choisir la commune — ${cityLabel(selected)}`}
        value={value}
        onChange={handleChange}
        className={cn(
          "w-auto border-0 bg-transparent font-semibold shadow-none focus-visible:border-transparent focus-visible:ring-0",
          tone === "compact" ? "h-8 pr-7 pl-0 text-xs" : "h-11 pr-8 pl-0 text-sm",
        )}
      >
        {SUPPORTED_CITIES.map((city) => (
          <option key={city.insee} value={city.insee}>
            {city.name} ({city.departmentCode})
          </option>
        ))}
      </Select>
    </div>
  );
}
