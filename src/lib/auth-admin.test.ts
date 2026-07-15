import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: supabaseMocks.createServerClient,
  normalizeUserEmail: (email: string) => email.trim().toLowerCase(),
}));

import {
  adminRoleRequestSchema,
  isAdminRoleRequestAuthorized,
  setAppUserRole,
  setAdminRoleForEmail,
} from "@/lib/auth-admin";

describe("admin role management", () => {
  beforeEach(() => {
    supabaseMocks.createServerClient.mockReset();
  });

  it("normalizes email input before role updates", () => {
    const parsed = adminRoleRequestSchema.parse({
      email: "  Organizer@Example.COM ",
    });

    expect(parsed.email).toBe("organizer@example.com");
  });

  it("requires the configured endpoint secret", () => {
    vi.stubEnv("ADMIN_ROLE_API_SECRET", "secret-value");

    expect(
      isAdminRoleRequestAuthorized(
        new Request("http://localhost/api/admin/users/grant", {
          headers: { "x-admin-role-secret": "secret-value" },
        }),
      ),
    ).toBe(true);
    expect(
      isAdminRoleRequestAuthorized(
        new Request("http://localhost/api/admin/users/grant", {
          headers: { "x-admin-role-secret": "wrong-value" },
        }),
      ),
    ).toBe(false);

    vi.unstubAllEnvs();
  });

  it("refuses to demote the last super admin account", async () => {
    const update = vi.fn();
    mockAppUsersClient({
      users: [
        {
          id: "user-1",
          email: "owner@example.com",
          role: "super_admin",
        },
      ],
      update,
    });

    const result = await setAdminRoleForEmail("owner@example.com", false);

    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "At least one super admin account must remain.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("allows one super admin to demote another super admin", async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "user-1",
              email: "organizer@example.com",
              role: "admin",
            },
            error: null,
          }),
        })),
      })),
    }));
    mockAppUsersClient({
      users: [
        {
          id: "user-1",
          email: "organizer@example.com",
          role: "super_admin",
        },
        {
          id: "user-2",
          email: "owner@example.com",
          role: "super_admin",
        },
      ],
      update,
    });

    const result = await setAppUserRole("user-1", "admin");

    expect(update).toHaveBeenCalledWith({ role: "admin" });
    expect(result).toEqual({
      ok: true,
      user: {
        id: "user-1",
        email: "organizer@example.com",
        role: "admin",
      },
    });
  });

  it("updates a member account to admin", async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "user-2",
              email: "organizer@example.com",
              role: "admin",
            },
            error: null,
          }),
        })),
      })),
    }));
    mockAppUsersClient({
      users: [
        {
          id: "user-2",
          email: "organizer@example.com",
          role: "member",
        },
      ],
      update,
    });

    const result = await setAdminRoleForEmail("Organizer@Example.COM", true);

    expect(update).toHaveBeenCalledWith({ role: "admin" });
    expect(result).toEqual({
      ok: true,
      user: {
        id: "user-2",
        email: "organizer@example.com",
        role: "admin",
      },
    });
  });
});

function mockAppUsersClient({
  users,
  update = vi.fn(),
}: {
  users: { id: string; email: string; role: string }[];
  update?: ReturnType<typeof vi.fn>;
}) {
  const findByField = (field: string, value: string) =>
    users.find(
      (user) => user[field as keyof (typeof users)[number]] === value,
    ) ?? null;

  supabaseMocks.createServerClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn((_columns: string, options?: { count?: "exact" }) => ({
        eq: vi.fn((field: string, value: string) => {
          if (options?.count === "exact") {
            return {
              neq: vi.fn((_neqField: string, neqValue: string) =>
                Promise.resolve({
                  count: users.filter(
                    (user) => user.role === value && user.id !== neqValue,
                  ).length,
                  error: null,
                }),
              ),
            };
          }

          return {
            maybeSingle: vi.fn().mockResolvedValue({
              data: findByField(field, value),
              error: null,
            }),
          };
        }),
      })),
      update,
    })),
  });
}
