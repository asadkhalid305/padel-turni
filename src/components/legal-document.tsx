import type { ReactNode } from "react";

import { PublicPageShell } from "@/components/public-page-shell";

export function LegalDocument({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <PublicPageShell eyebrow="Legal information" title={title}>
      <article className="max-w-3xl space-y-10 text-sm leading-7 text-slate-700 sm:text-base sm:leading-8">
        {children}
      </article>
    </PublicPageShell>
  );
}

export function LegalSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section>
      <h2 className="text-xl font-black text-[var(--ink)] sm:text-2xl">
        {title}
      </h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

export const legalLinkClassName =
  "font-bold text-[var(--green)] underline decoration-emerald-300 underline-offset-4 hover:text-emerald-900";
