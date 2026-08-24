import { describe, expect, it } from "vitest";

import { canonicalStringify, hashCanonicalJson } from "@/lib/rating-replay";

describe("rating replay audit hashes", () => {
  it("is stable across object key insertion order", () => {
    expect(canonicalStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalStringify({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(hashCanonicalJson({ b: 2, a: 1 })).toBe(
      hashCanonicalJson({ a: 1, b: 2 }),
    );
  });

  it("keeps array order significant for database-ordered replay", () => {
    expect(hashCanonicalJson(["event-1", "event-2"])).not.toBe(
      hashCanonicalJson(["event-2", "event-1"]),
    );
  });
});
