"use client";

import { Info, Sparkles, X } from "lucide-react";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
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
import type { CompetitionMode, DrawStrategy } from "@/domain/types";
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
  modeLocked = initialValues?.modeLocked ?? false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  players: EventFormPlayer[];
  configured: boolean;
  serverError?: ReactNode;
  initialValues?: EventFormInitialValues;
  submitLabel?: ReactNode;
  pendingLabel?: string;
  scheduleLocked?: boolean;
  modeLocked?: boolean;
}) {
  const [courtCount, setCourtCount] = useState(initialValues?.courtCount ?? 2);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    new Set(initialValues?.playerIds ?? []),
  );
  const [startsAtValue, setStartsAtValue] = useState(
    initialValues?.startsAt ? toDateTimeLocalValue(initialValues.startsAt) : "",
  );
  const [validationError, setValidationError] = useState("");
  const [drawStrategy, setDrawStrategy] = useState<DrawStrategy>(
    initialValues?.drawStrategy ?? "random",
  );
  const [competitionMode, setCompetitionMode] = useState<CompetitionMode>(
    initialValues?.competitionMode ?? "official",
  );
  const [showStrategyHelp, setShowStrategyHelp] = useState(false);
  const [showDrawConfirmation, setShowDrawConfirmation] = useState(false);
  const [drawReplacementConfirmed, setDrawReplacementConfirmed] =
    useState(false);
  const formRef = useRef<HTMLFormElement>(null);
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
    if (selectedPlayerIds.size < minimumPlayerCount) {
      event.preventDefault();
      setValidationError(
        formatMinimumEventPlayerMessage({
          courtCount,
          selectedPlayerCount: selectedPlayerIds.size,
        }),
      );
      return;
    }
    if (
      initialValues &&
      drawStrategy !== initialValues.drawStrategy &&
      !drawReplacementConfirmed
    ) {
      event.preventDefault();
      setShowDrawConfirmation(true);
    }
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
        ref={formRef}
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
              <fieldset className="sm:col-span-2">
                <legend className="field-label">Event mode</legend>
                {initialValues?.lockedLegacyMode ? (
                  <>
                    <input
                      type="hidden"
                      name="competitionMode"
                      value="official"
                    />
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-black text-[var(--ink)]">
                        Legacy event
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                        This mode predates automated ratings. Results keep their
                        historical standings behavior and never affect automated
                        player ratings.
                      </p>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-amber-700">
                      Legacy mode is locked because match activity exists.
                    </p>
                  </>
                ) : (
                  <>
                    {modeLocked ? (
                      <input
                        type="hidden"
                        name="competitionMode"
                        value={competitionMode}
                      />
                    ) : null}
                    {initialValues?.originalCompetitionMode ? (
                      <input
                        type="hidden"
                        name="originalCompetitionMode"
                        value={initialValues.originalCompetitionMode}
                      />
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(
                        [
                          [
                            "official",
                            "Official",
                            "Counts toward overall standings and automated player ratings after completion.",
                          ],
                          [
                            "practice",
                            "Practice / social",
                            "Keeps the schedule and scores, but never affects standings or player ratings.",
                          ],
                        ] as const
                      ).map(([value, label, description]) => (
                        <label
                          key={value}
                          className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50"
                        >
                          <span className="flex items-start gap-3">
                            <input
                              className="mt-1 size-4 accent-emerald-700"
                              type="radio"
                              name={modeLocked ? undefined : "competitionMode"}
                              value={value}
                              checked={competitionMode === value}
                              disabled={modeLocked}
                              onChange={() => setCompetitionMode(value)}
                            />
                            <span>
                              <span className="block text-sm font-black text-[var(--ink)]">
                                {label}
                              </span>
                              <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
                                {description}
                              </span>
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {modeLocked ? (
                      <p className="mt-2 text-xs font-semibold text-amber-700">
                        Event mode is locked because match activity exists.
                      </p>
                    ) : null}
                  </>
                )}
              </fieldset>
              <fieldset className="relative sm:col-span-2">
                <legend className="field-label">
                  <span className="flex items-center gap-1.5">
                    Draw strategy
                    <span className="group inline-flex">
                      <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full text-slate-500 transition hover:bg-emerald-100 hover:text-emerald-800 focus-visible:bg-emerald-100 focus-visible:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                        aria-label="About draw strategies"
                        aria-expanded={showStrategyHelp}
                        aria-controls="draw-strategy-help"
                        onClick={() =>
                          setShowStrategyHelp((current) => !current)
                        }
                      >
                        <Info size={16} aria-hidden="true" />
                      </button>
                      <div
                        id="draw-strategy-help"
                        role="tooltip"
                        className={`${
                          showStrategyHelp ? "block" : "hidden"
                        } absolute top-7 left-0 z-20 mt-2 w-[min(20rem,calc(100vw-3rem))] rounded-2xl border border-emerald-100 bg-white p-4 text-left normal-case tracking-normal shadow-[0_18px_45px_rgba(18,48,36,0.18)] group-hover:block group-focus-within:block`}
                      >
                        <p className="text-sm font-black text-emerald-800">
                          Random variety
                        </p>
                        <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
                          Protects participation, rests, and matchup variety,
                          then uses seeded randomness. Ratings are ignored.
                        </p>
                        <div className="my-3 border-t border-slate-200" />
                        <p className="text-sm font-black text-emerald-800">
                          Rating balanced
                        </p>
                        <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
                          Uses the same fairness rules, then prefers teams with
                          closer total ratings.
                        </p>
                      </div>
                    </span>
                  </span>
                </legend>
                {scheduleLocked ? (
                  <input
                    type="hidden"
                    name="drawStrategy"
                    value={drawStrategy}
                  />
                ) : null}
                {initialValues ? (
                  <input
                    type="hidden"
                    name="originalDrawStrategy"
                    value={initialValues.drawStrategy}
                  />
                ) : null}
                <input
                  type="hidden"
                  name="confirmDrawReplacement"
                  value={drawReplacementConfirmed ? "true" : "false"}
                />
                <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
                  {(
                    [
                      ["random", "Random variety"],
                      ["rating_balanced", "Rating balanced"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="cursor-pointer rounded-xl text-center text-sm font-black text-slate-500 has-[:checked]:bg-white has-[:checked]:text-[var(--ink)] has-[:checked]:shadow-sm"
                    >
                      <input
                        className="peer sr-only"
                        type="radio"
                        name={scheduleLocked ? undefined : "drawStrategy"}
                        value={value}
                        checked={drawStrategy === value}
                        disabled={scheduleLocked}
                        onChange={() => {
                          setDrawStrategy(value);
                          setDrawReplacementConfirmed(false);
                        }}
                      />
                      <span className="block min-h-11 rounded-xl px-3 py-3 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-600">
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
                {scheduleLocked ? (
                  <p className="mt-2 text-xs font-semibold text-amber-700">
                    Strategy changes are locked because match activity exists.
                  </p>
                ) : null}
              </fieldset>
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
                : `Choose at least ${minimumPlayerCount} accepted club members with completed rating profiles.`}
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
              {!players.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:col-span-2 lg:col-span-3">
                  <p className="text-sm font-black text-amber-950">
                    No eligible participants yet.
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-800">
                    Participants must accept the club invitation and complete
                    their rating profile before they can join a new event.
                  </p>
                </div>
              ) : null}
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
                      Account ready
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
                drawStrategy === "rating_balanced"
                  ? "Rating-balanced teams"
                  : "Seeded random variety (ratings ignored)",
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
      {showDrawConfirmation
        ? createPortal(
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setShowDrawConfirmation(false);
                }
              }}
            >
              <div
                className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="draw-confirmation-title"
                aria-describedby="draw-confirmation-description"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2
                      id="draw-confirmation-title"
                      className="text-xl font-black"
                    >
                      Replace the complete draw?
                    </h2>
                    <p
                      id="draw-confirmation-description"
                      className="mt-2 text-sm leading-6 text-slate-600"
                    >
                      Changing the strategy replaces every generated matchup and
                      all manual draw edits. This is only allowed before any
                      match activity.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
                    aria-label="Cancel draw replacement"
                    onClick={() => setShowDrawConfirmation(false)}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="min-h-11 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
                    onClick={() => setShowDrawConfirmation(false)}
                  >
                    Keep current draw
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700"
                    onClick={() => {
                      setDrawReplacementConfirmed(true);
                      setShowDrawConfirmation(false);
                      window.setTimeout(
                        () => formRef.current?.requestSubmit(),
                        0,
                      );
                    }}
                  >
                    Replace draw and save
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
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

  return createPortal(<MainPaneLoadingOverlay label={label} />, document.body);
}
