"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { retryEventRatingJob, type ActionState } from "@/app/actions";

const initialState: ActionState = { ok: false, message: "" };

export function useRatingAdminController(refreshesUntilSettled: boolean) {
  const router = useRouter();
  const [retryState, retryAction] = useActionState(
    retryEventRatingJob,
    initialState,
  );

  useEffect(() => {
    if (!refreshesUntilSettled) return;
    const interval = window.setInterval(() => router.refresh(), 3_000);
    return () => window.clearInterval(interval);
  }, [refreshesUntilSettled, router]);

  useEffect(() => {
    if (retryState.ok) router.refresh();
  }, [retryState.ok, router]);

  return { retryState, retryAction };
}
