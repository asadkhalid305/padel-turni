import { AccessLimited } from "@/components/access-limited";
import { PlayerManager } from "@/components/player-manager";
import { SectionHeading } from "@/components/ui";
import { WorkspaceInviteManager } from "@/components/workspace-invite-manager";
import {
  canViewPrivateData,
  listPlayers,
  listWorkspaceMembers,
  listWorkspaceInvites,
} from "@/lib/data";
import { isWorkspaceAdminRole } from "@/lib/roles";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const metadata = { title: "Players" };

export default async function PlayersPage() {
  const user = await getAuthenticatedUser();
  if (!(await canViewPrivateData(user))) {
    return <AccessLimited />;
  }
  const workspaceId = user?.activeWorkspaceId;
  if (!workspaceId) return <AccessLimited />;

  const canManage = isWorkspaceAdminRole(user?.activeWorkspaceRole ?? null);
  const [players, invites, members] = await Promise.all([
    listPlayers(workspaceId),
    canManage ? listWorkspaceInvites(workspaceId) : Promise.resolve([]),
    listWorkspaceMembers(workspaceId),
  ]);
  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="People"
        title="Players"
        description="Invite account members, manage club access, and see who is ready for future event rosters."
      />
      <PlayerManager
        players={players}
        members={members}
        canManage={canManage}
        canManageRoles={canManage}
        currentAppUserId={user.id}
      />
      {canManage ? <WorkspaceInviteManager invites={invites} /> : null}
    </div>
  );
}
