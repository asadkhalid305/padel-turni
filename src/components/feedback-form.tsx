"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { submitFeedback, type ActionState } from "@/app/actions";
import { FormPendingOverlay } from "@/components/form-pending-overlay";
import { Button, Spinner } from "@/components/ui";

const initialState: ActionState = { ok: false, message: "" };

export function FeedbackForm() {
  const [state, action, pending] = useActionState(submitFeedback, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <label className="block">
        <span className="field-label">Email</span>
        <input
          className="field"
          name="email"
          type="email"
          placeholder="you@example.com"
        />
        <span className="mt-1 block text-xs font-semibold text-slate-500">
          Optional, but needed if you want a reply.
        </span>
      </label>
      <label className="block">
        <span className="field-label">Topic</span>
        <select className="field" name="category" defaultValue="general">
          <option value="general">General feedback</option>
          <option value="bug">Bug report</option>
          <option value="onboarding">Onboarding</option>
          <option value="invite">Invite flow</option>
          <option value="event">Running an event</option>
        </select>
      </label>
      <label className="block">
        <span className="field-label">Message</span>
        <textarea
          className="field min-h-36 resize-y"
          name="message"
          minLength={10}
          maxLength={2000}
          required
          placeholder="Tell us what happened or what would make Padel Turni easier to use."
        />
      </label>
      <Button className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Spinner />
            Sending...
          </>
        ) : (
          <>
            <Send size={17} />
            Send feedback
          </>
        )}
      </Button>
      <FormPendingOverlay label="Sending feedback..." />
      {state.message ? (
        <p
          className={`text-sm font-semibold ${
            state.ok ? "text-emerald-700" : "text-rose-600"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
