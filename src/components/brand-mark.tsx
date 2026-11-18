import { cn } from "@/lib/utils";

/**
 * Small custom brand mark: a stylised mosquito seen from above, in a coral
 * tile. Kept as an inline SVG so it stays crisp and works without an image.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_rgba(217,75,56,0.9)]",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="size-7" fill="none">
        <title>Moustiq&apos;Air</title>
        <ellipse cx="16" cy="18" rx="3.1" ry="6" fill="currentColor" opacity="0.95" />
        <circle cx="16" cy="10.4" r="2.2" fill="currentColor" />
        <path
          d="M13.2 14.2C10.4 11.4 7.8 10.2 5 10.6M18.8 14.2c2.8-2.8 5.4-4 8.2-3.6M12.9 18.1c-3.2-.5-5.8.2-8.2 2.1M19.1 18.1c3.2-.5 5.8.2 8.2 2.1M14.2 22.2c-2 2.2-3.2 4.1-3.6 6.2M17.8 22.2c2 2.2 3.2 4.1 3.6 6.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M14.8 13.4c-1.5-1.7-2.1-3.8-1.8-6.2M17.2 13.4c1.5-1.7 2.1-3.8 1.8-6.2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.75"
        />
      </svg>
    </span>
  );
}
