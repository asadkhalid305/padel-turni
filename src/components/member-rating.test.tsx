import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  MemberRating,
  MemberRatingExplanation,
  ProvisionalProgress,
  RatingLevel,
} from "@/components/member-rating";

describe("member rating components", () => {
  it("renders a labelled one-decimal level", () => {
    const html = renderToStaticMarkup(<RatingLevel level="7.0" />);
    expect(html).toContain('aria-label="Level 7.0"');
    expect(html).toContain("7.0");
  });

  it.each([0, 1, 2, 3, 4, 5, 6])(
    "renders accessible provisional progress at %s of 6",
    (completed) => {
      const html = renderToStaticMarkup(
        <ProvisionalProgress completed={completed} target={6} />,
      );
      expect(html).toContain(`aria-valuenow="${completed}"`);
      expect(html).toContain(`${completed}/6`);
    },
  );

  it("renders pending and failed-safe work as neutral updating copy", () => {
    const html = renderToStaticMarkup(
      <MemberRating rating={{ state: "updating", level: "3.8" }} />,
    );
    expect(html).toContain("Updating");
    expect(html).not.toMatch(/failed|error/i);
  });

  it("identifies historical snapshots", () => {
    const html = renderToStaticMarkup(
      <MemberRating
        rating={{ state: "snapshot", level: "4.1", eventMode: "official" }}
      />,
    );
    expect(html).toContain("Start level");
    expect(html).toContain("Event snapshot");
  });

  it("explains Practice snapshots without implying a rating update", () => {
    const html = renderToStaticMarkup(
      <MemberRating
        rating={{ state: "snapshot", level: "4.1", eventMode: "practice" }}
      />,
    );
    expect(html).toContain("Practice · unchanged");
  });

  it("uses honest copy for legacy and missing profiles", () => {
    expect(
      renderToStaticMarkup(<MemberRating rating={{ state: "legacy" }} />),
    ).toContain("Legacy · no automated level");
    expect(
      renderToStaticMarkup(<MemberRating rating={{ state: "no_profile" }} />),
    ).toContain("No level yet");
  });

  it("explains the six Official matches and Practice policy", () => {
    const html = renderToStaticMarkup(<MemberRatingExplanation />);
    expect(html).toContain("first six Official rated match appearances");
    expect(html).toContain("Practice / social events never change it");
  });
});
