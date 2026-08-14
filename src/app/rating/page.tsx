import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { RatingQuestionnaire } from "@/components/rating-questionnaire";
import { Card } from "@/components/ui";
import { QUESTIONNAIRE_RESULT_COPY } from "@/features/rating-questionnaire/config";
import {
  answersFromRatingProfile,
  getRatingQuestionnaireProfile,
} from "@/lib/rating-questionnaire";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const metadata = { title: "Your rating" };
export const dynamic = "force-dynamic";

export default async function RatingQuestionnairePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?next=/rating");

  const profile = await getRatingQuestionnaireProfile(user.id);
  const isCompleted = profile?.onboarding_status === "completed";
  const isLocked = Boolean(isCompleted && profile.rated_match_count > 0);

  return (
    <div className="court-lines min-h-dvh overflow-y-auto bg-[var(--ink)] px-4 py-8 sm:px-6 sm:py-12">
      <main className="mx-auto w-full max-w-2xl">
        <Link href="/" aria-label="Padel Turni home">
          <BrandLogo className="text-white" tagline />
        </Link>
        <div className="mt-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--lime)]">
            Fair first matches
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Tell us how you play.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/70 sm:text-base">
            Three quick answers create a provisional starting level. You cannot
            type or choose the number directly.
          </p>
        </div>

        <div className="mt-7">
          {isLocked ? (
            <Card className="bg-[var(--sand)] p-6 sm:p-8">
              <span className="grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                <LockKeyhole size={23} />
              </span>
              <h2 className="mt-4 text-2xl font-black text-[var(--ink)]">
                Your level now comes from results
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {QUESTIONNAIRE_RESULT_COPY.locked}
              </p>
              <p className="mt-5 text-4xl font-black text-[var(--green)]">
                {profile?.initial_displayed_level?.toFixed(1)}
              </p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Questionnaire starting level
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--ink)] px-5 text-sm font-black text-white"
              >
                Continue to Padel Turni
              </Link>
            </Card>
          ) : (
            <RatingQuestionnaire
              initialAnswers={answersFromRatingProfile(profile)}
              initiallyCompleted={isCompleted}
            />
          )}
        </div>
      </main>
    </div>
  );
}
