import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const supabaseMocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: supabaseMocks.createServerClient,
  isSupabaseConfigured: () => true,
}));

import {
  canViewPrivateData,
  getWorkspaceInvitePreview,
  listEvents,
  listWorkspaceInvites,
  listWorkspaceMembers,
  listPlayers,
} from "@/lib/data";

describe("private data access", () => {
  beforeEach(() => {
    supabaseMocks.createServerClient.mockReset();
  });

  it("allows signed-in users with an active workspace", async () => {
    supabaseMocks.createServerClient.mockReturnValue({});

    await expect(
      canViewPrivateData({
        id: "owner-user",
        role: "member",
        activeWorkspaceId: "workspace-1",
      }),
    ).resolves.toBe(true);
  });

  it("blocks signed-in users without an active workspace", async () => {
    supabaseMocks.createServerClient.mockReturnValue({});

    await expect(
      canViewPrivateData({ id: "member-user", role: "super_admin" }),
    ).resolves.toBe(false);
  });
});

describe("workspace-scoped reads", () => {
  beforeEach(() => {
    supabaseMocks.createServerClient.mockReset();
  });

  it("returns no persisted players when no workspace is active", async () => {
    const from = vi.fn();
    supabaseMocks.createServerClient.mockReturnValue({ from });

    await expect(listPlayers(null)).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("loads players only from the active workspace", async () => {
    const workspaceFilter = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: "player-1",
              app_user_id: null,
              name: "Workspace Player",
              account_email: null,
              rating: 6.5,
              is_active: true,
            },
          ],
          error: null,
        }),
      })),
    }));
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "workspace_memberships") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: workspaceFilter,
          })),
        };
      }),
    });

    await expect(listPlayers("workspace-1")).resolves.toEqual([
      {
        id: "player-1",
        name: "Workspace Player",
        appUserId: null,
        accountEmail: null,
        accountDisplayName: null,
        rating: 6.5,
        isActive: true,
      },
    ]);
    expect(workspaceFilter).toHaveBeenCalledWith("workspace_id", "workspace-1");
  });

  it("loads events only from the active workspace", async () => {
    const workspaceFilter = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "event-1",
            name: "Workspace Event",
            venue: "Court One",
            starts_at: "2026-06-24T10:00:00.000Z",
            status: "scheduled",
            event_players: [{ count: 4 }],
            matches: [{ status: "completed" }, { status: "scheduled" }],
          },
        ],
        error: null,
      }),
    }));
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: workspaceFilter,
        })),
      })),
    });

    await expect(listEvents("workspace-1")).resolves.toEqual([
      {
        id: "event-1",
        name: "Workspace Event",
        venue: "Court One",
        startsAt: "2026-06-24T10:00:00.000Z",
        status: "scheduled",
        playerCount: 4,
        completedMatches: 1,
        totalMatches: 2,
      },
    ]);
    expect(workspaceFilter).toHaveBeenCalledWith("workspace_id", "workspace-1");
  });

  it("lists workspace invites only for the active workspace", async () => {
    const workspaceFilter = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "invite-1",
            invited_email: "member@example.com",
            status: "pending",
            expires_at: "2999-01-01T00:00:00.000Z",
            created_at: "2026-06-24T10:00:00.000Z",
          },
        ],
        error: null,
      }),
    }));
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: workspaceFilter,
        })),
      })),
    });

    await expect(listWorkspaceInvites("workspace-1")).resolves.toEqual([
      {
        id: "invite-1",
        invitedEmail: "member@example.com",
        status: "pending",
        expiresAt: "2999-01-01T00:00:00.000Z",
        createdAt: "2026-06-24T10:00:00.000Z",
      },
    ]);
    expect(workspaceFilter).toHaveBeenCalledWith("workspace_id", "workspace-1");
  });

  it("previews invite status without exposing workspace details", async () => {
    const token = "abcdefghijklmnopqrstuvwxyz1234567890";
    const tokenFilter = vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          invited_email: null,
          status: "pending",
          expires_at: "2999-01-01T00:00:00.000Z",
        },
        error: null,
      }),
    }));
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: tokenFilter,
        })),
      })),
    });

    await expect(getWorkspaceInvitePreview(token)).resolves.toEqual({
      status: "pending",
      workspaceName: null,
      invitedEmail: null,
      expiresAt: "2999-01-01T00:00:00.000Z",
    });
    expect(tokenFilter).toHaveBeenCalledWith(
      "token_hash",
      createHash("sha256").update(token).digest("hex"),
    );
  });

  it("lists joined workspace members with linked player names", async () => {
    const workspaceMembershipFilter = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "membership-1",
            app_user_id: "member-user",
            role: "admin",
          },
        ],
        error: null,
      }),
    }));
    const userFilter = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "member-user",
            email: "member@example.com",
            display_name: "Member",
          },
        ],
        error: null,
      }),
    }));
    const playerFilter = vi.fn(() => ({
      in: vi.fn().mockResolvedValue({
        data: [{ app_user_id: "member-user", name: "Roster Member" }],
        error: null,
      }),
    }));
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "workspace_memberships") {
          return {
            select: vi.fn(() => ({
              eq: workspaceMembershipFilter,
            })),
          };
        }
        if (table === "app_users") {
          return {
            select: vi.fn(() => ({
              in: userFilter,
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: playerFilter,
          })),
        };
      }),
    });

    await expect(listWorkspaceMembers("workspace-1")).resolves.toEqual([
      {
        membershipId: "membership-1",
        appUserId: "member-user",
        email: "member@example.com",
        displayName: "Member",
        role: "admin",
        linkedPlayerName: "Roster Member",
      },
    ]);
    expect(workspaceMembershipFilter).toHaveBeenCalledWith(
      "workspace_id",
      "workspace-1",
    );
    expect(userFilter).toHaveBeenCalledWith("id", ["member-user"]);
  });
});
