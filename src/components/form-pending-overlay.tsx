"use client";

import { useFormStatus } from "react-dom";

import { BrandedLoader } from "@/components/branded-loader";

export function FormPendingOverlay({ label }: { label: string }) {
  const { pending } = useFormStatus();

  if (!pending) return null;

  return (
    <div className="court-lines fixed inset-0 z-[100] grid place-items-center bg-[var(--ink)]/92 text-white backdrop-blur-sm">
      <div className="rounded-[2rem] border border-white/15 bg-white/10 p-8 shadow-2xl shadow-black/30">
        <BrandedLoader label={label} />
        <p className="mt-4 text-center text-sm font-black text-white/75">
          {label}
        </p>
      </div>
    </div>
  );
}
