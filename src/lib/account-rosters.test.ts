import { describe, expect, it, vi } from "vitest";

import {
  getOrderedEligibleRosterSourcePlayers,
  listEligibleAccountRosterPlayers,
} from "@/lib/account-rosters";

type Row = Record<string, unknown>;

function rosterClient(tables: Record<string, Row[]>) {
  const from = vi.fn((table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return query;
      }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve(
          resolve({
            data: (tables[table] ?? []).filter((row) =>
              filters.every((filter) => filter(row)),
            ),
            error: null,
          }),
        ),
    };
    return query;
  });

  return { client: { from } as never, from };
}

const tables: Record<string, Row[]> = {
  players: [
    {
      id: "player-eligible",
      workspace_id: "club-a",
      name: "Compatibility Name",
      rating: 5,
      is_active: true,
      app_user_id: "account-1",
    },
    {
      id: "player-incomplete",
      workspace_id: "club-a",
      name: "Incomplete",
      rating: 5,
      is_active: true,
      app_user_id: "account-2",
    },
    {
      id: "legacy-player",
      workspace_id: "club-a",
      name: "Legacy",
      rating: 7,
      is_active: true,
      app_user_id: null,
    },
  ],
  app_users: [
    {
      id: "account-1",
      display_name: "Current Account Name",
      email: "ready@example.com",
    },
    {
      id: "account-2",
      display_name: "Incomplete Account",
      email: "incomplete@example.com",
    },
  ],
  workspace_memberships: [
    { workspace_id: "club-a", app_user_id: "account-1" },
    { workspace_id: "club-a", app_user_id: "account-2" },
  ],
  rating_profiles: [
    {
      app_user_id: "account-1",
      onboarding_status: "completed",
      mu: 25,
      sigma: 12.5,
      engine_version: "openskill-bradley-terry-full-v1",
    },
    {
      app_user_id: "account-2",
      onboarding_status: "in_progress",
      mu: null,
      sigma: null,
      engine_version: null,
    },
  ],
};

describe("account roster persistence boundary", () => {
  it("lists only accepted, active, profile-complete account proxies without writing", async () => {
    const { client, from } = rosterClient(tables);

    await expect(
      listEligibleAccountRosterPlayers(client, "club-a"),
    ).resolves.toEqual([
      {
        id: "player-eligible",
        name: "Current Account Name",
        rating: 3.8,
        isActive: true,
        appUserId: "account-1",
      },
    ]);
    expect(from).toHaveBeenCalled();
    expect(from.mock.results.every(({ value }) => !("insert" in value))).toBe(
      true,
    );
  });

  it("rechecks direct server selections instead of trusting UI filtering", async () => {
    const { client } = rosterClient(tables);

    await expect(
      getOrderedEligibleRosterSourcePlayers(client, "club-a", [
        "player-incomplete",
      ]),
    ).rejects.toThrow("accepted the invitation and completed");
    await expect(
      getOrderedEligibleRosterSourcePlayers(client, "club-a", [
        "legacy-player",
      ]),
    ).rejects.toThrow("accepted the invitation and completed");
  });

  it("returns selected accounts in request order using stable account names", async () => {
    const { client } = rosterClient(tables);

    await expect(
      getOrderedEligibleRosterSourcePlayers(client, "club-a", [
        "player-eligible",
      ]),
    ).resolves.toEqual([
      {
        playerId: "player-eligible",
        appUserId: "account-1",
        name: "Current Account Name",
        profile: {
          onboardingStatus: "completed",
          mu: 25,
          sigma: 12.5,
          displayedLevel: 3.8,
          engineVersion: "openskill-bradley-terry-full-v1",
        },
      },
    ]);
  });
});
