import { createBrowserClient } from "@supabase/ssr";
import { createClient, type Session } from "@supabase/supabase-js";
import type { BrowserContext } from "@playwright/test";

import {
  getInitialRatingFromQuestionnaire,
  QUESTIONNAIRE_ANSWER_SCORES,
  type RatingQuestionnaireAnswers,
} from "@/domain/ratings/questionnaire";
import { RATING_ENGINE_ID } from "@/domain/ratings/openskill-bradley-terry-full-v1";

const url = requiredEnvironment("E2E_SUPABASE_URL");
const publishableKey = requiredEnvironment("E2E_SUPABASE_PUBLISHABLE_KEY");
const secretKey = requiredEnvironment("E2E_SUPABASE_SECRET_KEY");
const appOrigin = process.env.E2E_APP_ORIGIN ?? "http://localhost:3100";

const serviceClient = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export type LocalTestUser = Readonly<{
  id: string;
  email: string;
  password: string;
  workspaceId: string;
  displayName: string;
}>;

export async function createLocalTestUser(
  displayName: string,
): Promise<LocalTestUser> {
  const email = `e2e-${crypto.randomUUID()}@padelturni.local`;
  const password = `E2E-${crypto.randomUUID()}`;
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: displayName },
  });
  if (error || !data.user)
    throw error ?? new Error("Could not create E2E user.");

  const { error: appUserError } = await serviceClient.from("app_users").insert({
    id: data.user.id,
    email,
    display_name: displayName,
  });
  if (appUserError) throw appUserError;

  const { data: workspace, error: workspaceError } = await serviceClient
    .from("workspaces")
    .insert({
      name: `${displayName} test workspace`,
      personal_owner_app_user_id: data.user.id,
    })
    .select("id")
    .single();
  if (workspaceError || !workspace) {
    throw workspaceError ?? new Error("Could not create E2E workspace.");
  }

  const { error: membershipError } = await serviceClient
    .from("workspace_memberships")
    .insert({
      workspace_id: workspace.id,
      app_user_id: data.user.id,
      role: "owner",
    });
  if (membershipError) throw membershipError;

  const { error: playerError } = await serviceClient.from("players").insert({
    workspace_id: workspace.id,
    name: displayName,
    app_user_id: data.user.id,
    account_email: email,
    rating: 5,
    is_active: true,
  });
  if (playerError) throw playerError;

  return {
    id: data.user.id,
    email,
    password,
    workspaceId: workspace.id,
    displayName,
  };
}

export async function createLocalTestMember({
  displayName,
  workspaceId,
  completedProfile = false,
}: {
  displayName: string;
  workspaceId: string;
  completedProfile?: boolean;
}): Promise<LocalTestUser> {
  const email = `e2e-${crypto.randomUUID()}@padelturni.local`;
  const password = `E2E-${crypto.randomUUID()}`;
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: displayName },
  });
  if (error || !data.user)
    throw error ?? new Error("Could not create E2E member.");

  const { error: appUserError } = await serviceClient.from("app_users").insert({
    id: data.user.id,
    email,
    display_name: displayName,
  });
  if (appUserError) throw appUserError;

  const { error: membershipError } = await serviceClient
    .from("workspace_memberships")
    .insert({
      workspace_id: workspaceId,
      app_user_id: data.user.id,
      role: "member",
    });
  if (membershipError) throw membershipError;

  const { error: playerError } = await serviceClient.from("players").insert({
    workspace_id: workspaceId,
    name: displayName,
    app_user_id: data.user.id,
    account_email: email,
    rating: 5,
    is_active: true,
  });
  if (playerError) throw playerError;

  const user = { id: data.user.id, email, password, workspaceId, displayName };
  if (completedProfile) await completeRatingProfileFor(user);
  return user;
}

