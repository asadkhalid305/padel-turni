import { BrandMark } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

export function BrandedLoader({
  className,
  label = "Loading",
  compact = false,
}: {
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn("grid place-items-center", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={cn(
          "relative grid place-items-center",
          compact ? "size-20" : "size-28",
        )}
        aria-hidden="true"
      >
        <span className="absolute inset-0 rounded-full border border-emerald-950/10 bg-white/45 shadow-[0_20px_55px_rgba(16,47,39,0.12)] backdrop-blur-sm" />
        <span className="absolute inset-2 animate-ping rounded-full border border-[var(--lime)]/45 [animation-duration:1.8s]" />
        <span className="absolute inset-3 animate-spin rounded-full border-2 border-emerald-950/10 border-t-[var(--green)] [animation-duration:1.4s]" />
        <span
          className={cn(
            "relative grid place-items-center rounded-[1.15rem] bg-[var(--lime)] shadow-[0_12px_30px_rgba(32,122,91,0.22)]",
            compact ? "size-11" : "size-16",
          )}
        >
          <BrandMark
            className={cn(compact ? "size-9" : "size-14", "animate-pulse")}
          />
        </span>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
