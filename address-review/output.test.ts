import { describe, it, expect } from "vitest";
import { AddressReviewOutput } from "./output";

const valid = {
  summary: "## Addressed\n\n- Fixed the off-by-one.",
  replies: [{ comment_id: 42, body: "Fixed in `abc1234`: bounds check added." }],
};

describe("AddressReviewOutput", () => {
  it("accepts a summary and replies", () => {
    expect(AddressReviewOutput.safeParse(valid).success).toBe(true);
  });

  it("defaults replies to empty", () => {
    expect(AddressReviewOutput.parse({ summary: "ok" }).replies).toEqual([]);
  });

  it("rejects an empty summary", () => {
    expect(AddressReviewOutput.safeParse({ ...valid, summary: "" }).success).toBe(false);
  });

  it("rejects inline comments and a review body: the fixer posts no review", () => {
    expect(
      AddressReviewOutput.safeParse({ ...valid, comments: [{ path: "a", line: 1, body: "b" }] })
        .success
    ).toBe(false);
    expect(AddressReviewOutput.safeParse({ ...valid, event: "COMMENT" }).success).toBe(false);
  });

  it("rejects a reply without a numeric comment id", () => {
    const parsed = AddressReviewOutput.safeParse({
      ...valid,
      replies: [{ thread_id: "PRRT_x", body: "b" }],
    });
    expect(parsed.success).toBe(false);
  });
});
