import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

export function BrandMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...props}
    >
      <rect width="48" height="48" rx="14" fill="var(--lime, #b8ed61)" />
      <g transform="rotate(-32 24 24)">
        <path
          d="M24 6.5c-8 0-13.5 6.1-13.5 14.1 0 7.2 4.3 12.2 10.2 13.5v7.2c0 2.1 1.3 3.7 3.3 3.7s3.3-1.6 3.3-3.7v-7.2c5.9-1.3 10.2-6.3 10.2-13.5C37.5 12.6 32 6.5 24 6.5Z"
          fill="var(--ink, #102f27)"
        />
        {[
          [20, 16],
          [28, 16],
          [18, 23],
          [24, 23],
          [30, 23],
          [21, 29],
          [27, 29],
        ].map(([cx, cy]) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r="1.35"
            fill="var(--lime, #b8ed61)"
          />
        ))}
      </g>
      <circle cx="38" cy="10" r="3.5" fill="var(--ink, #102f27)" />
    </svg>
  );
}

export function BrandLogo({
  className,
  markClassName,
  tagline = false,
}: {
  className?: string;
  markClassName?: string;
  tagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <BrandMark className={cn("size-11", markClassName)} />
      <span className="min-w-0">
        <span className="block text-lg font-black leading-none tracking-[-0.035em]">
          Padel Turni
        </span>
        {tagline ? (
          <span className="mt-1 block text-xs font-medium text-current opacity-55">
            Fair draws. Better games.
          </span>
        ) : null}
      </span>
    </span>
  );
}
