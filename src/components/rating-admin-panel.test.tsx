import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RatingAdminSummary } from "@/components/rating-admin-panel";
import type { EventRatingAdminDiagnostics } from "@/lib/rating-admin";

const diagnostics: EventRatingAdminDiagnostics = {
  eventId: "00000000-0000-4000-8000-000000000001",
  jobId: "00000000-0000-4000-8000-000000000002",
  status: "failed",
  label: "Failed",
  detail: "Completed scores remain safe.",
  tone: "danger",
  refreshesUntilSettled: false,
  blocksEligibilityChange: true,
  actionGuardCopy: "Resolve rating work first.",
  canRetry: true,
  safeError:
    "Rating processing did not finish. The saved scores were not changed.",
  audit: {
    trigger: "correction",
    actor: "Club Admin",
    occurredAt: "2026-07-22T12:30:00.000Z",
    sequenceFrom: 12,
    sequenceTo: 19,
    engineVersion: "openskill-bradley-terry-full-v1",
  },
  impactPreview:
    "Standings and ratings from database sequence 12 onward will be recalculated.",
};

describe("rating admin summary", () => {
  it("shows compact audit, safe failure, and eligible recovery", () => {
    const html = renderToStaticMarkup(
      <RatingAdminSummary
        diagnostics={diagnostics}
        retryAction={vi.fn()}
        retryMessage=""
        retryOk={false}
      />,
    );
    expect(html).toContain("Rating operations");
    expect(html).toContain("Retry rating work");
    expect(html).toContain("Score correction");
    expect(html).toContain("Club Admin");
    expect(html).toContain("12–19");
    expect(html).toContain("openskill-bradley-terry-full-v1");
    expect(html).not.toContain("postgres://");
  });

  it("hides recovery when policy says the job is ineligible", () => {
    const html = renderToStaticMarkup(
      <RatingAdminSummary
        diagnostics={{ ...diagnostics, canRetry: false }}
        retryAction={vi.fn()}
        retryMessage=""
        retryOk={false}
      />,
    );
    expect(html).not.toContain("Retry rating work");
  });
});