export async function completeRatingProfileFor(
  user: LocalTestUser,
  answers: RatingQuestionnaireAnswers = {
    padelHistory: "developing",
    racketSportBackground: "recreational",
    currentPadelAbility: "intermediate",
  },
) {
  const calculated = getInitialRatingFromQuestionnaire(answers);
  if (!calculated.ok) throw new Error("Invalid E2E questionnaire answers.");
  const rating = calculated.value;
  const { error } = await serviceClient.from("rating_profiles").upsert({
    app_user_id: user.id,
    onboarding_status: "completed",
    padel_experience_answer: answers.padelHistory,
    padel_experience_score:
      QUESTIONNAIRE_ANSWER_SCORES.padelHistory[answers.padelHistory],
    racket_sport_answer: answers.racketSportBackground,
    racket_sport_score:
      QUESTIONNAIRE_ANSWER_SCORES.racketSportBackground[
        answers.racketSportBackground
      ],
    current_ability_answer: answers.currentPadelAbility,
    current_ability_score:
      QUESTIONNAIRE_ANSWER_SCORES.currentPadelAbility[
        answers.currentPadelAbility
      ],
    initial_mu: rating.mu,
    initial_sigma: rating.sigma,
    initial_displayed_level: rating.displayLevel,
    initial_engine_version: RATING_ENGINE_ID,
    mu: rating.mu,
    sigma: rating.sigma,
    is_provisional: true,
    engine_version: RATING_ENGINE_ID,
    questionnaire_completed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteLocalTestUser(user: LocalTestUser) {
  // The application deliberately prevents Auth from silently unlinking a
  // player account. Remove the fixture-owned player before deleting the user.
  const { error: playerError } = await serviceClient
    .from("players")
    .delete()
    .eq("app_user_id", user.id);
  if (playerError) throw playerError;

  const { error: appUserError } = await serviceClient
    .from("app_users")
    .delete()
    .eq("id", user.id);
  if (appUserError) throw appUserError;

  const { error } = await serviceClient.auth.admin.deleteUser(user.id);
  if (error) throw error;
}

export async function deleteLocalTestWorkspaceEvents(workspaceId: string) {
  const { error } = await serviceClient
    .from("events")
    .delete()
    .eq("workspace_id", workspaceId)
    .like("name", "E2E % rating event");
  if (error) throw error;
}

export async function signInAs(context: BrowserContext, user: LocalTestUser) {
  const session = await createPasswordSession(user);
  const cookies = await sessionCookies(session);
  await context.addCookies(
    cookies.map(({ name, value, options }) => ({
      name,
      value,
      url: appOrigin,
      httpOnly: options.httpOnly,
      secure: options.secure,
      sameSite: toPlaywrightSameSite(options.sameSite),
    })),
  );
}

export async function ratingProfileFor(user: LocalTestUser) {
  const { data, error } = await serviceClient
    .from("rating_profiles")
    .select(
      "onboarding_status,initial_displayed_level,initial_mu,initial_sigma,mu,sigma,rated_match_count,is_provisional",
    )
    .eq("app_user_id", user.id)
    .single();
  if (error) throw error;
  return data;
}

async function createPasswordSession(user: LocalTestUser): Promise<Session> {
  const client = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session) {
    throw error ?? new Error("Could not create E2E session.");
  }
  return data.session;
}

async function sessionCookies(session: Session) {
  const cookies: Array<{
    name: string;
    value: string;
    options: {
      path?: string;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: boolean | "lax" | "strict" | "none";
    };
  }> = [];
  const client = createBrowserClient(url, publishableKey, {
    isSingleton: false,
    cookies: {
      getAll: () => [],
      setAll(nextCookies) {
        cookies.push(...nextCookies);
      },
    },
  });
  const { error } = await client.auth.setSession(session);
  if (error) throw error;
  if (!cookies.length)
    throw new Error("Supabase did not create session cookies.");
  return cookies;
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for E2E tests.`);
  return value;
}

function toPlaywrightSameSite(
  value: boolean | "lax" | "strict" | "none" | undefined,
) {
  if (value === "strict") return "Strict" as const;
  if (value === "none") return "None" as const;
  return "Lax" as const;
}
