import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui";
import type { MemberRatingPresentation } from "@/domain/ratings/member-presentation";
import { cn } from "@/lib/utils";

export function RatingLevel({
  level,
  label = "Level",
  compact = false,
}: {
  level: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded-xl bg-emerald-50 font-black text-[var(--green)]",
        compact ? "px-2 py-1 text-sm" : "px-3 py-2 text-lg",
      )}
      aria-label={`${label} ${level}`}
    >
      <span className="text-[0.68em] uppercase tracking-[0.12em] opacity-65">
        {label}
      </span>
      <span>{level}</span>
    </span>
  );
}

export function ProvisionalProgress({
  completed,
  target,
}: {
  completed: number;
  target: 6;
}) {
  const percentage = `${(completed / target) * 100}%`;
  return (
    <div
      className="min-w-32"
      aria-label={`${completed} of ${target} calibration matches`}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-800">
        <span>Provisional</span>
        <span>
          {completed}/{target}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-amber-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={completed}
      >
        <span
          className="block h-full rounded-full bg-amber-500"
          style={{ width: percentage }}
        />
      </div>
    </div>
  );
}

export function MemberRating({
  rating,
  compact = false,
}: {
  rating: MemberRatingPresentation;
  compact?: boolean;
}) {
  if (rating.state === "legacy") {
    return <Badge tone="neutral">Legacy · no automated level</Badge>;
  }
  if (rating.state === "no_profile") {
    return <Badge tone="neutral">No level yet</Badge>;
  }
  if (rating.state === "updating") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {rating.level ? (
          <RatingLevel level={rating.level} compact={compact} />
        ) : null}
        <Badge tone="info">
          <RefreshCw className="mr-1 size-3" aria-hidden="true" />
          Updating
        </Badge>
      </span>
    );
  }
  if (rating.state === "snapshot") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <RatingLevel
          level={rating.level}
          label="Start level"
          compact={compact}
        />
        {rating.eventMode === "practice" ? (
          <Badge tone="warning">Practice · unchanged</Badge>
        ) : (
          <Badge tone="neutral">Event snapshot</Badge>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <RatingLevel level={rating.level} compact={compact} />
      {rating.provisional ? (
        <ProvisionalProgress {...rating.provisional} />
      ) : null}
    </span>
  );
}

export function MemberRatingExplanation() {
  return (
    <p className="text-xs leading-5 text-slate-500">
      Your first six Official rated match appearances calibrate your level
      quickly. Practice / social events never change it.
    </p>
  );
}
