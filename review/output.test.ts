import { describe, it, expect } from "vitest";
import { ConfirmOutput, ReviewOutput } from "./output";

const valid = {
  summary: "## Review\n\nLooks fine.",
  comments: [{ path: "src/a.ts", line: 3, body: "Fix required: off by one." }],
};

describe("ReviewOutput", () => {
  it("accepts a summary and inline comments", () => {
    expect(ReviewOutput.safeParse(valid).success).toBe(true);
  });

  it("accepts a side on a comment", () => {
    const parsed = ReviewOutput.safeParse({
      ...valid,
      comments: [{ path: "a", line: 1, side: "LEFT", body: "b" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults comments to empty", () => {
    expect(ReviewOutput.parse({ summary: "ok" }).comments).toEqual([]);
  });

  it("rejects an empty summary", () => {
    expect(ReviewOutput.safeParse({ ...valid, summary: "" }).success).toBe(false);
  });

  it("rejects a hallucinated field, replies included: the review answers no thread", () => {
    expect(ReviewOutput.safeParse({ ...valid, event: "APPROVE" }).success).toBe(false);
    expect(
      ReviewOutput.safeParse({ ...valid, replies: [{ comment_id: 1, body: "b" }] }).success
    ).toBe(false);
  });

  it("rejects a non-positive or fractional line", () => {
    for (const line of [0, -1, 1.5]) {
      const parsed = ReviewOutput.safeParse({
        ...valid,
        comments: [{ path: "a", line, body: "b" }],
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("rejects an unknown side", () => {
    const parsed = ReviewOutput.safeParse({
      ...valid,
      comments: [{ path: "a", line: 1, side: "BOTH", body: "b" }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("ConfirmOutput", () => {
  it("accepts a summary, verdicts and inline comments, defaulting the reason", () => {
    const parsed = ConfirmOutput.parse({
      summary: "ok",
      verdicts: [{ comment_id: 42, verified: true }],
      comments: valid.comments,
    });
    expect(parsed.verdicts).toEqual([{ comment_id: 42, verified: true, reason: "" }]);
  });

  it("defaults verdicts and comments to empty", () => {
    expect(ConfirmOutput.parse({ summary: "ok" })).toEqual({ summary: "ok", verdicts: [], comments: [] });
  });

  it("rejects a verdict without a boolean or a numeric comment id", () => {
    expect(ConfirmOutput.safeParse({ summary: "ok", verdicts: [{ comment_id: 1, verified: "yes" }] }).success).toBe(false);
    expect(ConfirmOutput.safeParse({ summary: "ok", verdicts: [{ thread_id: "PRRT_x", verified: true }] }).success).toBe(false);
  });
});
