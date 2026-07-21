import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";

export function PublicPageShell({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <main className="court-lines h-dvh overflow-y-auto bg-[var(--ink)] px-5 py-8 text-white sm:px-7">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="Padel Turni home">
            <BrandLogo markClassName="size-10" />
          </Link>
          <nav className="flex flex-wrap justify-end gap-3 text-sm font-black text-white/65">
            <Link href="/" className="hover:text-white">
              Product
            </Link>
            <Link href="/login" className="hover:text-white">
              Sign in
            </Link>
          </nav>
        </div>
        <section className="mt-10 rounded-[2rem] border border-white/70 bg-[var(--sand)] p-7 text-[var(--ink)] shadow-2xl shadow-black/25 sm:p-10">
          {eyebrow ? (
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--green)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-3 text-4xl font-black">{title}</h1>
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
