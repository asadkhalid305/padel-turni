"use client";

import { Pencil, RotateCcw } from "lucide-react";
import { useActionState, useId, useState } from "react";

import {
  correctCompletedMatchScore,
  reopenCompletedMatch,
  type ActionState,
} from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Button } from "@/components/ui";

const initialState: ActionState = { ok: false, message: "" };
type CorrectionMode = "score" | "reopen" | null;

export function CompletedMatchActions({
  eventId,
  matchId,
  eventStatus,
  teamOneScore,
  teamTwoScore,
}: {
  eventId: string;
  matchId: string;
  eventStatus: string;
  teamOneScore: number;
  teamTwoScore: number;
}) {
  const titleId = useId();
  const [mode, setMode] = useState<CorrectionMode>(null);
  const [scoreState, scoreAction] = useActionState(
    correctCompletedMatchScore,
    initialState,
  );
  const [reopenState, reopenAction] = useActionState(
    reopenCompletedMatch,
    initialState,
  );
  const message = scoreState.message || reopenState.message;
  const ok = scoreState.message ? scoreState.ok : reopenState.ok;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="ghost" onClick={() => setMode("score")}>
          <Pencil size={15} />
          Correct score
        </Button>
        {eventStatus !== "completed" ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode("reopen")}
          >
            <RotateCcw size={15} />
            Reopen match
          </Button>
        ) : null}
      </div>
      {message ? (
        <p
          className={`mt-2 text-xs font-bold ${
            ok ? "text-emerald-700" : "text-rose-600"
          }`}
          role="status"
        >
          {message}
        </p>
      ) : null}
      {mode ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 text-left"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 text-[var(--ink)] shadow-2xl">
            <h2 id={titleId} className="text-xl font-black">
              {mode === "score" ? "Correct completed score?" : "Reopen match?"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Current score: {teamOneScore} : {teamTwoScore}.{" "}
              {mode === "score"
                ? "This explicit correction replaces the stored result and recalculates standings."
                : "This clears the score and all timer progress so the match can be played again."}
            </p>
            <form
              action={mode === "score" ? scoreAction : reopenAction}
              className="mt-5"
            >
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="matchId" value={matchId} />
              {mode === "score" ? (
                <>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <input
                      aria-label="Corrected team one score"
                      className="score-field"
                      name="teamOneScore"
                      type="number"
                      min="0"
                      max="99"
                      defaultValue={teamOneScore}
                      required
                    />
                    <span className="font-black text-slate-300">:</span>
                    <input
                      aria-label="Corrected team two score"
                      className="score-field"
                      name="teamTwoScore"
                      type="number"
                      min="0"
                      max="99"
                      defaultValue={teamTwoScore}
                      required
                    />
                  </div>
                  <label className="mt-4 block text-sm font-bold text-slate-700">
                    Audit reason
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 font-medium"
                      name="reason"
                      minLength={3}
                      maxLength={500}
                      required
                      placeholder="Explain why this completed score is changing."
                    />
                  </label>
                </>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setMode(null)}
                >
                  Cancel
                </Button>
                <PendingSubmitButton
                  variant="danger"
                  pendingLabel={
                    mode === "score" ? "Correcting..." : "Reopening..."
                  }
                >
                  {mode === "score" ? "Confirm correction" : "Reopen and clear"}
                </PendingSubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
