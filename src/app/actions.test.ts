import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  requireWorkspaceAdminUser: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  deliverFinalStandingsEmails: vi.fn(),
}));

const headerMocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: headerMocks.cookies,
  headers: headerMocks.headers,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  ACTIVE_WORKSPACE_COOKIE: "padeltour_active_workspace_id",
  createAuthClient: vi.fn(),
  createServerClient: supabaseMocks.createServerClient,
  getAuthenticatedUser: supabaseMocks.getAuthenticatedUser,
  requireWorkspaceAdminUser: supabaseMocks.requireWorkspaceAdminUser,
}));

vi.mock("@/lib/event-completion-emails", () => ({
  deliverFinalStandingsEmails: emailMocks.deliverFinalStandingsEmails,
}));

import {
  archiveLiveEvent,
  completeEvent,
  correctCompletedMatchScore,
  acceptWorkspaceInvite,
  createWorkspaceInvite,
  deletePlayer,
  removeWorkspaceMember,
  reopenCompletedMatch,
  retryFinalStandingsEmails,
  savePlayer,
  switchActiveWorkspace,
} from "@/app/actions";

describe("RBAC server actions", () => {
  beforeEach(() => {
    supabaseMocks.createServerClient.mockReset();
    supabaseMocks.getAuthenticatedUser.mockReset();
    supabaseMocks.requireWorkspaceAdminUser.mockReset();
    emailMocks.deliverFinalStandingsEmails.mockReset();
    headerMocks.cookies.mockReset();
    headerMocks.headers.mockReset();
  });

  it("blocks member users before player mutations reach Supabase", async () => {
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("name", "Member Managed");
    formData.set("rating", "5");
    formData.set("isActive", "true");

    const result = await savePlayer({ ok: false, message: "" }, formData);

    expect(result).toEqual({
      ok: false,
      message: "Only admins can make changes.",
    });
    expect(supabaseMocks.createServerClient).not.toHaveBeenCalled();
  });

  it("rejects player account links outside the active workspace", async () => {
    const insert = vi.fn();
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      email: "owner@example.com",
      displayName: "Owner",
      role: "member",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "workspace_memberships") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi
                    .fn()
                    .mockResolvedValue({ data: null, error: null }),
                })),
              })),
            })),
          };
        }

        return { insert };
      }),
    });
    const formData = new FormData();
    formData.set("name", "External Account");
    formData.set("rating", "5");
    formData.set("isActive", "true");
    formData.set("appUserId", "00000000-0000-4000-8000-000000000001");

    const result = await savePlayer({ ok: false, message: "" }, formData);

    expect(result).toEqual({
      ok: false,
      message: "Choose an account that belongs to this club.",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("saves linked player details and workspace role together", async () => {
    const updatePlayer = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }));
    const updateMembership = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }));
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      email: "owner@example.com",
      displayName: "Owner",
      role: "member",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "workspace_memberships") {
          return {
            select: vi.fn((columns: string) => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() =>
                  columns === "app_user_id"
                    ? {
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: { app_user_id: "member-user" },
                          error: null,
                        }),
                      }
                    : {
                        single: vi.fn().mockResolvedValue({
                          data: {
                            id: "00000000-0000-4000-8000-000000000002",
                            app_user_id: "member-user",
                            role: "member",
                          },
                          error: null,
                        }),
                      },
                ),
              })),
            })),
            update: updateMembership,
          };
        }
        if (table === "app_users") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    email: "member@example.com",
                    display_name: "Member User",
                  },
                  error: null,
                }),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { name: "Member User" },
                  error: null,
                }),
              })),
            })),
          })),
          update: updatePlayer,
        };
      }),
    });
    const formData = new FormData();
    formData.set("id", "00000000-0000-4000-8000-000000000001");
    formData.set("name", "Member User");
    formData.set("accountEmail", "member@example.com");
    formData.set("appUserId", "00000000-0000-4000-8000-000000000003");
    formData.set("rating", "6.5");
    formData.set("isActive", "true");
    formData.set("membershipId", "00000000-0000-4000-8000-000000000002");
    formData.set("workspaceRole", "admin");

    const result = await savePlayer({ ok: false, message: "" }, formData);

    expect(result).toEqual({ ok: true, message: "Player saved." });
    expect(updatePlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: 6.5,
        is_active: true,
        app_user_id: "00000000-0000-4000-8000-000000000003",
      }),
    );
    expect(updateMembership).toHaveBeenCalledWith({ role: "admin" });
  });

  it("creates a workspace invite without storing the raw token", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      email: "owner@example.com",
      displayName: "Owner",
      role: "member",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });
    headerMocks.headers.mockResolvedValue({
      get: vi.fn(() => "http://localhost:3100"),
    });
    const formData = new FormData();
    formData.set("email", " New.Member@Example.COM ");
    formData.set("expiresInDays", "7");

    const result = await createWorkspaceInvite(
      { ok: false, message: "" },
      formData,
    );

    expect(result.ok).toBe(true);
    expect(result.inviteUrl).toMatch(
      /^http:\/\/localhost:3100\/invites\/[A-Za-z0-9_-]+$/,
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "workspace-1",
        invited_email: "new.member@example.com",
        created_by_app_user_id: "owner-user",
      }),
    );
    expect(insert.mock.calls[0][0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    const expiryMs =
      new Date(insert.mock.calls[0][0].expires_at).getTime() - Date.now();
    expect(expiryMs).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(expiryMs).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
    expect(result.inviteUrl).not.toContain(insert.mock.calls[0][0].token_hash);
  });

  it("lets workspace admins delete unused players", async () => {
    const deletePlayerRow = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }));
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      email: "owner@example.com",
      displayName: "Owner",
      role: "member",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_players") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
            })),
          };
        }

        return {
          delete: deletePlayerRow,
        };
      }),
    });
    const formData = new FormData();
    formData.set("id", "00000000-0000-4000-8000-000000000001");

    const result = await deletePlayer({ ok: false, message: "" }, formData);

    expect(result).toEqual({ ok: true, message: "Player deleted." });
    expect(deletePlayerRow).toHaveBeenCalled();
  });

  it("switches the active workspace only after verifying membership", async () => {
    const cookieSet = vi.fn();
    const membershipFilter = vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { workspace_id: "00000000-0000-4000-8000-000000000002" },
        error: null,
      }),
    }));
    supabaseMocks.getAuthenticatedUser.mockResolvedValue({
      id: "member-user",
      email: "member@example.com",
      displayName: "Member",
      role: "member",
      activeWorkspaceId: "00000000-0000-4000-8000-000000000001",
      activeWorkspaceRole: "owner",
      workspaces: [],
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: membershipFilter,
          })),
        })),
      })),
    });
    headerMocks.cookies.mockResolvedValue({ set: cookieSet });
    const formData = new FormData();
    formData.set("workspaceId", "00000000-0000-4000-8000-000000000002");
    formData.set("nextPath", "/players");

    await expect(switchActiveWorkspace(formData)).rejects.toThrow(
      "redirect:/players",
    );

    expect(membershipFilter).toHaveBeenCalledWith("app_user_id", "member-user");
    expect(cookieSet).toHaveBeenCalledWith(
      "padeltour_active_workspace_id",
      "00000000-0000-4000-8000-000000000002",
      {
        sameSite: "lax",
        path: "/",
      },
    );
  });

  it("accepts a pending invite, adds membership, and switches active workspace", async () => {
    const upsertMembership = vi.fn().mockResolvedValue({ error: null });
    const insertPlayer = vi.fn().mockResolvedValue({ error: null });
    const updateInvite = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const cookieSet = vi.fn();
    supabaseMocks.getAuthenticatedUser.mockResolvedValue({
      id: "member-user",
      email: "member@example.com",
      displayName: "Member",
      role: "member",
      activeWorkspaceId: "personal-workspace",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "workspace_memberships") {
          return { upsert: upsertMembership };
        }
        if (table === "players") {
          return {
            select: vi.fn((columns: string) => {
              if (columns === "id,name,account_email") {
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi
                        .fn()
                        .mockResolvedValue({ data: null, error: null }),
                    })),
                  })),
                };
              }
              if (columns === "id") {
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi
                        .fn()
                        .mockResolvedValue({ data: null, error: null }),
                    })),
                  })),
                };
              }

              return {
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              };
            }),
            insert: insertPlayer,
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "invite-1",
                  workspace_id: "shared-workspace",
                  invited_email: "member@example.com",
                  status: "pending",
                  expires_at: "2999-01-01T00:00:00.000Z",
                },
                error: null,
              }),
            })),
          })),
          update: updateInvite,
        };
      }),
    });
    headerMocks.cookies.mockResolvedValue({ set: cookieSet });
    const formData = new FormData();
    formData.set("token", "abcdefghijklmnopqrstuvwxyz1234567890");

    await expect(
      acceptWorkspaceInvite({ ok: false, message: "" }, formData),
    ).rejects.toThrow("redirect:/");

    expect(upsertMembership).toHaveBeenCalledWith(
      {
        workspace_id: "shared-workspace",
        app_user_id: "member-user",
        role: "member",
      },
      { onConflict: "workspace_id,app_user_id", ignoreDuplicates: true },
    );
    expect(insertPlayer).toHaveBeenCalledWith({
      workspace_id: "shared-workspace",
      name: "Member",
      account_email: "member@example.com",
      app_user_id: "member-user",
      rating: 5,
      is_active: true,
    });
    expect(updateInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
        accepted_by_app_user_id: "member-user",
      }),
    );
    expect(cookieSet).toHaveBeenCalledWith(
      "padeltour_active_workspace_id",
      "shared-workspace",
      {
        sameSite: "lax",
        path: "/",
      },
    );
  });

  it("keeps open invite links reusable after a member accepts", async () => {
    const upsertMembership = vi.fn().mockResolvedValue({ error: null });
    const insertPlayer = vi.fn().mockResolvedValue({ error: null });
    const updateInvite = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const cookieSet = vi.fn();
    supabaseMocks.getAuthenticatedUser.mockResolvedValue({
      id: "member-user",
      email: "member@example.com",
      displayName: "Member",
      role: "member",
      activeWorkspaceId: "personal-workspace",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "workspace_memberships") {
          return { upsert: upsertMembership };
        }
        if (table === "players") {
          return {
            select: vi.fn((columns: string) => {
              if (columns === "id,name,account_email") {
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi
                        .fn()
                        .mockResolvedValue({ data: null, error: null }),
                    })),
                  })),
                };
              }
              if (columns === "id") {
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi
                        .fn()
                        .mockResolvedValue({ data: null, error: null }),
                    })),
                  })),
                };
              }

              return {
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              };
            }),
            insert: insertPlayer,
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "invite-1",
                  workspace_id: "shared-workspace",
                  invited_email: null,
                  status: "pending",
                  expires_at: "2999-01-01T00:00:00.000Z",
                },
                error: null,
              }),
            })),
          })),
          update: updateInvite,
        };
      }),
    });
    headerMocks.cookies.mockResolvedValue({ set: cookieSet });
    const formData = new FormData();
    formData.set("token", "abcdefghijklmnopqrstuvwxyz1234567890");

    await expect(
      acceptWorkspaceInvite({ ok: false, message: "" }, formData),
    ).rejects.toThrow("redirect:/");

    expect(upsertMembership).toHaveBeenCalled();
    expect(insertPlayer).toHaveBeenCalled();
    expect(updateInvite).not.toHaveBeenCalled();
    expect(cookieSet).toHaveBeenCalledWith(
      "padeltour_active_workspace_id",
      "shared-workspace",
      {
        sameSite: "lax",
        path: "/",
      },
    );
  });

  it("lets workspace admins remove non-owner members", async () => {
    const deleteMembership = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }));
    const unlinkPlayers = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }));
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      email: "owner@example.com",
      displayName: "Owner",
      role: "member",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceRole: "owner",
    });
    const from = vi.fn((table: string) => {
      if (table === "players") {
        return {
          update: unlinkPlayers,
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "00000000-0000-4000-8000-000000000001",
                  app_user_id: "member-user",
                  role: "member",
                },
                error: null,
              }),
            })),
          })),
        })),
        delete: deleteMembership,
      };
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from,
    });
    const formData = new FormData();
    formData.set("membershipId", "00000000-0000-4000-8000-000000000001");

    const result = await removeWorkspaceMember(
      { ok: false, message: "" },
      formData,
    );

    expect(result).toEqual({ ok: true, message: "Member removed." });
    expect(unlinkPlayers).toHaveBeenCalledWith({ app_user_id: null });
    expect(deleteMembership).toHaveBeenCalled();
  });

  it("does not let elevated users remove owners or themselves", async () => {
    const deleteMembership = vi.fn();
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      displayName: "Admin",
      role: "member",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceRole: "admin",
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "00000000-0000-4000-8000-000000000001",
                  app_user_id: "admin-user",
                  role: "admin",
                },
                error: null,
              }),
            })),
          })),
        })),
        delete: deleteMembership,
      })),
    });
    const formData = new FormData();
    formData.set("membershipId", "00000000-0000-4000-8000-000000000001");

    const result = await removeWorkspaceMember(
      { ok: false, message: "" },
      formData,
    );

    expect(result).toEqual({
      ok: false,
      message: "You cannot remove yourself.",
    });
    expect(deleteMembership).not.toHaveBeenCalled();
  });

  it("records an explicit completed-score correction through the guarded RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      activeWorkspaceId: "00000000-0000-4000-8000-000000000020",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({ rpc });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000030");
    formData.set("matchId", "00000000-0000-4000-8000-000000000040");
    formData.set("teamOneScore", "21");
    formData.set("teamTwoScore", "19");

    await expect(
      correctCompletedMatchScore({ ok: false, message: "" }, formData),
    ).resolves.toEqual({ ok: true, message: "Completed score corrected." });
    expect(rpc).toHaveBeenCalledWith("correct_completed_match_score", {
      p_workspace_id: "00000000-0000-4000-8000-000000000020",
      p_event_id: "00000000-0000-4000-8000-000000000030",
      p_match_id: "00000000-0000-4000-8000-000000000040",
      p_actor_id: "00000000-0000-4000-8000-000000000010",
      p_team_one_score: 21,
      p_team_two_score: 19,
    });
  });

  it("reopens completed matches only through the guarded RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      activeWorkspaceId: "00000000-0000-4000-8000-000000000020",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({ rpc });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000030");
    formData.set("matchId", "00000000-0000-4000-8000-000000000040");

    await expect(
      reopenCompletedMatch({ ok: false, message: "" }, formData),
    ).resolves.toEqual({
      ok: true,
      message: "Match reopened with score and timer cleared.",
    });
    expect(rpc).toHaveBeenCalledWith("reopen_completed_match", {
      p_workspace_id: "00000000-0000-4000-8000-000000000020",
      p_event_id: "00000000-0000-4000-8000-000000000030",
      p_match_id: "00000000-0000-4000-8000-000000000040",
      p_actor_id: "00000000-0000-4000-8000-000000000010",
    });
  });

  it("archives accidental live events through the workspace-scoped RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      activeWorkspaceId: "00000000-0000-4000-8000-000000000020",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({ rpc });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000030");

    await expect(
      archiveLiveEvent({ ok: false, message: "" }, formData),
    ).rejects.toThrow("redirect:/events");
    expect(rpc).toHaveBeenCalledWith("archive_live_event", {
      p_workspace_id: "00000000-0000-4000-8000-000000000020",
      p_event_id: "00000000-0000-4000-8000-000000000030",
    });
  });

  it("completes the tournament even when standings emails fail", async () => {
    const cancelScheduledMatches = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }));
    const completeEventRow = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }));
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      email: "owner@example.com",
      displayName: "Owner",
      role: "member",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceRole: "owner",
    });
    emailMocks.deliverFinalStandingsEmails.mockRejectedValue(
      new Error("provider down"),
    );
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      status: "scheduled",
                      starts_at: "2026-06-25T10:00:00.000Z",
                    },
                    error: null,
                  }),
                })),
              })),
            })),
            update: completeEventRow,
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [{ status: "completed" }, { status: "scheduled" }],
              error: null,
            }),
          })),
          update: cancelScheduledMatches,
        };
      }),
    });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000099");

    const result = await completeEvent({ ok: false, message: "" }, formData);

    expect(result.ok).toBe(true);
    expect(result.message).toContain(
      "Tournament completed. Unplayed matches were marked cancelled.",
    );
    expect(result.message).toContain(
      "Final standings emails could not be processed: provider down",
    );
    expect(cancelScheduledMatches).toHaveBeenCalledWith({
      status: "cancelled",
    });
    expect(completeEventRow).toHaveBeenCalledWith({ status: "completed" });
    expect(emailMocks.deliverFinalStandingsEmails).toHaveBeenCalledWith({
      client: expect.any(Object),
      workspaceId: "workspace-1",
      eventId: "00000000-0000-4000-8000-000000000099",
    });
  });

  it("does not retry standings emails before an event is completed", async () => {
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      email: "owner@example.com",
      displayName: "Owner",
      role: "member",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { status: "live" },
                error: null,
              }),
            })),
          })),
        })),
      })),
    });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000099");

    const result = await retryFinalStandingsEmails(
      { ok: false, message: "" },
      formData,
    );

    expect(result).toEqual({
      ok: false,
      message: "Final standings emails can only be retried after completion.",
    });
    expect(emailMocks.deliverFinalStandingsEmails).not.toHaveBeenCalled();
  });

  it("does not include skipped player counts in standings email success messages", async () => {
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      email: "owner@example.com",
      displayName: "Owner",
      role: "member",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceRole: "owner",
    });
    emailMocks.deliverFinalStandingsEmails.mockResolvedValue({
      sent: 1,
      failed: 0,
      pending: 0,
      skipped: 12,
      total: 1,
      isConfigured: true,
    });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { status: "completed" },
                error: null,
              }),
            })),
          })),
        })),
      })),
    });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000099");

    const result = await retryFinalStandingsEmails(
      { ok: false, message: "" },
      formData,
    );

    expect(result).toEqual({
      ok: true,
      message: "Final standings emails: 1 sent.",
    });
    expect(emailMocks.deliverFinalStandingsEmails).toHaveBeenCalledWith({
      client: expect.any(Object),
      workspaceId: "workspace-1",
      eventId: "00000000-0000-4000-8000-000000000099",
    });
  });
});
