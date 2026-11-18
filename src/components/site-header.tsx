"use client";

import { MapPin, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAVIGATION = [
  { href: "/", label: "Carte" },
  { href: "/comprendre", label: "Comprendre" },
  { href: "/statistiques", label: "Statistiques" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile menu after navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is a navigation trigger.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // On the map page, opening the reporting panel with the same URL would not
  // cause a navigation. Dispatch an event instead so the panel always opens.
  const handleReportClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname === "/") {
      event.preventDefault();
      window.dispatchEvent(new Event("moustiquair:open-report"));
      setMobileOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/88 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] w-full max-w-[1720px] items-center gap-3 px-4 sm:px-5 lg:px-7">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-3 rounded-xl outline-offset-4"
          aria-label="Moustiq'Air — accueil"
        >
          <BrandMark className="transition-transform duration-300 group-hover:-rotate-6" />
          <span className="flex flex-col leading-none">
            <span className="text-[1.18rem] font-extrabold tracking-[-0.035em] text-foreground">
              Moustiq<span className="text-primary">&apos;</span>Air
            </span>
            <span className="mt-1 hidden text-[0.68rem] font-medium tracking-[0.01em] text-muted-foreground sm:block">
              Comprendre et cartographier le moustique tigre
            </span>
          </span>
        </Link>

        <nav aria-label="Navigation principale" className="ml-4 hidden items-center gap-1 lg:flex">
          {NAVIGATION.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "bg-brand-50 text-brand-800"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <div className="hidden items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-3 py-2 text-[0.7rem] font-semibold text-muted-foreground xl:flex">
            <MapPin className="size-3.5 text-primary" aria-hidden="true" />
            <span>Herblay-sur-Seine</span>
            <span className="text-border">·</span>
            <span className="font-medium">Val-d&apos;Oise</span>
          </div>

          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/?signaler=1" onClick={handleReportClick}>
              <Plus className="size-4" aria-hidden="true" />
              Signaler un moustique
            </Link>
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileOpen}
            aria-controls="menu-mobile"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <div
          id="menu-mobile"
          className="border-t border-border/70 bg-card px-4 py-4 shadow-[0_25px_50px_-30px_rgba(33,29,25,0.5)] lg:hidden"
        >
          <nav aria-label="Navigation mobile" className="flex flex-col gap-1">
            {NAVIGATION.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-xl px-4 py-3 text-sm font-semibold",
                    active ? "bg-brand-50 text-brand-800" : "text-foreground hover:bg-muted",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <Button asChild className="mt-3 sm:hidden">
              <Link href="/?signaler=1" onClick={handleReportClick}>
                <Plus className="size-4" />
                Signaler un moustique
              </Link>
            </Button>
            <div className="mt-3 flex items-center gap-1.5 px-4 text-xs font-medium text-muted-foreground">
              <MapPin className="size-3.5 text-primary" />
              Herblay-sur-Seine · Val-d&apos;Oise
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
