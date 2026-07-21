import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

const supabaseMocks = vi.hoisted(() => ({
  createAuthClient: vi.fn(),
  createServerClient: vi.fn(),
  isSupabaseAuthConfigured: vi.fn(),
}));

const analyticsMocks = vi.hoisted(() => ({
  recordProductEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAuthClient: supabaseMocks.createAuthClient,
  createServerClient: supabaseMocks.createServerClient,
  isSupabaseAuthConfigured: supabaseMocks.isSupabaseAuthConfigured,
}));

vi.mock("@/lib/product-analytics", () => ({
  recordProductEvent: analyticsMocks.recordProductEvent,
}));

vi.mock("@/lib/request-origin", () => ({
  requestOrigin: vi.fn().mockResolvedValue("https://padelturni.example"),
}));

import { signInWithGoogle } from "@/app/login/actions";

describe("Google sign-in analytics", () => {
  const signInWithOAuth = vi.fn();

  beforeEach(() => {
    navigationMocks.redirect.mockClear();
    supabaseMocks.createAuthClient.mockReset();
    supabaseMocks.createServerClient.mockReset();
    supabaseMocks.isSupabaseAuthConfigured.mockReset();
    analyticsMocks.recordProductEvent.mockReset();
    signInWithOAuth.mockReset();

    supabaseMocks.isSupabaseAuthConfigured.mockReturnValue(true);
    supabaseMocks.createAuthClient.mockResolvedValue({
      auth: { signInWithOAuth },
    });
    supabaseMocks.createServerClient.mockReturnValue({});
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.test/oauth" },
      error: null,
    });
  });

  it("records an invite category without storing the invite token", async () => {
    const formData = new FormData();
    formData.set("next", "/invites/raw-secret-token?workspace=club");

    await expect(signInWithGoogle(formData)).rejects.toThrow(
      "redirect:https://accounts.google.test/oauth",
    );

    expect(analyticsMocks.recordProductEvent).toHaveBeenCalledWith({
      client: {},
      eventType: "sign_in_started",
      metadata: { destination: "invite" },
    });
    expect(
      JSON.stringify(analyticsMocks.recordProductEvent.mock.calls),
    ).not.toContain("raw-secret-token");
  });

  it("records home sign-ins as a coarse destination", async () => {
    const formData = new FormData();
    formData.set("next", "/");

    await expect(signInWithGoogle(formData)).rejects.toThrow(
      "redirect:https://accounts.google.test/oauth",
    );

    expect(analyticsMocks.recordProductEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { destination: "home" } }),
    );
  });
});
