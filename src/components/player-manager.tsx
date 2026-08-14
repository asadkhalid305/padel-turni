"use client";

import { History, UserRoundCheck, UserRoundX } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  updateWorkspaceMemberRosterSettings,
  type ActionState,
} from "@/app/actions";
import {
  MemberRating,
  MemberRatingExplanation,
} from "@/components/member-rating";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import {
  RemoveWorkspaceMemberButton,
  WorkspaceRoleBadge,
} from "@/components/workspace-member-manager";
import type { WorkspaceMember } from "@/lib/data";
import { initials } from "@/lib/utils";

type Player = {
  id: string;
  name: string;
  appUserId: string | null;
  accountEmail: string | null;
  accountDisplayName: string | null;
  rating: number;
  isActive: boolean;
};

const initialState: ActionState = { ok: false, message: "" };

export function PlayerManager({
  players,
  members,
  canManage,
  canManageRoles,
  currentAppUserId,
}: {
  players: Player[];
  members: WorkspaceMember[];
  canManage: boolean;
  canManageRoles: boolean;
  currentAppUserId: string;
}) {
  const legacyPlayers = players.filter((player) => !player.appUserId);

  return (
    <div className="space-y-6">
      <Card className="p-2 sm:p-3">
        <div className="px-3 pb-3 pt-2">
          <MemberRatingExplanation />
        </div>
        <div className="grid gap-2">
          {members.length ? (
            members
              .slice()
              .sort(compareMembers)
              .map((member) => (
                <MemberRow
                  key={member.membershipId}
                  member={member}
                  canManage={canManage}
                  canManageRoles={canManageRoles}
                  currentAppUserId={currentAppUserId}
                />
              ))
          ) : (
            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-black text-[var(--ink)]">
                No joined members yet.
              </p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
                Participants must accept the club invitation and complete their
                rating profile before they can join a new event roster.
              </p>
            </div>
          )}
        </div>
      </Card>

      {legacyPlayers.length ? (
        <Card>
          <div className="flex items-center gap-2">
            <History size={18} className="text-slate-500" />
            <h2 className="text-lg font-black text-[var(--ink)]">
              Legacy player history
            </h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            These manual players remain available in historical events and
            standings. They cannot be edited, linked, or selected for a new
            event.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {legacyPlayers.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-700 text-xs font-black text-white">
                  {initials(player.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--ink)]">
                  {player.name}
                </span>
                <Badge tone="neutral">History only</Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function MemberRow({
  member,
  canManage,
  canManageRoles,
  currentAppUserId,
}: {
  member: WorkspaceMember;
  canManage: boolean;
  canManageRoles: boolean;
  currentAppUserId: string;
}) {
  const [state, action, pending] = useActionState(
    updateWorkspaceMemberRosterSettings,
    initialState,
  );
  const router = useRouter();
  const displayName = member.displayName || member.email;
  const canChangeRole =
    canManageRoles &&
    member.role !== "owner" &&
    member.appUserId !== currentAppUserId;
  const profileComplete = member.ratingProfileStatus === "completed";
  const rosterReady = member.isRosterActive && profileComplete;

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md">
      <div className="grid gap-4 xl:grid-cols-[minmax(17rem,1fr)_auto] xl:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--ink)] text-sm font-black text-white">
            {initials(displayName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-[var(--ink)]">
              {displayName}
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
              {member.email}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {profileComplete
                ? "Rating profile complete"
                : "Rating profile incomplete"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <MemberRating rating={member.ratingPresentation} compact />
          <Badge tone={rosterReady ? "success" : "neutral"}>
            {rosterReady ? (
              <UserRoundCheck className="mr-1" size={13} />
            ) : (
              <UserRoundX className="mr-1" size={13} />
            )}
            {rosterReady ? "Roster ready" : "Not eligible"}
          </Badge>
          <WorkspaceRoleBadge role={member.role} />
          {canManage ? (
            <form action={action} className="flex flex-wrap items-center gap-2">
              <input
                type="hidden"
                name="membershipId"
                value={member.membershipId}
              />
              <label className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-[var(--ink)]">
                <input type="hidden" name="isActive" value="false" />
                <input
                  type="checkbox"
                  name="isActive"
                  value="true"
                  defaultChecked={member.isRosterActive}
                  className="size-4 accent-emerald-700"
                />
                Active
              </label>
              {canChangeRole ? (
                <select
                  className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold"
                  name="workspaceRole"
                  defaultValue={member.role}
                  aria-label={`Club role for ${displayName}`}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              ) : null}
              <Button type="submit" variant="secondary" disabled={pending}>
                {pending ? <Spinner /> : "Save"}
              </Button>
            </form>
          ) : null}
          <RemoveWorkspaceMemberButton
            member={member}
            currentAppUserId={currentAppUserId}
            canManageRoles={canManageRoles}
          />
        </div>
      </div>
      {state.message ? (
        <p
          role="status"
          className={`mt-2 text-xs font-semibold ${
            state.ok ? "text-emerald-700" : "text-rose-600"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function compareMembers(first: WorkspaceMember, second: WorkspaceMember) {
  const roleRank = { owner: 0, admin: 1, member: 2 };
  const rankDifference = roleRank[first.role] - roleRank[second.role];
  if (rankDifference) return rankDifference;
  return (first.displayName || first.email).localeCompare(
    second.displayName || second.email,
  );
}
