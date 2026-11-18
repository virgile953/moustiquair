import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";

import { SiteHeader } from "@/components/site-header";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Moustiq'Air — Comprendre et cartographier le moustique tigre",
    template: "%s · Moustiq'Air",
  },
  description:
    "Projet citoyen de cartographie de l'activité du moustique tigre à Herblay-sur-Seine, pour les élèves de troisième.",
  applicationName: "Moustiq'Air",
  authors: [{ name: "Projet pédagogique Moustiq'Air" }],
  keywords: [
    "moustique tigre",
    "Aedes albopictus",
    "Herblay-sur-Seine",
    "cartographie",
    "science participative",
  ],
};

export const viewport: Viewport = {
  themeColor: "#faf8f4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${manrope.variable} ${instrumentSerif.variable}`}>
      <body className="min-h-dvh font-sans">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg"
        >
          Aller au contenu principal
        </a>
        <SiteHeader />
        <div id="contenu">{children}</div>
      </body>
    </html>
  );
}
