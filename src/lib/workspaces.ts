import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkspaceRole } from "@/lib/roles";
import type { Database } from "@/types/database";

export type WorkspaceMembership = {
  workspaceId: string;
  role: WorkspaceRole;
};

export type UserWorkspaceMembership = WorkspaceMembership & {
  name: string;
};

export async function ensureDefaultWorkspaceForUser(
  client: SupabaseClient<Database>,
  user: { id: string; displayName: string; email: string },
  preferredWorkspaceId?: string | null,
): Promise<WorkspaceMembership> {
  if (preferredWorkspaceId) {
    const preferredMembership = await getWorkspaceMembership(
      client,
      user.id,
      preferredWorkspaceId,
    );
    if (preferredMembership) {
      const repairedMembership = await repairOwnerlessSeedWorkspaceForUser(
        client,
        user,
        preferredMembership,
      );
      if (repairedMembership) return repairedMembership;

      await ensureWorkspaceMemberPlayer(
        client,
        preferredMembership.workspace_id,
        user,
      );
      return {
        workspaceId: preferredMembership.workspace_id,
        role: preferredMembership.role,
      };
    }
  }

  const { data: existingMembership, error: existingMembershipError } =
    await client
      .from("workspace_memberships")
      .select("workspace_id,role")
      .eq("app_user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();

  if (existingMembershipError) throw existingMembershipError;
  if (existingMembership) {
    const repairedMembership = await repairOwnerlessSeedWorkspaceForUser(
      client,
      user,
      existingMembership,
    );
    if (repairedMembership) return repairedMembership;

    await ensureWorkspaceMemberPlayer(
      client,
      existingMembership.workspace_id,
      user,
    );
    const preferredMembership = preferredWorkspaceId
      ? await getWorkspaceMembership(client, user.id, preferredWorkspaceId)
      : null;
    if (preferredMembership) {
      await ensureWorkspaceMemberPlayer(
        client,
        preferredMembership.workspace_id,
        user,
      );
      return {
        workspaceId: preferredMembership.workspace_id,
        role: preferredMembership.role,
      };
    }
    return {
      workspaceId: existingMembership.workspace_id,
      role: existingMembership.role,
    };
  }

  const adoptedSeedWorkspace = await adoptSeedWorkspaceForUser(client, user);
  if (adoptedSeedWorkspace) {
    const preferredMembership = preferredWorkspaceId
      ? await getWorkspaceMembership(client, user.id, preferredWorkspaceId)
      : null;
    if (preferredMembership) {
      await ensureWorkspaceMemberPlayer(
        client,
        preferredMembership.workspace_id,
        user,
      );
      return {
        workspaceId: preferredMembership.workspace_id,
        role: preferredMembership.role,
      };
    }
    return adoptedSeedWorkspace;
  }

  const { data: workspace, error: workspaceError } = await client
    .from("workspaces")
    .insert({
      name: defaultWorkspaceName(user),
      personal_owner_app_user_id: user.id,
    })
    .select("id")
    .single();

  if (workspaceError) throw workspaceError;

  const { data: membership, error: membershipError } = await client
    .from("workspace_memberships")
    .insert({
      workspace_id: workspace.id,
      app_user_id: user.id,
      role: "owner",
    })
    .select("workspace_id,role")
    .single();

  if (membershipError) throw membershipError;
  await ensureWorkspaceMemberPlayer(client, membership.workspace_id, user);
  const preferredMembership = preferredWorkspaceId
    ? await getWorkspaceMembership(client, user.id, preferredWorkspaceId)
    : null;
  if (preferredMembership) {
    await ensureWorkspaceMemberPlayer(
      client,
      preferredMembership.workspace_id,
      user,
    );
    return {
      workspaceId: preferredMembership.workspace_id,
      role: preferredMembership.role,
    };
  }

  return {
    workspaceId: membership.workspace_id,
    role: membership.role,
  };
}

async function getWorkspaceMembership(
  client: SupabaseClient<Database>,
  appUserId: string,
  workspaceId: string,
) {
  const { data, error } = await client
    .from("workspace_memberships")
    .select("workspace_id,role")
    .eq("app_user_id", appUserId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function repairOwnerlessSeedWorkspaceForUser(
  client: SupabaseClient<Database>,
  user: { id: string; displayName: string; email: string },
  membership: { workspace_id: string; role: WorkspaceRole },
): Promise<WorkspaceMembership | null> {
  if (membership.role !== "member") return null;

  const { data: workspace, error: workspaceError } = await client
    .from("workspaces")
    .select("id,personal_owner_app_user_id")
    .eq("id", membership.workspace_id)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace || workspace.personal_owner_app_user_id) return null;

  if (
    seededPersonalWorkspaceIdsByEmail().get(user.email) !==
    membership.workspace_id
  ) {
    return null;
  }

  const { error: updateWorkspaceError } = await client
    .from("workspaces")
    .update({
      name: defaultWorkspaceName(user),
      personal_owner_app_user_id: user.id,
    })
    .eq("id", workspace.id);
  if (updateWorkspaceError) throw updateWorkspaceError;

  const { data: repairedMembership, error: updateMembershipError } =
    await client
      .from("workspace_memberships")
      .update({ role: "owner" })
      .eq("workspace_id", workspace.id)
      .eq("app_user_id", user.id)
      .select("workspace_id,role")
      .single();
  if (updateMembershipError) throw updateMembershipError;

  await ensureWorkspaceMemberPlayer(client, workspace.id, user);

  return {
    workspaceId: repairedMembership.workspace_id,
    role: repairedMembership.role,
  };
}

async function adoptSeedWorkspaceForUser(
  client: SupabaseClient<Database>,
  user: { id: string; displayName: string; email: string },
): Promise<WorkspaceMembership | null> {
  const seededWorkspaceId = seededPersonalWorkspaceIdsByEmail().get(user.email);

  if (!seededWorkspaceId) return null;

  const { data: workspace, error: workspaceError } = await client
    .from("workspaces")
    .select("id,personal_owner_app_user_id")
    .eq("id", seededWorkspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace || workspace.personal_owner_app_user_id) return null;

  const { error: updateWorkspaceError } = await client
    .from("workspaces")
    .update({
      name: defaultWorkspaceName(user),
      personal_owner_app_user_id: user.id,
    })
    .eq("id", workspace.id);
  if (updateWorkspaceError) throw updateWorkspaceError;

  const { data: adoptedMembership, error: insertMembershipError } = await client
    .from("workspace_memberships")
    .insert({
      workspace_id: workspace.id,
      app_user_id: user.id,
      role: "owner",
    })
    .select("workspace_id,role")
    .single();
  if (insertMembershipError) throw insertMembershipError;

  await ensureWorkspaceMemberPlayer(client, workspace.id, user);

  return {
    workspaceId: adoptedMembership.workspace_id,
    role: adoptedMembership.role,
  };
}

export async function listUserWorkspaceMemberships(
  client: SupabaseClient<Database>,
  appUserId: string,
): Promise<UserWorkspaceMembership[]> {
  const { data: memberships, error: membershipsError } = await client
    .from("workspace_memberships")
    .select("workspace_id,role")
    .eq("app_user_id", appUserId)
    .order("created_at");
  if (membershipsError) throw membershipsError;
  if (!memberships.length) return [];

  const workspaceIds = memberships.map((membership) => membership.workspace_id);
  const { data: workspaces, error: workspacesError } = await client
    .from("workspaces")
    .select("id,name")
    .in("id", workspaceIds);
  if (workspacesError) throw workspacesError;

  const workspaceNameById = new Map(
    workspaces.map((workspace) => [
      workspace.id,
      clubDisplayName(workspace.name),
    ]),
  );

  return memberships
    .map((membership) => {
      const name = workspaceNameById.get(membership.workspace_id);
      if (!name) return null;

      return {
        workspaceId: membership.workspace_id,
        role: membership.role,
        name,
      };
    })
    .filter((membership): membership is UserWorkspaceMembership =>
      Boolean(membership),
    );
}

function defaultWorkspaceName(user: { displayName: string; email: string }) {
  const displayName = user.displayName.trim();
  if (displayName) return `${displayName}'s club`;

  const [localPart] = user.email.split("@");
  return `${localPart}'s club`;
}

function clubDisplayName(name: string) {
  return name.endsWith("'s workspace")
    ? `${name.slice(0, -"workspace".length)}club`
    : name;
}

function parseSeededPersonalWorkspaceMapping(value: string | undefined) {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry): [string, string] | null => {
      const [email, workspaceId] = entry.split(":").map((part) => part.trim());
      if (!email || !workspaceId) return null;
      return [email.toLowerCase(), workspaceId];
    })
    .filter((entry): entry is [string, string] => Boolean(entry));

  return new Map(entries);
}

