import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  requireWorkspaceAdminUser: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  deliverFinalStandingsEmails: vi.fn(),
  sendViaResend: vi.fn(),
}));

const analyticsMocks = vi.hoisted(() => ({
  recordProductEvent: vi.fn(),
}));

const ratingMocks = vi.hoisted(() => ({
  processInitialEventRating: vi.fn(),
}));

const protectionMocks = vi.hoisted(() => ({
  checkPublicRequestLimit: vi.fn(),
  isLikelyAutomatedFeedback: vi.fn(),
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

vi.mock("@/lib/email", () => ({
  sendViaResend: emailMocks.sendViaResend,
}));

vi.mock("@/lib/product-analytics", () => ({
  recordProductEvent: analyticsMocks.recordProductEvent,
}));

vi.mock("@/lib/event-rating-application", () => ({
  processInitialEventRating: ratingMocks.processInitialEventRating,
}));

vi.mock("@/lib/public-request-protection", () => ({
  checkPublicRequestLimit: protectionMocks.checkPublicRequestLimit,
  FEEDBACK_REQUEST_LIMIT: 3,
  FEEDBACK_WINDOW_SECONDS: 3600,
  isLikelyAutomatedFeedback: protectionMocks.isLikelyAutomatedFeedback,
}));

import {
  archiveEvent,
  cancelEvent,
  changeEventStandingsEligibility,
  completeEvent,
  correctCompletedMatchScore,
  acceptWorkspaceInvite,
  createWorkspaceInvite,
  removeWorkspaceMember,
  reopenCompletedMatch,
  reshuffleRandomDraw,
  restoreEvent,
  retryEventRatingJob,
  retryFinalStandingsEmails,
  saveScore,
  updateWorkspaceMemberRosterSettings,
  submitFeedback,
  switchActiveWorkspace,
} from "@/app/actions";

function validFeedbackFormData() {
  const formData = new FormData();
  formData.set("startedAt", String(Date.now() - 10_000));
  formData.set("company", "");
  formData.set("email", "visitor@example.com");
  formData.set("category", "general");
  formData.set("message", "This is a useful feedback message.");
  return formData;
}

describe("RBAC server actions", () => {
  beforeEach(() => {
    supabaseMocks.createServerClient.mockReset();
    supabaseMocks.getAuthenticatedUser.mockReset();
    supabaseMocks.requireWorkspaceAdminUser.mockReset();
    emailMocks.deliverFinalStandingsEmails.mockReset();
    emailMocks.sendViaResend.mockReset();
    analyticsMocks.recordProductEvent.mockReset();
    ratingMocks.processInitialEventRating.mockReset();
    ratingMocks.processInitialEventRating.mockResolvedValue({
      status: "not_claimed",
    });
    protectionMocks.checkPublicRequestLimit.mockReset();
    protectionMocks.isLikelyAutomatedFeedback.mockReset();
    protectionMocks.isLikelyAutomatedFeedback.mockReturnValue(false);
    headerMocks.cookies.mockReset();
    headerMocks.headers.mockReset();
    process.env.RESEND_SUPPORT_EMAIL = "support@example.com";
  });

  it("silently drops feedback caught by the bot trap", async () => {
    protectionMocks.isLikelyAutomatedFeedback.mockReturnValue(true);
    const formData = new FormData();
    formData.set("company", "Example Company");
    formData.set("startedAt", String(Date.now() - 10_000));
    formData.set("message", "This message is long enough.");

    const result = await submitFeedback({ ok: false, message: "" }, formData);

    expect(result).toEqual({
      ok: true,
      message: "Thanks. If your message was accepted, it will be reviewed.",
    });
    expect(supabaseMocks.createServerClient).not.toHaveBeenCalled();
    expect(emailMocks.sendViaResend).not.toHaveBeenCalled();
    expect(analyticsMocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("rejects rate-limited feedback before email and storage", async () => {
    const from = vi.fn();
    supabaseMocks.createServerClient.mockReturnValue({ from });
    protectionMocks.checkPublicRequestLimit.mockResolvedValue(false);
    const formData = validFeedbackFormData();

    const result = await submitFeedback({ ok: false, message: "" }, formData);

    expect(result.ok).toBe(true);
    expect(emailMocks.sendViaResend).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(supabaseMocks.getAuthenticatedUser).not.toHaveBeenCalled();
    expect(analyticsMocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("sends, stores, and records normal feedback once", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    supabaseMocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });
    supabaseMocks.getAuthenticatedUser.mockResolvedValue(null);
    protectionMocks.checkPublicRequestLimit.mockResolvedValue(true);
    emailMocks.sendViaResend.mockResolvedValue("provider-message-id");
    const formData = validFeedbackFormData();

    const result = await submitFeedback({ ok: false, message: "" }, formData);

    expect(result).toEqual({
      ok: true,
      message: "Thanks. Your feedback was sent.",
    });
    expect(emailMocks.sendViaResend).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(analyticsMocks.recordProductEvent).toHaveBeenCalledTimes(1);
  });

  it("blocks members before club roster activation mutations reach Supabase", async () => {
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("membershipId", "00000000-0000-4000-8000-000000000001");
    formData.set("isActive", "true");

    const result = await updateWorkspaceMemberRosterSettings(
      { ok: false, message: "" },
      formData,
    );

    expect(result).toEqual({
      ok: false,
      message: "Only admins can make changes.",
    });
    expect(supabaseMocks.createServerClient).not.toHaveBeenCalled();
  });

  it("blocks members before rating retry diagnostics reach Supabase", async () => {
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000001");
    formData.set("jobId", "00000000-0000-4000-8000-000000000002");

    await expect(
      retryEventRatingJob({ ok: false, message: "" }, formData),
    ).resolves.toEqual({
      ok: false,
      message: "Only admins can make changes.",
    });
    expect(supabaseMocks.createServerClient).not.toHaveBeenCalled();
  });

  it("retries only a failed unlocked rating job in the active club", async () => {
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      activeWorkspaceId: "00000000-0000-4000-8000-000000000010",
      activeWorkspaceRole: "owner",
    });
    const eventMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000001" },
      error: null,
    });
    const jobMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "00000000-0000-4000-8000-000000000002",
        status: "failed",
        lock_token: null,
      },
      error: null,
    });
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: table === "events" ? eventMaybeSingle : jobMaybeSingle,
          })),
        })),
      })),
    }));
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    supabaseMocks.createServerClient.mockReturnValue({ from, rpc });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000001");
    formData.set("jobId", "00000000-0000-4000-8000-000000000002");

    await expect(
      retryEventRatingJob({ ok: false, message: "" }, formData),
    ).resolves.toEqual({
      ok: true,
      message: "Rating work queued for a safe retry.",
    });
    expect(rpc).toHaveBeenCalledWith("retry_failed_event_rating_job", {
      p_job_id: "00000000-0000-4000-8000-000000000002",
    });
  });

  it.each([
    ["pending", null],
    ["processing", "00000000-0000-4000-8000-000000000099"],
    ["applied", null],
  ])("refuses a %s or locked rating retry", async (status, lockToken) => {
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      activeWorkspaceId: "00000000-0000-4000-8000-000000000010",
      activeWorkspaceRole: "owner",
    });
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data:
                table === "events"
                  ? { id: "00000000-0000-4000-8000-000000000001" }
                  : {
                      id: "00000000-0000-4000-8000-000000000002",
                      status,
                      lock_token: lockToken,
                    },
              error: null,
            }),
          })),
        })),
      })),
    }));
    const rpc = vi.fn();
    supabaseMocks.createServerClient.mockReturnValue({ from, rpc });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000001");
    formData.set("jobId", "00000000-0000-4000-8000-000000000002");

    const result = await retryEventRatingJob(
      { ok: false, message: "" },
      formData,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("already queued or cannot be retried");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("updates only the accepted member proxy activation and club role", async () => {
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
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: "00000000-0000-4000-8000-000000000002",
                      app_user_id: "member-user",
                      role: "member",
                    },
                    error: null,
                  }),
                })),
              })),
            })),
            update: updateMembership,
          };
        }
        return {
          update: updatePlayer,
        };
      }),
    });
    const formData = new FormData();
    formData.set("isActive", "true");
    formData.set("membershipId", "00000000-0000-4000-8000-000000000002");
    formData.set("workspaceRole", "admin");

    const result = await updateWorkspaceMemberRosterSettings(
      { ok: false, message: "" },
      formData,
    );

    expect(result).toEqual({
      ok: true,
      message: "Member roster settings updated.",
    });
    expect(updatePlayer).toHaveBeenCalledWith({ is_active: true });
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
    ).rejects.toThrow("redirect:/rating");

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
    ).rejects.toThrow("redirect:/rating");

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
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      email: "owner@example.com",
      displayName: "Owner",
      role: "member",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceRole: "owner",
    });
    const from = vi.fn((_table: string) => {
      void _table;
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
    expect(from.mock.calls.some(([table]) => table === "players")).toBe(false);
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
    formData.set("reason", "Corrected from the signed score sheet.");

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
      p_reason: "Corrected from the signed score sheet.",
    });
  });

  it("records an ordinary live score without requiring an audit reason", async () => {
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      activeWorkspaceId: "00000000-0000-4000-8000-000000000020",
      activeWorkspaceRole: "owner",
    });
    const matchSingle = vi.fn().mockResolvedValue({
      data: { status: "scheduled" },
      error: null,
    });
    const eventSingle = vi.fn().mockResolvedValue({
      data: { status: "live", starts_at: "2026-07-22T10:00:00.000Z" },
      error: null,
    });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const from = vi.fn((table: string) => {
      if (table === "matches") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ single: matchSingle })),
            })),
          })),
          update,
        };
      }
      if (table === "events") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ single: eventSingle })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    supabaseMocks.createServerClient.mockReturnValue({ from });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000030");
    formData.set("matchId", "00000000-0000-4000-8000-000000000040");
    formData.set("teamOneScore", "21");
    formData.set("teamTwoScore", "19");

    await expect(
      saveScore({ ok: false, message: "" }, formData),
    ).resolves.toEqual({ ok: true, message: "Score recorded." });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        team_one_score: 21,
        team_two_score: 19,
        status: "completed",
      }),
    );
  });

  it("still requires an audit reason for a completed-score correction", async () => {
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000030");
    formData.set("matchId", "00000000-0000-4000-8000-000000000040");
    formData.set("teamOneScore", "21");
    formData.set("teamTwoScore", "19");

    const result = await correctCompletedMatchScore(
      { ok: false, message: "" },
      formData,
    );

    expect(result.ok).toBe(false);
    expect(supabaseMocks.requireWorkspaceAdminUser).not.toHaveBeenCalled();
    expect(supabaseMocks.createServerClient).not.toHaveBeenCalled();
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

  it("cancels accidental live events through the workspace-scoped RPC", async () => {
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
      cancelEvent({ ok: false, message: "" }, formData),
    ).rejects.toThrow("redirect:/events?view=archived");
    expect(rpc).toHaveBeenCalledWith("cancel_live_event", {
      p_workspace_id: "00000000-0000-4000-8000-000000000020",
      p_event_id: "00000000-0000-4000-8000-000000000030",
    });
  });

  it("archives and restores completed events without changing standings", async () => {
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
      archiveEvent({ ok: false, message: "" }, formData),
    ).rejects.toThrow("redirect:/events?view=archived");
    expect(rpc).toHaveBeenCalledWith("archive_completed_event", {
      p_workspace_id: "00000000-0000-4000-8000-000000000020",
      p_event_id: "00000000-0000-4000-8000-000000000030",
    });

    await expect(
      restoreEvent({ ok: false, message: "" }, formData),
    ).rejects.toThrow("redirect:/events");
    expect(rpc).toHaveBeenCalledWith("restore_archived_event", {
      p_workspace_id: "00000000-0000-4000-8000-000000000020",
      p_event_id: "00000000-0000-4000-8000-000000000030",
    });
  });

  it("changes completed-event standings eligibility through the guarded RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      activeWorkspaceId: "00000000-0000-4000-8000-000000000020",
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({ rpc });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000030");
    formData.set("standingsEligible", "false");
    formData.set("reason", "Event was entered twice.");

    await expect(
      changeEventStandingsEligibility({ ok: false, message: "" }, formData),
    ).resolves.toEqual({
      ok: true,
      message:
        "Event results excluded. Standings and any applicable automated ratings are recalculating.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "set_completed_event_standings_eligibility",
      {
        p_workspace_id: "00000000-0000-4000-8000-000000000020",
        p_event_id: "00000000-0000-4000-8000-000000000030",
        p_standings_eligible: false,
        p_actor_id: "00000000-0000-4000-8000-000000000010",
        p_reason: "Event was entered twice.",
      },
    );
  });

  it("requires an audit reason before changing completed-event eligibility", async () => {
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000030");
    formData.set("standingsEligible", "false");

    await expect(
      changeEventStandingsEligibility({ ok: false, message: "" }, formData),
    ).resolves.toEqual({
      ok: false,
      message: "Choose a valid completed event.",
    });
    expect(supabaseMocks.requireWorkspaceAdminUser).not.toHaveBeenCalled();
    expect(supabaseMocks.createServerClient).not.toHaveBeenCalled();
  });

  it("keeps completion committed when rating work and standings emails fail", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
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
    ratingMocks.processInitialEventRating.mockRejectedValue(
      new Error("rating worker down"),
    );
    supabaseMocks.createServerClient.mockReturnValue({
      rpc,
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
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [{ status: "completed" }, { status: "scheduled" }],
              error: null,
            }),
          })),
        };
      }),
    });
    const formData = new FormData();
    formData.set("eventId", "00000000-0000-4000-8000-000000000099");

    const result = await completeEvent({ ok: false, message: "" }, formData);

    expect(result.ok).toBe(true);
    expect(result.message).toContain(
      "Tournament completed. Every unfinished match was cancelled.",
    );
    expect(result.message).toContain(
      "Rating updates are queued and will retry separately.",
    );
    expect(result.message).toContain(
      "Final standings emails could not be processed: provider down",
    );
    expect(rpc).toHaveBeenCalledWith("complete_live_event", {
      p_workspace_id: "workspace-1",
      p_event_id: "00000000-0000-4000-8000-000000000099",
    });
    expect(emailMocks.deliverFinalStandingsEmails).toHaveBeenCalledWith({
      client: expect.any(Object),
      workspaceId: "workspace-1",
      eventId: "00000000-0000-4000-8000-000000000099",
    });
    expect(ratingMocks.processInitialEventRating).toHaveBeenCalledWith({
      client: expect.any(Object),
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

  it("reshuffles a fully scheduled random draw through the guarded RPC", async () => {
    const eventId = "00000000-0000-4000-8000-000000000030";
    const workspaceId = "00000000-0000-4000-8000-000000000020";
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const snapshots = Array.from({ length: 4 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      player_id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name_snapshot: `Player ${index + 1}`,
      rating_snapshot: index + 4,
      app_user_id_snapshot: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      rating_mu_snapshot: 20 + index,
      rating_sigma_snapshot: 12.5,
      displayed_level_snapshot: index + 4,
      rating_engine_version_snapshot: "openskill-bradley-terry-full-v1",
      display_order: index,
    }));
    supabaseMocks.requireWorkspaceAdminUser.mockResolvedValue({
      id: "owner-user",
      activeWorkspaceId: workspaceId,
      activeWorkspaceRole: "owner",
    });
    supabaseMocks.createServerClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            table === "events"
              ? {
                  eq: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: eventId,
                        workspace_id: workspaceId,
                        status: "scheduled",
                        starts_at: "2030-07-30T10:00:00.000Z",
                        draw_strategy: "random",
                        seed: 41,
                        round_minutes: 20,
                        break_minutes: 3,
                      },
                      error: null,
                    }),
                  })),
                }
              : {
                  order: vi.fn().mockResolvedValue(
                    table === "event_players"
                      ? { data: snapshots, error: null }
                      : {
                          data: [
                            {
                              round_number: 1,
                              matches: [
                                { court_number: 1, status: "scheduled" },
                              ],
                            },
                          ],
                          error: null,
                        },
                  ),
                },
          ),
        })),
      })),
    });
    const formData = new FormData();
    formData.set("eventId", eventId);
    formData.set("expectedSeed", "41");

    const result = await reshuffleRandomDraw(
      { ok: false, message: "" },
      formData,
    );

    expect(result).toEqual({
      ok: true,
      message: "Random draw reshuffled with a fresh seed.",
      drawSeed: expect.any(Number),
    });
    expect(rpc).toHaveBeenCalledWith(
      "replace_scheduled_event_draw",
      expect.objectContaining({
        p_event_id: eventId,
        p_expected_seed: 41,
        p_expected_draw_strategy: "random",
        p_draw_strategy: "random",
      }),
    );
    expect(rpc.mock.calls[0][1].p_seed).not.toBe(41);
    expect(result.drawSeed).toBe(rpc.mock.calls[0][1].p_seed);
  });
});
