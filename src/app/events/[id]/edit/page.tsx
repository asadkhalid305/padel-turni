import { Info } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { updateEvent } from "@/app/actions";
import { EventForm } from "@/components/event-form";
import { PageBackLink } from "@/components/page-back-link";
import { SectionHeading } from "@/components/ui";
import {
  getEventFormInitialValues,
  listEligibleRosterPlayers,
  listPlayers,
} from "@/lib/data";
import { isWorkspaceAdminRole } from "@/lib/roles";
import {
  getAuthenticatedUser,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({
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
  const [players, allPlayers, initialValues] = await Promise.all([
    listEligibleRosterPlayers(user.activeWorkspaceId),
    listPlayers(user.activeWorkspaceId),
    getEventFormInitialValues(id, user.activeWorkspaceId),
  ]);
  if (!initialValues) notFound();

  async function updateCurrentEvent(formData: FormData) {
    "use server";

    formData.set("eventId", id);
    await updateEvent(formData);
  }

  const selectedPlayerIds = new Set(initialValues.playerIds);
  const availablePlayerById = new Map<
    string,
    { id: string; name: string; rating: number; isActive: boolean }
  >(players.map((player) => [player.id, player]));
  allPlayers
    .filter((player) => selectedPlayerIds.has(player.id))
    .forEach((player) => availablePlayerById.set(player.id, player));
  const availablePlayers = [...availablePlayerById.values()];
  const configured = isSupabaseConfigured();

  return (
    <div className="space-y-7">
      <PageBackLink href={`/events/${id}`} label="Event" />
      <SectionHeading
        eyebrow="Edit event"
        title="Adjust the setup without losing match truth."
        description="Scheduled draws can be regenerated from these settings. Completed matches stay locked."
      />
      {!configured ? (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="shrink-0" size={20} />
          Demo mode is read-only. Add the Supabase environment variables to edit
          persistent events.
        </div>
      ) : null}
      <EventForm
        action={updateCurrentEvent}
        players={availablePlayers}
        configured={configured}
        serverError={error}
        initialValues={initialValues}
        submitLabel="Save event"
        pendingLabel="Saving event..."
      />
    </div>
  );
}
