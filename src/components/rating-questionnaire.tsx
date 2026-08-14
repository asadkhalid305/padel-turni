"use client";

import { ArrowLeft, ArrowRight, Check, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import {
  saveRatingQuestionnaire,
  type RatingQuestionnaireActionState,
} from "@/app/rating/actions";
import { getInitialRatingFromQuestionnaire } from "@/domain/ratings/questionnaire";
import type {
  QuestionnaireField,
  RatingQuestionnaireAnswers,
} from "@/domain/ratings/questionnaire";
import { Button, Card, Spinner } from "@/components/ui";
import {
  isQuestionnaireComplete,
  QUESTIONNAIRE_FIELDS,
  type QuestionnaireDraft,
} from "@/features/rating-questionnaire/controller";
import {
  QUESTIONNAIRE_RESULT_COPY,
  RATING_QUESTIONNAIRE_GROUPS,
  type QuestionnaireGroup,
} from "@/features/rating-questionnaire/config";
import { useRatingQuestionnaire } from "@/features/rating-questionnaire/use-rating-questionnaire";

const INITIAL_ACTION_STATE: RatingQuestionnaireActionState = {
  ok: false,
  message: "",
};

export function RatingQuestionnaire({
  initialAnswers,
  initiallyCompleted,
}: {
  initialAnswers: QuestionnaireDraft;
  initiallyCompleted: boolean;
}) {
  const [controller, dispatch] = useRatingQuestionnaire(
    initialAnswers,
    initiallyCompleted,
  );
  const [actionState, action, pending] = useActionState(
    saveRatingQuestionnaire,
    INITIAL_ACTION_STATE,
  );
  const isResult = controller.step === QUESTIONNAIRE_FIELDS.length;
  const group = isResult ? null : RATING_QUESTIONNAIRE_GROUPS[controller.step];

  return (
    <Card className="bg-[var(--sand)] p-5 sm:p-8">
      <ol
        className="mb-7 grid grid-cols-3 gap-2"
        aria-label="Questionnaire progress"
      >
        {QUESTIONNAIRE_FIELDS.map((field, index) => (
          <li
            key={field}
            className={`h-2 rounded-full ${
              controller.step >= index ? "bg-[var(--green)]" : "bg-slate-200"
            }`}
          >
            <span className="sr-only">
              Question {index + 1} {controller.step > index ? "completed" : ""}
            </span>
          </li>
        ))}
      </ol>

      {group ? (
        <QuestionGroup
          group={group}
          selectedValue={controller.answers[group.field]}
          validationMessage={controller.validationMessage}
          onAnswer={(field, value) =>
            dispatch({ type: "answer", field, value })
          }
          onBack={
            controller.step > 0 ? () => dispatch({ type: "back" }) : undefined
          }
          onNext={() => dispatch({ type: "next" })}
        />
      ) : isQuestionnaireComplete(controller.answers) ? (
        <QuestionnaireResult
          answers={controller.answers}
          action={action}
          actionState={actionState}
          initiallyCompleted={initiallyCompleted}
          pending={pending}
          onBack={() => dispatch({ type: "back" })}
        />
      ) : null}
    </Card>
  );
}

export function QuestionGroup({
  group,
  onAnswer,
  onBack,
  onNext,
  selectedValue,
  validationMessage,
}: {
  group: QuestionnaireGroup<QuestionnaireField>;
  onAnswer: (
    field: QuestionnaireField,
    value: RatingQuestionnaireAnswers[QuestionnaireField],
  ) => void;
  onBack?: () => void;
  onNext: () => void;
  selectedValue?: string;
  validationMessage: string | null;
}) {
  return (
    <section aria-labelledby={`${group.field}-title`}>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--green)]">
        {group.eyebrow}
      </p>
      <h2
        id={`${group.field}-title`}
        className="mt-2 text-2xl font-black tracking-tight text-[var(--ink)] sm:text-3xl"
      >
        {group.title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {group.description}
      </p>
      <fieldset className="mt-6 space-y-3">
        <legend className="sr-only">{group.title}</legend>
        {group.options.map((option) => (
          <label
            key={option.value}
            className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
              selectedValue === option.value
                ? "border-[var(--green)] bg-emerald-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-emerald-200"
            }`}
          >
            <input
              type="radio"
              name={group.field}
              value={option.value}
              checked={selectedValue === option.value}
              onChange={() => onAnswer(group.field, option.value)}
              className="mt-1 size-4 shrink-0 accent-emerald-700"
            />
            <span>
              <span className="block text-sm font-black text-[var(--ink)]">
                {option.title}
              </span>
              <span className="mt-1 block text-sm leading-5 text-slate-600">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {validationMessage ? (
        <p className="mt-3 text-sm font-bold text-rose-700" role="alert">
          {validationMessage}
        </p>
      ) : null}
      <div className="mt-6 flex gap-3">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft size={17} /> Back
          </Button>
        ) : null}
        <Button type="button" className="ml-auto" onClick={onNext}>
          Continue <ArrowRight size={17} />
        </Button>
      </div>
    </section>
  );
}

export function QuestionnaireResult({
  action,
  actionState,
  answers,
  initiallyCompleted,
  onBack,
  pending,
}: {
  action: (payload: FormData) => void;
  actionState: RatingQuestionnaireActionState;
  answers: RatingQuestionnaireAnswers;
  initiallyCompleted: boolean;
  onBack: () => void;
  pending: boolean;
}) {
  const result = getInitialRatingFromQuestionnaire(answers);
  if (!result.ok) return null;

  if (actionState.ok) {
    return (
      <div className="text-center" role="status">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-800">
          <Check size={28} />
        </span>
        <h2 className="mt-4 text-2xl font-black text-[var(--ink)]">
          Level saved
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {actionState.message}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--ink)] px-6 text-sm font-black text-white"
        >
          Continue to Padel Turni
        </Link>
      </div>
    );
  }

  return (
    <section aria-labelledby="questionnaire-result-title">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--green)]">
        Provisional result
      </p>
      <h2
        id="questionnaire-result-title"
        className="mt-2 text-2xl font-black text-[var(--ink)] sm:text-3xl"
      >
        {QUESTIONNAIRE_RESULT_COPY.title}
      </h2>
      <div className="mt-5 rounded-3xl bg-[var(--ink)] p-6 text-center text-white">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--lime)]">
          Starting level
        </p>
        <p className="mt-2 text-6xl font-black tracking-tight">
          {result.value.displayLevel.toFixed(1)}
        </p>
        <p className="mt-3 text-sm leading-6 text-white/70">
          {QUESTIONNAIRE_RESULT_COPY.description}
        </p>
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-900">
        <LockKeyhole className="mt-0.5 shrink-0" size={17} />
        {QUESTIONNAIRE_RESULT_COPY.editable}
      </p>
      <form action={action} className="mt-6">
        <input type="hidden" name="padelHistory" value={answers.padelHistory} />
        <input
          type="hidden"
          name="racketSportBackground"
          value={answers.racketSportBackground}
        />
        <input
          type="hidden"
          name="currentPadelAbility"
          value={answers.currentPadelAbility}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={pending}
          >
            <ArrowLeft size={17} /> Edit answers
          </Button>
          <Button disabled={pending}>
            {pending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : initiallyCompleted ? (
              "Save updated level"
            ) : (
              "Save my level"
            )}
          </Button>
        </div>
        {actionState.message ? (
          <p className="mt-4 text-sm font-bold text-rose-700" role="alert">
            {actionState.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
