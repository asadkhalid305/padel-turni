"use client";

import {
  Archive,
  Ban,
  CheckCircle2,
  Copy,
  Pencil,
  RotateCcw,
  Trash2,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import {
  archiveEvent,
  cancelEvent,
  changeEventStandingsEligibility,
  completeEvent,
  deleteEvent,
  restoreEvent,
  retryFinalStandingsEmails,
  type ActionState,
} from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Button } from "@/components/ui";

const initialState: ActionState = { ok: false, message: "" };
type Confirmation =
  | "archive"
  | "cancel"
  | "complete"
  | "delete"
  | "exclude"
  | "include"
  | "restore"
  | null;

export function EventAdminActions({
  eventId,
  canEdit,
  canComplete,
  canCancel,
  canDelete,
  canArchive,
  canRestore,
  canChangeStandingsEligibility,
  standingsEligible,
  canRetryEmails,
  showDelete,
}: {
  eventId: string;
  canEdit: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canChangeStandingsEligibility: boolean;
  standingsEligible: boolean;
  canRetryEmails: boolean;
  showDelete: boolean;
}) {
  const [deleteState, deleteAction] = useActionState(deleteEvent, initialState);
  const [cancelState, cancelAction] = useActionState(cancelEvent, initialState);
  const [archiveState, archiveAction] = useActionState(
    archiveEvent,
    initialState,
  );
  const [restoreState, restoreAction] = useActionState(
    restoreEvent,
    initialState,
  );
  const [standingsState, standingsAction] = useActionState(
    changeEventStandingsEligibility,
    initialState,
  );
  const [completeState, completeAction] = useActionState(
    completeEvent,
    initialState,
  );
  const [retryState, retryAction] = useActionState(
    retryFinalStandingsEmails,
    initialState,
  );
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const message =
    completeState.message ||
    retryState.message ||
    cancelState.message ||
    archiveState.message ||
    restoreState.message ||
    standingsState.message ||
    deleteState.message;
  const ok = completeState.message
    ? completeState.ok
    : retryState.message
      ? retryState.ok
      : cancelState.message
        ? cancelState.ok
        : archiveState.message
          ? archiveState.ok
          : restoreState.message
            ? restoreState.ok
            : standingsState.message
              ? standingsState.ok
              : deleteState.ok;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit ? (
        <Link
          href={`/events/${eventId}/edit`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
        >
          <Pencil size={17} />
          Edit
        </Link>
      ) : null}
      <Link
        href={`/events/${eventId}/duplicate`}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
      >
        <Copy size={17} />
        Duplicate
      </Link>
      {canComplete ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setConfirmation("complete")}
        >
          <CheckCircle2 size={17} />
          Complete tournament
        </Button>
      ) : null}
      {canRetryEmails ? (
        <form action={retryAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <PendingSubmitButton variant="ghost" pendingLabel="Retrying...">
            Retry standings emails
          </PendingSubmitButton>
        </form>
      ) : null}
      {canArchive ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirmation("archive")}
        >
          <Archive size={17} />
          Archive
        </Button>
      ) : null}
      {canRestore ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setConfirmation("restore")}
        >
          <RotateCcw size={17} />
          Restore
        </Button>
      ) : null}
      {canChangeStandingsEligibility ? (
        <Button
          type="button"
          variant={standingsEligible ? "danger" : "secondary"}
          onClick={() =>
            setConfirmation(standingsEligible ? "exclude" : "include")
          }
        >
          {standingsEligible ? <Ban size={17} /> : <Trophy size={17} />}
          {standingsEligible
            ? "Exclude from standings"
            : "Include in standings"}
        </Button>
      ) : null}
      {canCancel ? (
        <Button
          type="button"
          variant="danger"
          onClick={() => setConfirmation("cancel")}
        >
          <Ban size={17} />
          Cancel event
        </Button>
      ) : null}
      {showDelete && canDelete ? (
        <Button
          type="button"
          variant="danger"
          onClick={() => setConfirmation("delete")}
        >
          <Trash2 size={17} />
          Delete
        </Button>
      ) : showDelete ? (
        <Button
          type="button"
          variant="danger"
          disabled
          title="Delete is locked once matches have started or scores exist."
        >
          <Trash2 size={17} />
          Delete
        </Button>
      ) : null}
      {message ? (
        <p
          className={`basis-full max-w-3xl text-sm font-bold ${
            ok ? "text-emerald-100" : "text-rose-100"
          }`}
          role="status"
        >
          {message}
        </p>
      ) : null}
      {confirmation === "complete" && !completeState.ok ? (
        <ConfirmationModal
          title="Complete tournament?"
          description="Every unfinished match, including live or paused matches, will be cancelled. Completed scores stay preserved and the continuously recalculated standings will use only completed matches."
          action={completeAction}
          eventId={eventId}
          confirmLabel="Complete tournament"
          pendingLabel="Completing..."
          variant="secondary"
          message={completeState.message}
          ok={completeState.ok}
          onClose={() => setConfirmation(null)}
        />
      ) : null}
      {confirmation === "delete" && !deleteState.ok ? (
        <ConfirmationModal
          title="Delete event?"
          description="This permanently removes the event, draw, and scheduled matches."
          action={deleteAction}
          eventId={eventId}
          confirmLabel="Delete event"
          pendingLabel="Deleting..."
          variant="danger"
          message={deleteState.message}
          ok={deleteState.ok}
          onClose={() => setConfirmation(null)}
        />
      ) : null}
      {confirmation === "archive" && !archiveState.ok ? (
        <ConfirmationModal
          title="Archive completed event?"
          description="The event will move out of active and history lists. Its valid completed results will continue to count in the overall standings."
          action={archiveAction}
          eventId={eventId}
          confirmLabel="Archive event"
          pendingLabel="Archiving..."
          variant="secondary"
          message={archiveState.message}
          ok={archiveState.ok}
          onClose={() => setConfirmation(null)}
        />
      ) : null}
      {confirmation === "cancel" && !cancelState.ok ? (
        <ConfirmationModal
          title="Cancel live event?"
          description="Every unfinished match will be cancelled. Completed scores stay preserved for review, but this event will be excluded from the overall standings."
          action={cancelAction}
          eventId={eventId}
          confirmLabel="Cancel event"
          pendingLabel="Cancelling..."
          variant="danger"
          message={cancelState.message}
          ok={cancelState.ok}
          onClose={() => setConfirmation(null)}
        />
      ) : null}
      {confirmation === "restore" && !restoreState.ok ? (
        <ConfirmationModal
          title="Restore archived event?"
          description="The completed event will return to normal event and history views. Its standings contribution does not change."
          action={restoreAction}
          eventId={eventId}
          confirmLabel="Restore event"
          pendingLabel="Restoring..."
          variant="secondary"
          message={restoreState.message}
          ok={restoreState.ok}
          onClose={() => setConfirmation(null)}
        />
      ) : null}
      {(confirmation === "exclude" || confirmation === "include") &&
      !standingsState.ok ? (
        <ConfirmationModal
          title={
            confirmation === "exclude"
              ? "Exclude event from standings?"
              : "Include event in standings?"
          }
          description={
            confirmation === "exclude"
              ? "The event and scores stay preserved, but the overall leaderboard will immediately recalculate without these results."
              : "The overall leaderboard will immediately recalculate using this event's completed results."
          }
          action={standingsAction}
          eventId={eventId}
          hiddenFields={{
            standingsEligible: confirmation === "include" ? "true" : "false",
          }}
          confirmLabel={
            confirmation === "exclude" ? "Exclude results" : "Include results"
          }
          pendingLabel="Updating..."
          variant={confirmation === "exclude" ? "danger" : "secondary"}
          message={standingsState.message}
          ok={standingsState.ok}
          onClose={() => setConfirmation(null)}
        />
      ) : null}
    </div>
  );
}

function ConfirmationModal({
  title,
  description,
  action,
  eventId,
  hiddenFields,
  confirmLabel,
  pendingLabel,
  variant,
  message,
  ok,
  onClose,
}: {
  title: string;
  description: string;
  action: (payload: FormData) => void;
  eventId: string;
  hiddenFields?: Record<string, string>;
  confirmLabel: string;
  pendingLabel: string;
  variant: "secondary" | "danger";
  message: string;
  ok: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-confirmation-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-[var(--ink)] shadow-2xl">
        <h2 id="event-confirmation-title" className="text-xl font-black">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <form action={action} className="mt-5 flex flex-wrap justify-end gap-2">
          <input type="hidden" name="eventId" value={eventId} />
          {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <PendingSubmitButton variant={variant} pendingLabel={pendingLabel}>
            {confirmLabel}
          </PendingSubmitButton>
          {message ? (
            <p
              className={`basis-full text-right text-sm font-bold ${
                ok ? "text-emerald-700" : "text-rose-600"
              }`}
              role="status"
            >
              {message}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
