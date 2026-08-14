import { Info } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { duplicateEvent } from "@/app/actions";
import { EventForm } from "@/components/event-form";
import { PageBackLink } from "@/components/page-back-link";
import { SectionHeading } from "@/components/ui";
import {
  getEventFormInitialValues,
  listEligibleRosterPlayers,
} from "@/lib/data";
import { isWorkspaceAdminRole } from "@/lib/roles";
import {
  getAuthenticatedUser,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const metadata = { title: "Duplicate event" };

export default async function DuplicateEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }, user] = await Promise.all([
    params,
    searchParams,
    getAuthenticatedUser(),
  ]);
  if (!user || !isWorkspaceAdminRole(user.activeWorkspaceRole)) {
    redirect("/events");
  }
  const [players, initialValues] = await Promise.all([
    listEligibleRosterPlayers(user.activeWorkspaceId),
    getEventFormInitialValues(id, user.activeWorkspaceId),
  ]);
  if (!initialValues) notFound();

  const configured = isSupabaseConfigured();

  async function duplicateCurrentEvent(formData: FormData) {
    "use server";

    formData.set("sourceEventId", id);
    await duplicateEvent(formData);
  }

  return (
    <div className="space-y-7">
      <PageBackLink href={`/events/${id}`} label="Event" />
      <SectionHeading
        eyebrow="Duplicate event"
        title="Reuse the setup with a new start time."
        description="The copied event starts fresh with new player snapshots, a new draw, no timers, and no scores."
      />
      {!configured ? (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="shrink-0" size={20} />
          Demo mode is read-only. Add the Supabase environment variables to
          duplicate persistent events.
        </div>
      ) : null}
      <EventForm
        action={duplicateCurrentEvent}
        players={players}
        configured={configured}
        serverError={error}
        initialValues={{
          ...initialValues,
          playerIds: [],
          startsAt: "",
          scheduleLocked: false,
          modeLocked: false,
          lockedLegacyMode: false,
          originalCompetitionMode: undefined,
        }}
        submitLabel="Create duplicate"
        pendingLabel="Creating duplicate..."
      />
    </div>
  );
}
