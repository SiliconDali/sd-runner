import { describe, it, expect } from "vitest";
import { ReviewOutput } from "./output";

const valid = {
  summary: "## Review\n\nLooks fine.",
  comments: [{ path: "src/a.ts", line: 3, body: "Off by one." }],
  replies: [{ comment_id: 42, body: "Fixed in the review commit." }],
};

describe("ReviewOutput", () => {
  it("accepts a summary, inline comments and replies", () => {
    expect(ReviewOutput.safeParse(valid).success).toBe(true);
  });

  it("accepts a side on a comment", () => {
    const parsed = ReviewOutput.safeParse({
      ...valid,
      comments: [{ path: "a", line: 1, side: "LEFT", body: "b" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults comments and replies to empty", () => {
    const parsed = ReviewOutput.parse({ summary: "ok" });
    expect(parsed.comments).toEqual([]);
    expect(parsed.replies).toEqual([]);
  });

  it("rejects an empty summary", () => {
    expect(ReviewOutput.safeParse({ ...valid, summary: "" }).success).toBe(false);
  });

  it("rejects a hallucinated field", () => {
    expect(ReviewOutput.safeParse({ ...valid, event: "APPROVE" }).success).toBe(false);
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

  it("rejects a reply without a numeric comment id", () => {
    const parsed = ReviewOutput.safeParse({
      ...valid,
      replies: [{ thread_id: "PRRT_x", body: "b" }],
    });
    expect(parsed.success).toBe(false);
  });
});