function seededPersonalWorkspaceIdsByEmail() {
  return parseSeededPersonalWorkspaceMapping(
    process.env.PADELTOUR_SEEDED_PERSONAL_WORKSPACES,
  );
}

export async function ensureWorkspaceMemberPlayer(
  client: SupabaseClient<Database>,
  workspaceId: string,
  user: { id: string; displayName: string; email: string },
) {
  const name = playerName(user);
  const { data: linkedPlayer, error: linkedPlayerError } = await client
    .from("players")
    .select("id,name,account_email")
    .eq("workspace_id", workspaceId)
    .eq("app_user_id", user.id)
    .maybeSingle();
  if (linkedPlayerError) throw linkedPlayerError;

  if (linkedPlayer) {
    if (
      linkedPlayer.name !== name ||
      linkedPlayer.account_email !== user.email
    ) {
      const { error } = await client
        .from("players")
        .update({ name, account_email: user.email })
        .eq("id", linkedPlayer.id)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    }
    return;
  }

  const { error } = await client.from("players").insert({
    workspace_id: workspaceId,
    name,
    account_email: user.email,
    app_user_id: user.id,
    rating: 5,
    is_active: true,
  });
  if (isUniqueViolation(error)) {
    const { data: conflictPlayer, error: conflictReadError } = await client
      .from("players")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("app_user_id", user.id)
      .maybeSingle();
    if (!conflictReadError && conflictPlayer) return;
  }
  if (error) throw error;
}

function playerName(user: { displayName: string; email: string }) {
  const displayName = user.displayName.trim();
  return displayName || user.email;
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505";
}
