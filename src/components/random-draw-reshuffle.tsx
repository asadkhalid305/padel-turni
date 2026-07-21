"use client";

import { RefreshCw, X } from "lucide-react";
import { useActionState, useState } from "react";

import { reshuffleRandomDraw, type ActionState } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Button } from "@/components/ui";

const initialState: ActionState = { ok: false, message: "" };

export function RandomDrawReshuffle({
  eventId,
  seed,
  enabled,
}: {
  eventId: string;
  seed: number;
  enabled: boolean;
}) {
  const [state, action] = useActionState(reshuffleRandomDraw, initialState);
  const currentSeed = state.drawSeed ?? seed;
  const [confirmationSeed, setConfirmationSeed] = useState<number | null>(null);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
      <div>
        <p className="font-black text-amber-950">
          Want a different random draw?
        </p>
        <p className="mt-1 text-sm leading-6 text-amber-900/80">
          A reshuffle keeps the same roster and strategy, but creates a fresh
          seeded draw.
        </p>
        {state.message ? (
          <p
            className={`mt-2 text-sm font-bold ${
              state.ok ? "text-emerald-700" : "text-rose-700"
            }`}
            role="status"
          >
            {state.message}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="danger"
        className="mt-3 w-full sm:mt-0 sm:w-auto"
        disabled={!enabled}
        title={
          enabled
            ? undefined
            : "Reshuffling is locked once the event or any match has started."
        }
        onClick={() => setConfirmationSeed(currentSeed)}
      >
        <RefreshCw size={17} />
        Reshuffle random draw
      </Button>
      {confirmationSeed === currentSeed ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
          <div
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reshuffle-title"
            aria-describedby="reshuffle-description"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="reshuffle-title" className="text-xl font-black">
                  Reshuffle the complete random draw?
                </h2>
                <p
                  id="reshuffle-description"
                  className="mt-2 text-sm leading-6 text-slate-600"
                >
                  This replaces every generated matchup and all manual draw
                  edits. It cannot run after any match activity.
                </p>
              </div>
              <button
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
                aria-label="Cancel reshuffle"
                onClick={() => setConfirmationSeed(null)}
              >
                <X size={20} />
              </button>
            </div>
            <form
              action={action}
              className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
            >
              <input type="hidden" name="eventId" value={eventId} />
              <input
                type="hidden"
                name="expectedSeed"
                value={confirmationSeed}
              />
              <button
                type="button"
                className="min-h-11 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
                onClick={() => setConfirmationSeed(null)}
              >
                Keep current draw
              </button>
              <PendingSubmitButton
                variant="danger"
                pendingLabel="Reshuffling..."
              >
                Reshuffle complete draw
              </PendingSubmitButton>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
