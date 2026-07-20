"use client";

import { Archive, CheckCircle2, Copy, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import {
  archiveLiveEvent,
  completeEvent,
  deleteEvent,
  retryFinalStandingsEmails,
  type ActionState,
} from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Button } from "@/components/ui";

const initialState: ActionState = { ok: false, message: "" };
type Confirmation = "archive" | "complete" | "delete" | null;

export function EventAdminActions({
  eventId,
  canComplete,
  canDelete,
  canArchive,
  canRetryEmails,
  showDelete,
}: {
  eventId: string;
  canComplete: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canRetryEmails: boolean;
  showDelete: boolean;
}) {
  const [deleteState, deleteAction] = useActionState(deleteEvent, initialState);
  const [archiveState, archiveAction] = useActionState(
    archiveLiveEvent,
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
    archiveState.message ||
    deleteState.message;
  const ok = completeState.message
    ? completeState.ok
    : retryState.message
      ? retryState.ok
      : archiveState.message
        ? archiveState.ok
        : deleteState.ok;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/events/${eventId}/edit`}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
      >
        <Pencil size={17} />
        Edit
      </Link>
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
          variant="danger"
          onClick={() => setConfirmation("archive")}
        >
          <Archive size={17} />
          Archive accidental event
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
          description="Remaining scheduled matches will be marked cancelled. Completed scores stay locked and standings will use only played matches."
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
          title="Archive accidental live event?"
          description="The event will disappear from active lists. Completed scores stay preserved; uncompleted matches are cancelled and excluded from standings."
          action={archiveAction}
          eventId={eventId}
          confirmLabel="Archive event"
          pendingLabel="Archiving..."
          variant="danger"
          message={archiveState.message}
          ok={archiveState.ok}
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
