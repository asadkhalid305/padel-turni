import { describe, expect, it, vi } from "vitest";

import { isWorkspaceAdminRole } from "@/lib/roles";
import {
  ensureDefaultWorkspaceForUser,
  ensureWorkspaceMemberPlayer,
  listUserWorkspaceMemberships,
} from "@/lib/workspaces";

type MockWorkspaceClient = {
  insertWorkspace: ReturnType<typeof vi.fn>;
  insertMembership: ReturnType<typeof vi.fn>;
  insertPlayer: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
};

describe("workspace foundations", () => {
  it("treats owner and workspace admin as product admins", () => {
    expect(isWorkspaceAdminRole("owner")).toBe(true);
    expect(isWorkspaceAdminRole("admin")).toBe(true);
    expect(isWorkspaceAdminRole("member")).toBe(false);
  });

  it("reuses the first existing membership as the active workspace", async () => {
    const client = mockWorkspaceClient({
      existingMembership: { workspace_id: "workspace-1", role: "admin" },
    });

    await expect(
      ensureDefaultWorkspaceForUser(client as never, {
        id: "user-1",
        email: "owner@example.com",
        displayName: "Owner",
      }),
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      role: "admin",
    });

    expect(client.insertWorkspace).not.toHaveBeenCalled();
    expect(client.insertMembership).not.toHaveBeenCalled();
  });

  it("prefers a valid active workspace membership from the cookie", async () => {
    const client = mockWorkspaceClient({
      preferredMembership: { workspace_id: "workspace-2", role: "member" },
      existingMembership: { workspace_id: "workspace-1", role: "owner" },
    });

    await expect(
      ensureDefaultWorkspaceForUser(
        client as never,
        {
          id: "user-1",
          email: "owner@example.com",
          displayName: "Owner",
        },
        "workspace-2",
      ),
    ).resolves.toEqual({
      workspaceId: "workspace-2",
      role: "member",
    });

    expect(client.insertWorkspace).not.toHaveBeenCalled();
    expect(client.insertMembership).not.toHaveBeenCalled();
  });

  it("ignores a stale active workspace cookie when the user is not a member", async () => {
    const client = mockWorkspaceClient({
      existingMembership: { workspace_id: "workspace-1", role: "owner" },
    });

    await expect(
      ensureDefaultWorkspaceForUser(
        client as never,
        {
          id: "user-1",
          email: "owner@example.com",
          displayName: "Owner",
        },
        "workspace-2",
      ),
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      role: "owner",
    });
  });

  it("creates a private default workspace owned by a new signed-in user", async () => {
    const client = mockWorkspaceClient();

    await expect(
      ensureDefaultWorkspaceForUser(client as never, {
        id: "user-1",
        email: "owner@example.com",
        displayName: "Owner",
      }),
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      role: "owner",
    });

    expect(client.insertWorkspace).toHaveBeenCalledWith({
      name: "Owner's club",
      personal_owner_app_user_id: "user-1",
    });
    expect(client.insertMembership).toHaveBeenCalledWith({
      workspace_id: "workspace-1",
      app_user_id: "user-1",
      role: "owner",
    });
    expect(client.insertPlayer).toHaveBeenCalledWith({
      workspace_id: "workspace-1",
      name: "Owner",
      account_email: "owner@example.com",
      app_user_id: "user-1",
      rating: 5,
      is_active: true,
    });
  });

  it("adopts a mapped ownerless seeded workspace with a generic fixture email", async () => {
    vi.stubEnv(
      "PADELTOUR_SEEDED_PERSONAL_WORKSPACES",
      "real-owner@example.com:seed-workspace",
    );
    const updateWorkspace = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const updatePlayer = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }));
    const insertMembership = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { workspace_id: "seed-workspace", role: "owner" },
          error: null,
        }),
      })),
    }));
    const insertPlayer = vi.fn().mockResolvedValue({ error: null });
    const selectPlayer = vi.fn((columns: string) => {
      if (columns === "workspace_id") {
        return {
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (columns === "id,name,account_email") {
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            })),
          })),
        };
      }
      if (columns === "id") {
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            })),
          })),
        };
      }

      throw new Error(`Unexpected player selection: ${columns}`);
    });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "workspace_memberships") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                })),
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  })),
                })),
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                })),
              })),
            })),
            insert: insertMembership,
          };
        }
        if (table === "players") {
          return {
            select: selectPlayer,
            update: updatePlayer,
            insert: insertPlayer,
          };
        }
        if (table === "workspaces") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "seed-workspace",
                    personal_owner_app_user_id: null,
                  },
                  error: null,
                }),
              })),
            })),
            update: updateWorkspace,
          };
        }

        return {
          insert: vi.fn(),
        };
      }),
    };

    await expect(
      ensureDefaultWorkspaceForUser(client as never, {
        id: "user-1",
        email: "real-owner@example.com",
        displayName: "Owner",
      }),
    ).resolves.toEqual({
      workspaceId: "seed-workspace",
      role: "owner",
    });

    expect(updateWorkspace).toHaveBeenCalledWith({
      name: "Owner's club",
      personal_owner_app_user_id: "user-1",
    });
    expect(insertMembership).toHaveBeenCalledWith({
      workspace_id: "seed-workspace",
      app_user_id: "user-1",
      role: "owner",
    });
    expect(
      selectPlayer.mock.calls.filter(([columns]) => columns === "workspace_id"),
    ).toHaveLength(1);
    expect(updatePlayer).not.toHaveBeenCalled();
    expect(insertPlayer).toHaveBeenCalledWith({
      workspace_id: "seed-workspace",
      name: "Owner",
      account_email: "real-owner@example.com",
      app_user_id: "user-1",
      rating: 5,
      is_active: true,
    });
    vi.unstubAllEnvs();
  });

  it("keeps the private workspace active while adding linked club memberships", async () => {
    const upsertMembership = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "workspace_memberships") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      workspace_id: "projects-private-workspace",
                      role: "owner",
                    },
                    error: null,
                  }),
                })),
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        workspace_id: "projects-private-workspace",
                        role: "owner",
                      },
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
            upsert: upsertMembership,
          };
        }
        if (table === "players") {
          return {
            select: vi.fn((columns: string) => {
              if (columns === "workspace_id") {
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      { workspace_id: "projects-private-workspace" },
                      { workspace_id: "seed-workspace" },
                    ],
                    error: null,
                  }),
                };
              }
              if (columns === "id,name,account_email") {
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          id: "project-private-player",
                          name: "Projects Owner",
                          account_email: "projects@example.com",
                        },
                        error: null,
                      }),
                    })),
                  })),
                };
              }

              return {
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              };
            }),
          };
        }
        if (table === "workspaces") {
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "seed-workspace",
                    personal_owner_app_user_id: "owner-user",
                  },
                ],
                error: null,
              }),
            })),
          };
        }

        return {
          insert: vi.fn(),
        };
      }),
    };

    await expect(
      ensureDefaultWorkspaceForUser(client as never, {
        id: "project-user",
        email: "projects@example.com",
        displayName: "Projects Owner",
      }),
    ).resolves.toEqual({
      workspaceId: "projects-private-workspace",
      role: "owner",
    });

    expect(upsertMembership).toHaveBeenCalledWith(
      [
        {
          workspace_id: "seed-workspace",
          app_user_id: "project-user",
          role: "member",
        },
      ],
      {
        onConflict: "workspace_id,app_user_id",
        ignoreDuplicates: true,
      },
    );
  });

  it("repairs an accidental member membership when the seed owner claims the workspace", async () => {
    const updateWorkspace = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const updateMembership = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { workspace_id: "seed-workspace", role: "owner" },
              error: null,
            }),
          })),
        })),
      })),
    }));
    const updatePlayer = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "workspace_memberships") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      workspace_id: "seed-workspace",
                      role: "member",
                    },
                    error: null,
                  }),
                })),
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        workspace_id: "seed-workspace",
                        role: "member",
                      },
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
            update: updateMembership,
          };
        }
        if (table === "workspaces") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "seed-workspace",
                    personal_owner_app_user_id: null,
                  },
                  error: null,
                }),
              })),
            })),
            update: updateWorkspace,
          };
        }
        if (table === "players") {
          return {
            select: vi.fn((columns: string) => {
              if (columns === "workspace_id") {
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: { workspace_id: "seed-workspace" },
                          error: null,
                        }),
                      })),
                    })),
                  })),
                };
              }
              if (columns === "id,name,account_email") {
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: null,
                        error: null,
                      }),
                    })),
                  })),
                };
              }
              if (columns === "id") {
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: "seed-owner-player" },
                        error: null,
                      }),
                    })),
                  })),
                };
              }

              return {
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              };
            }),
            update: updatePlayer,
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }

        return {
          insert: vi.fn(),
        };
      }),
    };

    await expect(
      ensureDefaultWorkspaceForUser(client as never, {
        id: "owner-user",
        email: "owner@example.com",
        displayName: "Asad",
      }),
    ).resolves.toEqual({
      workspaceId: "seed-workspace",
      role: "owner",
    });

    expect(updateWorkspace).toHaveBeenCalledWith({
      name: "Asad's club",
      personal_owner_app_user_id: "owner-user",
    });
    expect(updateMembership).toHaveBeenCalledWith({ role: "owner" });
    expect(updatePlayer).toHaveBeenCalledWith({
      name: "Asad",
      account_email: "owner@example.com",
      app_user_id: "owner-user",
    });
  });

  it("lists the user's workspace memberships with display names", async () => {
    const membershipUserFilter = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [
          { workspace_id: "workspace-1", role: "owner" },
          { workspace_id: "workspace-2", role: "member" },
        ],
        error: null,
      }),
    }));
    const workspaceIdFilter = vi.fn().mockResolvedValue({
      data: [
        { id: "workspace-2", name: "Thursday group" },
        { id: "workspace-1", name: "Owner's workspace" },
      ],
      error: null,
    });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "workspace_memberships") {
          return {
            select: vi.fn(() => ({
              eq: membershipUserFilter,
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            in: workspaceIdFilter,
          })),
        };
      }),
    };

    await expect(
      listUserWorkspaceMemberships(client as never, "user-1"),
    ).resolves.toEqual([
      { workspaceId: "workspace-1", name: "Owner's club", role: "owner" },
      { workspaceId: "workspace-2", name: "Thursday group", role: "member" },
    ]);
    expect(membershipUserFilter).toHaveBeenCalledWith("app_user_id", "user-1");
    expect(workspaceIdFilter).toHaveBeenCalledWith("id", [
      "workspace-1",
      "workspace-2",
    ]);
  });

  it("tolerates concurrent linked player creation when the member player exists", async () => {
    const insertPlayer = vi.fn().mockResolvedValue({
      error: { code: "23505", message: "duplicate key value" },
    });
    const conflictPlayerRead = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValue({ data: { id: "player-1" }, error: null });
    const client = {
      from: vi.fn(() => ({
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
                  maybeSingle: conflictPlayerRead,
                })),
              })),
            };
          }

          return {
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }),
        insert: insertPlayer,
      })),
    };

    await expect(
      ensureWorkspaceMemberPlayer(client as never, "workspace-1", {
        id: "user-1",
        email: "member@example.com",
        displayName: "Member",
      }),
    ).resolves.toBeUndefined();
    expect(insertPlayer).toHaveBeenCalled();
    expect(conflictPlayerRead).toHaveBeenCalled();
  });

  it("does not swallow unique conflicts when the member player is missing", async () => {
    const insertPlayer = vi.fn().mockResolvedValue({
      error: { code: "23505", message: "duplicate key value" },
    });
    const client = {
      from: vi.fn(() => ({
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
      })),
    };

    await expect(
      ensureWorkspaceMemberPlayer(client as never, "workspace-1", {
        id: "user-1",
        email: "member@example.com",
        displayName: "Member",
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});

function mockWorkspaceClient(options?: {
  preferredMembership?: {
    workspace_id: string;
    role: "owner" | "admin" | "member";
  };
  existingMembership?: {
    workspace_id: string;
    role: "owner" | "admin" | "member";
  };
}): MockWorkspaceClient {
  const insertWorkspace = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: { id: "workspace-1" },
        error: null,
      }),
    })),
  }));
  const insertMembership = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: { workspace_id: "workspace-1", role: "owner" },
        error: null,
      }),
    })),
  }));
  const insertPlayer = vi.fn().mockResolvedValue({ error: null });

  return {
    insertWorkspace,
    insertMembership,
    insertPlayer,
    from: vi.fn((table: string) => {
      if (table === "workspace_memberships") {
        const selectMembership = vi.fn(() => {
          const secondEq = vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: options?.preferredMembership ?? null,
              error: null,
            }),
          }));
          const firstEq = vi.fn(() => ({
            eq: secondEq,
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: options?.existingMembership ?? null,
                  error: null,
                }),
              })),
            })),
          }));

          return { eq: firstEq };
        });

        return {
          select: selectMembership,
          insert: insertMembership,
        };
      }
      if (table === "players") {
        return {
          select: vi.fn((columns: string) => {
            if (columns === "workspace_id") {
              const finishWorkspaceIdQuery = {
                is: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi
                        .fn()
                        .mockResolvedValue({ data: null, error: null }),
                    })),
                  })),
                })),
              };
              return {
                eq: vi.fn(() => ({
                  ...finishWorkspaceIdQuery,
                  eq: vi.fn(() => finishWorkspaceIdQuery),
                })),
              };
            }
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
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
        update: vi.fn(),
        insert: insertWorkspace,
      };
    }),
  };
}
