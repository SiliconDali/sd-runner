import { describe, it, expect } from "vitest";
import { parseDiff } from "./diff";
import { parseThreads } from "./threads";
import { validateReview } from "./validate";

const diff = parseDiff(
  [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,3 +1,3 @@",
    " one",
    "-two",
    "+TWO",
    " three",
  ].join("\n")
);

const threads = parseThreads(
  JSON.stringify({
    threads: [
      {
        path: "src/a.ts",
        line: 2,
        comments: [
          { id: 10, author: "dev", body: "?" },
          { id: 11, author: "dev", body: "??" },
        ],
      },
    ],
    comments: [{ id: 99, author: "dev", body: "general" }],
  })
);

describe("validateReview", () => {
  it("keeps comments on diff lines, defaulting the side to RIGHT", () => {
    const result = validateReview(
      {
        summary: "s",
        comments: [
          { path: "src/a.ts", line: 2, body: "added line" },
          { path: "src/a.ts", line: 2, side: "LEFT", body: "deleted line" },
        ],
        replies: [],
      },
      diff,
      threads
    );
    expect(result.comments).toEqual([
      { path: "src/a.ts", line: 2, side: "RIGHT", body: "added line" },
      { path: "src/a.ts", line: 2, side: "LEFT", body: "deleted line" },
    ]);
    expect(result.dropped).toEqual([]);
  });

  it("drops comments off the diff with a reason", () => {
    const result = validateReview(
      {
        summary: "s",
        comments: [
          { path: "src/a.ts", line: 40, body: "outside hunk" },
          { path: "src/missing.ts", line: 1, body: "not in diff" },
          { path: "src/a.ts", line: 4, side: "LEFT", body: "old file has three lines" },
        ],
        replies: [],
      },
      diff,
      threads
    );
    expect(result.comments).toEqual([]);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      "src/a.ts:40 (RIGHT) is not a line in the diff",
      "src/missing.ts is not in the diff",
      "src/a.ts:4 (LEFT) is not a line in the diff",
    ]);
    expect(result.dropped[0]).toMatchObject({ kind: "comment", item: { line: 40 } });
  });

  it("keeps replies to thread comments, pointed at the thread's first comment", () => {
    const result = validateReview(
      {
        summary: "s",
        comments: [],
        replies: [
          { comment_id: 10, body: "a" },
          { comment_id: 11, body: "b" },
        ],
      },
      diff,
      threads
    );
    expect(result.replies).toEqual([
      { comment_id: 10, body: "a" },
      { comment_id: 10, body: "b" },
    ]);
  });

  it("drops replies to unknown ids and to conversation comments", () => {
    const result = validateReview(
      {
        summary: "s",
        comments: [],
        replies: [
          { comment_id: 12345, body: "hallucinated" },
          { comment_id: 99, body: "conversation" },
        ],
      },
      diff,
      threads
    );
    expect(result.replies).toEqual([]);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      "comment 12345 is not in an open review thread",
      "comment 99 is not in an open review thread",
    ]);
  });
});
