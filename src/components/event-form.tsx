"use client";

import { Sparkles } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";

import { EventAvailabilityFields } from "@/components/event-availability-fields";
import { MainPaneLoadingOverlay } from "@/components/main-pane-loading-overlay";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Card } from "@/components/ui";
import {
  calculateMinimumEventPlayerCount,
  formatMinimumEventPlayerMessage,
} from "@/domain/event-requirements";
import type { EventFormInitialValues } from "@/lib/data";
import { toDateTimeLocalValue } from "@/lib/event-time";

type EventFormPlayer = {
  id: string;
  name: string;
  rating: number;
};

export function EventForm({
  action,
  players,
  configured,
  serverError,
  initialValues,
  submitLabel = "Generate event",
  pendingLabel = "Generating event...",
  scheduleLocked = initialValues?.scheduleLocked ?? false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  players: EventFormPlayer[];
  configured: boolean;
  serverError?: ReactNode;
  initialValues?: EventFormInitialValues;
  submitLabel?: ReactNode;
  pendingLabel?: string;
  scheduleLocked?: boolean;
}) {
  const [courtCount, setCourtCount] = useState(initialValues?.courtCount ?? 2);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    new Set(initialValues?.playerIds ?? []),
  );
  const [startsAtValue, setStartsAtValue] = useState(
    initialValues?.startsAt ? toDateTimeLocalValue(initialValues.startsAt) : "",
  );
  const [validationError, setValidationError] = useState("");
  const minimumPlayerCount = calculateMinimumEventPlayerCount(courtCount);

  function togglePlayer(playerId: string, checked: boolean) {
    setSelectedPlayerIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(playerId);
      } else {
        next.delete(playerId);
      }
      return next;
    });
    setValidationError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (selectedPlayerIds.size >= minimumPlayerCount) {
      return;
    }

    event.preventDefault();
    setValidationError(
      formatMinimumEventPlayerMessage({
        courtCount,
        selectedPlayerCount: selectedPlayerIds.size,
      }),
    );
  }

  return (
    <>
      {serverError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          {serverError}
        </div>
      ) : null}
      {validationError ? (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700"
          role="alert"
        >
          {validationError}
        </div>
      ) : null}
      <form
        action={action}
        onSubmit={handleSubmit}
        className="grid gap-6 xl:grid-cols-[1fr_420px]"
      >
        <div className="space-y-6">
          <Card>
            <h2 className="text-xl font-black">Event details</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="field-label">Event name</span>
                <input
                  className="field"
                  name="name"
                  placeholder="Sunday court social"
                  defaultValue={initialValues?.name}
                  required
                />
              </label>
              <label className="block">
                <span className="field-label">Venue</span>
                <input
                  className="field"
                  name="venue"
                  placeholder="Padel club"
                  defaultValue={initialValues?.venue}
                />
              </label>
              <label className="block">
                <span className="field-label">Starts</span>
                <input
                  className="field"
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={startsAtValue || undefined}
                  onChange={(event) =>
                    setStartsAtValue(event.currentTarget.value)
                  }
                  required
                  disabled={scheduleLocked}
                />
                {scheduleLocked ? (
                  <input type="hidden" name="startsAt" value={startsAtValue} />
                ) : null}
                <input
                  type="hidden"
                  name="startsAtTimezoneOffsetMinutes"
                  value={timezoneOffsetForLocalValue(startsAtValue)}
                />
              </label>
              <EventAvailabilityFields
                courtCount={courtCount}
                initialCourtMinutes={initialValues?.courtMinutes}
                initialRequestedRoundMinutes={
                  initialValues?.requestedRoundMinutes
                }
                initialBreakMinutes={initialValues?.breakMinutes}
                disabled={scheduleLocked}
                onCourtCountChange={(nextCourtCount) => {
                  setCourtCount(nextCourtCount);
                  setValidationError("");
                }}
              />
              <label className="block sm:col-span-2">
                <span className="field-label">Notes</span>
                <textarea
                  className="field min-h-24 resize-y"
                  name="notes"
                  placeholder="Format, arrival notes, or house rules"
                  defaultValue={initialValues?.notes}
                />
              </label>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <Sparkles className="text-[var(--green)]" size={19} />
              <h2 className="text-xl font-black">Select players</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {scheduleLocked
                ? "The roster is locked because match activity has started."
                : `Choose at least ${minimumPlayerCount}. Names and ratings are snapshotted now.`}
            </p>
            {scheduleLocked
              ? [...selectedPlayerIds].map((playerId) => (
                  <input
                    key={playerId}
                    type="hidden"
                    name="playerIds"
                    value={playerId}
                  />
                ))
              : null}
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {players.map((player) => (
                <label
                  key={player.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50"
                >
                  <input
                    type="checkbox"
                    value={player.id}
                    checked={selectedPlayerIds.has(player.id)}
                    onChange={(event) =>
                      togglePlayer(player.id, event.currentTarget.checked)
                    }
                    disabled={scheduleLocked}
                    name={scheduleLocked ? undefined : "playerIds"}
                    className="size-4 accent-emerald-700"
                  />
                  <span>
                    <span className="block text-sm font-bold">
                      {player.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      Rating {player.rating.toFixed(1)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Card>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <Card className="bg-[var(--ink)] text-white">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--lime)]">
              Fairness priorities
            </p>
            <ol className="mt-5 space-y-4">
              {[
                "Balanced court appearances",
                "Short rest streaks",
                "Unique partners",
                "Diverse opponents",
                "Rating-balanced teams",
              ].map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-black text-[var(--lime)]">
                    {index + 1}
                  </span>
                  <span className="pt-1 text-sm font-semibold text-white/80">
                    {item}
                  </span>
                </li>
              ))}
            </ol>
            <PendingSubmitButton
              className="mt-7 w-full"
              variant="secondary"
              disabled={!configured}
              pendingLabel={pendingLabel}
            >
              {submitLabel}
            </PendingSubmitButton>
            <EventFormPendingOverlay label={pendingLabel} />
          </Card>
        </div>
      </form>
    </>
  );
}

function timezoneOffsetForLocalValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTimezoneOffset();
}

function EventFormPendingOverlay({ label }: { label: string }) {
  const { pending } = useFormStatus();

  if (!pending) return null;

  return createPortal(
    <MainPaneLoadingOverlay label={label} />,
    document.body,
  );
}
