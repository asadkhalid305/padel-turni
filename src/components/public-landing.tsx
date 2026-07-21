import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  CircleGauge,
  Clock3,
  History,
  Link2,
  LockKeyhole,
  Medal,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { after } from "next/server";

import { signInWithGoogle } from "@/app/login/actions";
import { BrandLogo } from "@/components/brand-logo";
import { FormPendingOverlay } from "@/components/form-pending-overlay";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { recordAnonymousLandingView } from "@/lib/product-analytics";
import { createPublicRequestKey } from "@/lib/public-request-protection";
import { createServerClient } from "@/lib/supabase/server";

const featureGroups = [
  {
    title: "Private clubs",
    description:
      "Create one club for each group, invite members with private links, and keep every roster and event separated.",
    icon: UsersRound,
    accent: "from-emerald-300 to-lime-200",
    items: ["Club roles", "Invite links", "Member-only data"],
  },
  {
    title: "Automatic fair draws",
    description:
      "Select players, ratings, courts, round length, breaks, and court availability. Padel Turni builds the rotation.",
    icon: Sparkles,
    accent: "from-lime-200 to-cyan-200",
    items: ["Ratings aware", "Court settings", "Repeatable draws"],
  },
  {
    title: "Match-day control",
    description:
      "Run the event from a phone, start timers, use sound alerts, enter scores, and keep rounds moving.",
    icon: Clock3,
    accent: "from-cyan-200 to-emerald-200",
    items: ["Live timers", "Mobile scoring", "Sound alerts"],
  },
  {
    title: "Results that stay useful",
    description:
      "Completed matches drive standings, event history, career stats, and final standings emails.",
    icon: Trophy,
    accent: "from-amber-200 to-lime-200",
    items: ["Standings", "History", "Career board"],
  },
];

const painPoints = [
  ["Before", "Teams reshuffled manually in chat or notes."],
  ["During", "Someone has to remember every court, timer, and result."],
  ["After", "Scores disappear and standings become a debate."],
];

const matchDaySteps = [
  "Add players and ratings",
  "Choose courts and round timing",
  "Generate a fair draw",
  "Run timers and enter scores",
  "Complete the event and keep the history",
];

