"use client";

import { AlertTriangle, History, RefreshCw, ShieldCheck } from "lucide-react";

import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Badge, Card } from "@/components/ui";
import type { EventRatingAdminDiagnostics } from "@/lib/rating-admin";
import { useRatingAdminController } from "@/features/rating-admin/use-rating-admin-controller";

const triggerLabel = {
  completion: "Event completion",
  correction: "Score correction",
  exclusion: "Event exclusion",
  reinstatement: "Event reinstatement",
};

function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function RatingAdminSummary({
  diagnostics,
  retryAction,
  retryMessage,
  retryOk,
}: {
  diagnostics: EventRatingAdminDiagnostics;
  retryAction: (payload: FormData) => void;
  retryMessage: string;
  retryOk: boolean;
}) {
  const audit = diagnostics.audit;
  return (
    <Card className="border-emerald-100 bg-emerald-50/45">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck size={19} className="text-[var(--green)]" />
            <h2 className="text-xl font-black">Rating operations</h2>
            <Badge tone={diagnostics.tone}>{diagnostics.label}</Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {diagnostics.detail}
          </p>
        </div>
        {diagnostics.canRetry && diagnostics.jobId ? (
          <form action={retryAction}>
            <input type="hidden" name="eventId" value={diagnostics.eventId} />
            <input type="hidden" name="jobId" value={diagnostics.jobId} />
            <PendingSubmitButton pendingLabel="Queuing retry...">
              <RefreshCw size={16} />
              Retry rating work
            </PendingSubmitButton>
          </form>
        ) : null}
      </div>

      {diagnostics.safeError ? (
        <p className="mt-4 flex gap-2 rounded-xl bg-rose-50 p-3 text-sm font-semibold leading-6 text-rose-800">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          {diagnostics.safeError}
        </p>
      ) : null}
      {diagnostics.actionGuardCopy ? (
        <p className="mt-3 text-sm font-semibold text-amber-800">
          {diagnostics.actionGuardCopy}
        </p>
      ) : null}
      {retryMessage ? (
        <p
          className={`mt-3 text-sm font-bold ${retryOk ? "text-emerald-800" : "text-rose-700"}`}
          role="status"
        >
          {retryMessage}
        </p>
      ) : null}

      {audit ? (
        <div className="mt-5 border-t border-emerald-100 pt-4">
          <div className="flex items-center gap-2 text-sm font-black text-[var(--ink)]">
            <History size={16} />
            Audit
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <AuditFact label="Trigger" value={triggerLabel[audit.trigger]} />
            <AuditFact label="Actor" value={audit.actor ?? "System worker"} />
            <AuditFact label="Time" value={formatAuditTime(audit.occurredAt)} />
            <AuditFact
              label="Sequence range"
              value={
                audit.sequenceFrom === null
                  ? "Not recorded yet"
                  : audit.sequenceTo && audit.sequenceTo !== audit.sequenceFrom
                    ? `${audit.sequenceFrom}–${audit.sequenceTo}`
                    : String(audit.sequenceFrom)
              }
            />
            <AuditFact
              label="Engine"
              value={audit.engineVersion ?? "Not recorded yet"}
            />
          </dl>
        </div>
      ) : null}
    </Card>
  );
}

function AuditFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words font-semibold text-slate-700">{value}</dd>
    </div>
  );
}

export function RatingAdminPanel({
  diagnostics,
}: {
  diagnostics: EventRatingAdminDiagnostics;
}) {
  const { retryAction, retryState } = useRatingAdminController(
    diagnostics.refreshesUntilSettled,
  );
  return (
    <RatingAdminSummary
      diagnostics={diagnostics}
      retryAction={retryAction}
      retryMessage={retryState.message}
      retryOk={retryState.ok}
    />
  );
}
