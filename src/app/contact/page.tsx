import type { Metadata } from "next";

import { FeedbackForm } from "@/components/feedback-form";
import { PublicPageShell } from "@/components/public-page-shell";

export const metadata: Metadata = {
  title: "Contact",
  description: "Send feedback or support requests for Padeltour.",
};

export default function ContactPage() {
  return (
    <PublicPageShell eyebrow="Support and feedback" title="Contact Padeltour">
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-2xl border border-emerald-950/10 bg-white/72 p-5">
          <h2 className="text-lg font-black">What to send here</h2>
          <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
            <p>
              Use this form for invite problems, account questions, privacy or
              deletion requests, onboarding friction, tournament issues, or
              feature feedback.
            </p>
            <p>
              If you want a reply, include your email address. Messages are
              stored for follow-up and product learning.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-950/10 bg-white/72 p-5">
          <FeedbackForm />
        </div>
      </div>
    </PublicPageShell>
  );
}