export async function PublicLanding() {
  const eventClient = createServerClient();
  if (eventClient) {
    const keyHash = await createPublicRequestKey("landing_view");
    after(async () => {
      await recordAnonymousLandingView(eventClient, keyHash);
    });
  }

  return (
    <main className="h-dvh overflow-y-auto bg-[#f7f6ef] text-[var(--ink)]">
      <section className="court-lines relative overflow-hidden bg-[var(--ink)] text-white">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_82%_12%,rgba(184,237,97,0.22),transparent_28rem)]"
        />
        <div className="relative mx-auto max-w-7xl px-5 pb-24 pt-5 sm:px-7 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="Padel Turni home">
              <BrandLogo tagline />
            </Link>
            <nav className="hidden items-center gap-8 text-sm font-bold text-white/62 md:flex">
              <Link href="#features" className="hover:text-white">
                Features
              </Link>
              <Link href="#match-day" className="hover:text-white">
                Match day
              </Link>
              <Link href="#mobile" className="hover:text-white">
                Mobile
              </Link>
              <Link href="#trust" className="hover:text-white">
                Trust
              </Link>
            </nav>
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 text-sm font-black text-white shadow-[0_0_28px_rgba(184,237,97,0.18)] backdrop-blur transition hover:bg-white hover:text-[var(--ink)]"
            >
              Sign in
            </Link>
          </header>

          <div className="grid gap-16 py-16 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:py-24">
            <div>
              <span className="inline-flex rounded-full border border-[var(--lime)]/30 bg-[var(--lime)]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--lime)] shadow-[0_0_32px_rgba(184,237,97,0.16)]">
                Padel Turni - Free tournament organizer
              </span>
              <h1 className="mt-8 max-w-4xl text-5xl font-black leading-[0.95] sm:text-7xl lg:text-8xl">
                Run fair padel tournaments from your browser.
              </h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-white/70 sm:text-xl">
                Padel Turni is a free web app for clubs and casual groups to
                create fair draws, run live matches from a browser, and keep
                clear standings after the final whistle.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <form action={signInWithGoogle}>
                  <input type="hidden" name="next" value="/" />
                  <PendingSubmitButton
                    className="min-h-13 w-full rounded-full bg-[var(--lime)] px-6 text-sm font-black text-[var(--ink)] shadow-[0_0_40px_rgba(184,237,97,0.28)] hover:bg-[#c9f66d] sm:w-auto"
                    pendingLabel="Opening Google..."
                  >
                    Start free with Google
                    <ArrowRight size={18} />
                  </PendingSubmitButton>
                  <FormPendingOverlay label="Opening Google..." />
                </form>
                <Link
                  href="#features"
                  className="inline-flex min-h-13 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-black text-white transition hover:bg-white/10"
                >
                  See how it helps
                </Link>
              </div>
            </div>

            <HeroStoryPanel />
          </div>
        </div>
      </section>

      <section className="relative -mt-14 px-5 sm:px-7 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-4 rounded-[1.6rem] border border-white/80 bg-white/90 p-5 shadow-[0_24px_70px_rgba(16,47,39,0.14)] backdrop-blur md:grid-cols-3">
          {painPoints.map(([phase, text]) => (
            <div key={phase} className="rounded-[1.1rem] bg-emerald-50/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--green)]">
                {phase}
              </p>
              <p className="mt-3 text-lg font-black leading-7 text-[var(--ink)]">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="features"
        className="mx-auto max-w-7xl px-5 py-28 sm:px-7 lg:px-10"
      >
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--green)]">
              The full event flow
            </p>
            <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
              Less explaining, less balancing, fewer mistakes.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-slate-600 lg:justify-self-end">
            The product is not for managing software. It is for getting players
            onto courts with fair teams, clear timing, and results everyone can
            understand after the last match.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {featureGroups.map((feature) => (
            <GradientCard key={feature.title} accent={feature.accent}>
              <feature.icon className="text-[var(--green)]" size={27} />
              <h3 className="mt-6 text-2xl font-black">{feature.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {feature.description}
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {feature.items.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-black text-emerald-800 shadow-[0_0_18px_rgba(32,122,91,0.08)]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </GradientCard>
          ))}
        </div>
      </section>

      <section
        id="match-day"
        className="bg-[linear-gradient(135deg,#102f27_0%,#164638_52%,#0d261f_100%)] text-white"
      >
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-28 sm:px-7 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--lime)]">
              Match day
            </p>
            <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
              From arrival to final standings in one calm flow.
            </h2>
            <p className="mt-6 text-base leading-8 text-white/68">
              Create the event before people arrive, then use the same page to
              follow rounds, start timers, record scores, and complete the
              tournament without rebuilding anything by hand.
            </p>
          </div>

          <div className="rounded-[1.6rem] border border-white/15 bg-white/8 p-4 shadow-[0_0_70px_rgba(184,237,97,0.12)] backdrop-blur">
            <div className="grid gap-3">
              {matchDaySteps.map((step, index) => (
                <div
                  key={step}
                  className="grid gap-4 rounded-[1rem] border border-white/10 bg-white p-4 text-[var(--ink)] shadow-sm sm:grid-cols-[3rem_1fr_auto] sm:items-center"
                >
                  <span className="grid size-11 place-items-center rounded-full bg-[var(--ink)] text-sm font-black text-[var(--lime)]">
                    {index + 1}
                  </span>
                  <p className="text-lg font-black">{step}</p>
                  <CheckCircle2 className="text-[var(--green)]" size={22} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="mobile"
        className="mx-auto grid max-w-7xl gap-16 px-5 py-28 sm:px-7 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:px-10"
      >
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--green)]">
            Built for the club floor
          </p>
          <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
            No laptop at the court. No spreadsheet on the bench.
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600">
            Padel Turni works from a mobile browser, so the organizer can handle
            late arrivals, timers, score entry, and event completion from the
            side of the court.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              [Smartphone, "Responsive screens"],
              [BellRing, "Sound alerts"],
              [History, "History after play"],
            ].map(([Icon, title]) => (
              <GradientCard
                key={title as string}
                accent="from-white to-emerald-100"
              >
                <Icon className="text-[var(--green)]" size={24} />
                <p className="mt-4 text-sm font-black">{title as string}</p>
              </GradientCard>
            ))}
          </div>
        </div>
        <MobileStoryPanel />
      </section>

      <section id="trust" className="border-y border-emerald-950/10 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-24 sm:px-7 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--green)]">
              Private by club
            </p>
            <h2 className="mt-4 text-4xl font-black leading-tight">
              Invite the right people into the right place.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Every club has its own roster, members, events, history, and
              permissions. Players only see what belongs to clubs they joined.
            </p>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Google sign-in is used only to create and access your Padel Turni
              account. We receive your Google account ID, name, and email
              address, but not your password, contacts, Drive files, or other
              Google data. Read the full details in our{" "}
              <Link
                href="/privacy"
                className="font-bold text-[var(--green)] underline decoration-emerald-300 underline-offset-4"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [LockKeyhole, "Club-scoped data"],
              [Link2, "Secure invite links"],
              [ShieldCheck, "Role-based editing"],
            ].map(([Icon, label]) => (
              <GradientCard
                key={label as string}
                accent="from-lime-100 to-cyan-100"
              >
                <Icon className="text-[var(--green)]" size={24} />
                <span className="mt-4 block text-sm font-black">
                  {label as string}
                </span>
              </GradientCard>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--ink)] px-5 py-20 text-white sm:px-7 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 rounded-[1.8rem] border border-white/10 bg-white/6 p-8 shadow-[0_0_80px_rgba(184,237,97,0.12)] sm:p-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-black sm:text-4xl">
              Ready to stop managing padel nights by hand?
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
              Start with a private club, add a few players, and create the first
              fair draw.
            </p>
          </div>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value="/" />
            <PendingSubmitButton
              className="min-h-13 w-full rounded-full bg-[var(--lime)] px-6 text-sm font-black text-[var(--ink)] shadow-[0_0_40px_rgba(184,237,97,0.25)] hover:bg-[#c9f66d] sm:w-auto"
              pendingLabel="Opening Google..."
            >
              Try Padel Turni
              <ArrowRight size={18} />
            </PendingSubmitButton>
            <FormPendingOverlay label="Opening Google..." />
          </form>
        </div>
      </section>

      <footer className="bg-[#0d261f] px-5 py-8 text-white/60 sm:px-7 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm font-bold sm:flex-row sm:items-center sm:justify-between">
          <BrandLogo tagline />
          <div className="flex flex-wrap gap-4">
            <Link href="/support" className="hover:text-white">
              Contact
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/imprint" className="hover:text-white">
              Imprint
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/login" className="hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function GradientCard({
  accent,
  children,
}: {
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-[1.2rem] bg-gradient-to-br ${accent} p-[1px]`}>
      <div className="h-full rounded-[1.15rem] bg-white/92 p-6 shadow-[0_18px_55px_rgba(16,47,39,0.08)] backdrop-blur">
        {children}
      </div>
    </div>
  );
}

function HeroStoryPanel() {
  return (
    <div className="rounded-[2rem] border border-white/15 bg-white/8 p-4 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="rounded-[1.6rem] border border-white/70 bg-[var(--sand)] p-5 text-[var(--ink)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--green)]">
              Product flow
            </p>
            <h2 className="mt-2 text-2xl font-black">From roster to results</h2>
          </div>
          <span className="rounded-full bg-[var(--lime)] px-3 py-1 text-xs font-black text-[var(--ink)]">
            Fair draw
          </span>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            [UsersRound, "Roster", "Who is playing and how strong are they?"],
            [CircleGauge, "Courts", "How many courts and how long per round?"],
            [Sparkles, "Draw", "Which balanced teams play next?"],
            [Medal, "Table", "Who is leading after completed matches?"],
          ].map(([Icon, title, body]) => (
            <div
              key={title as string}
              className="rounded-[1rem] border border-emerald-100 bg-white p-5 shadow-sm"
            >
              <Icon className="text-[var(--green)]" size={23} />
              <p className="mt-5 text-xl font-black">{title as string}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {body as string}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileStoryPanel() {
  return (
    <div className="mx-auto w-full max-w-[22rem] rounded-[2.4rem] bg-gradient-to-br from-emerald-900 via-[var(--ink)] to-lime-300 p-[1px] shadow-[0_28px_80px_rgba(16,47,39,0.22)]">
      <div className="rounded-[2.35rem] bg-[var(--ink)] p-4">
        <div className="rounded-[1.8rem] bg-[#f4f2e9] p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--green)]">
              Court side
            </p>
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-700">
              Live
            </span>
          </div>
          <p className="mt-6 text-5xl font-black">12:48</p>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Timer, scores, next round, and standings stay close to the
            organizer.
          </p>
          <div className="mt-7 space-y-3">
            {["Start timer", "Enter score", "Open standings"].map((action) => (
              <div
                key={action}
                className="flex min-h-12 items-center justify-between rounded-xl bg-white px-4 text-sm font-black shadow-sm"
              >
                {action}
                <ArrowRight className="text-[var(--green)]" size={16} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
