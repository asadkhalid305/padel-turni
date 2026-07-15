import { Chrome } from "lucide-react";
import Link from "next/link";

import { signInWithGoogle } from "@/app/login/actions";
import { BrandLogo } from "@/components/brand-logo";
import { FormPendingOverlay } from "@/components/form-pending-overlay";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatLoginErrorMessage } from "@/lib/login-errors";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next = "/" } = await searchParams;
  const errorMessage = formatLoginErrorMessage(error);

  return (
    <div className="court-lines grid h-dvh place-items-center overflow-y-auto bg-[var(--ink)] px-5 py-10">
      <main className="w-full max-w-md rounded-[2rem] border border-white/70 bg-[var(--sand)] p-7 shadow-2xl shadow-black/25 sm:p-10">
        {errorMessage ? (
          <div
            className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}
        <BrandLogo
          className="text-[var(--ink)]"
          markClassName="size-14"
          tagline
        />
        <p className="mt-10 text-xs font-black uppercase tracking-[0.18em] text-[var(--green)]">
          Welcome to the court
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] text-[var(--ink)]">
          Run every event with confidence.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Fair rotations, live scoring, and standings in one calm command
          center.
        </p>
        <form action={signInWithGoogle} className="mt-8">
          <input type="hidden" name="next" value={next} />
          <PendingSubmitButton
            className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-[var(--ink)] px-5 text-sm font-black text-white shadow-lg shadow-emerald-950/15 transition hover:bg-[#173d31]"
            pendingLabel="Opening Google..."
          >
            <Chrome size={18} />
            Continue with Google
          </PendingSubmitButton>
          <FormPendingOverlay label="Opening Google..." />
        </form>
        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-500">
          <Link href="/" className="hover:text-[var(--green)]">
            Product
          </Link>
          <Link href="/contact" className="hover:text-[var(--green)]">
            Contact
          </Link>
          <Link href="/privacy" className="hover:text-[var(--green)]">
            Privacy
          </Link>
          <Link href="/imprint" className="hover:text-[var(--green)]">
            Imprint
          </Link>
          <Link href="/terms" className="hover:text-[var(--green)]">
            Terms
          </Link>
        </div>
      </main>
    </div>
  );
}
