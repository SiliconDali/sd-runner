import { describe, it, expect } from "vitest";
import { parseDiff } from "./diff";
import { OPENERS, parseThreads } from "./threads";
import { validateComments, validateReplies, validateVerdicts } from "./validate";

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

const openers = [OPENERS.fixRequired, OPENERS.decisionRequired];

describe("validateComments", () => {
  it("keeps comments on diff lines, defaulting the side to RIGHT", () => {
    const result = validateComments(
      [
        { path: "src/a.ts", line: 2, body: "Fix required: added line" },
        { path: "src/a.ts", line: 2, side: "LEFT", body: "Decision required: deleted line" },
      ],
      diff,
      openers,
      OPENERS.fixRequired
    );
    expect(result.comments).toEqual([
      { path: "src/a.ts", line: 2, side: "RIGHT", body: "Fix required: added line" },
      { path: "src/a.ts", line: 2, side: "LEFT", body: "Decision required: deleted line" },
    ]);
    expect(result.dropped).toEqual([]);
  });

  it("puts the fallback opener in front of a body that opens with none", () => {
    const result = validateComments(
      [{ path: "src/a.ts", line: 2, body: "  off by one" }],
      diff,
      [OPENERS.decisionRequired],
      OPENERS.decisionRequired
    );
    expect(result.comments[0]!.body).toBe("Decision required: off by one");
  });

  it("drops comments off the diff with a reason", () => {
    const result = validateComments(
      [
        { path: "src/a.ts", line: 40, body: "outside hunk" },
        { path: "src/missing.ts", line: 1, body: "not in diff" },
        { path: "src/a.ts", line: 4, side: "LEFT", body: "old file has three lines" },
      ],
      diff,
      openers,
      OPENERS.fixRequired
    );
    expect(result.comments).toEqual([]);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      "src/a.ts:40 (RIGHT) is not a line in the diff",
      "src/missing.ts is not in the diff",
      "src/a.ts:4 (LEFT) is not a line in the diff",
    ]);
    expect(result.dropped[0]).toMatchObject({ kind: "comment", item: { line: 40 } });
  });
});

describe("validateReplies", () => {
  it("keeps replies to thread comments, pointed at the thread's first comment, one per thread", () => {
    const result = validateReplies(
      [
        { comment_id: 10, body: "a" },
        { comment_id: 11, body: "b" },
      ],
      threads
    );
    expect(result.replies).toEqual([{ comment_id: 10, body: "a\n\nb" }]);
  });

  it("drops replies to unknown ids and to conversation comments", () => {
    const result = validateReplies(
      [
        { comment_id: 12345, body: "hallucinated" },
        { comment_id: 99, body: "conversation" },
      ],
      threads
    );
    expect(result.replies).toEqual([]);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      "comment 12345 is not in an open review thread",
      "comment 99 is not in an open review thread",
    ]);
  });
});

describe("validateVerdicts", () => {
  const under = parseThreads(
    JSON.stringify({
      threads: [
        {
          path: "src/a.ts",
          line: 2,
          comments: [
            { id: 10, author: "bot", body: "Fix required: guard NaN." },
            { id: 11, author: "bot", body: "Fixed in `abc1234`: guarded." },
          ],
        },
        { path: "src/a.ts", line: 3, comments: [{ id: 20, author: "dev", body: "Rename this." }] },
      ],
      comments: [],
    })
  );

  it("composes the reply from the opener and the reason, at the thread's first comment", () => {
    const result = validateVerdicts(
      [
        { comment_id: 11, verified: true, reason: "the NaN test fails without the guard." },
        { comment_id: 20, verified: true, reason: "" },
      ],
      under
    );
    expect(result.verdicts).toEqual([
      { comment_id: 10, verified: true, body: "Fix verified. the NaN test fails without the guard." },
      { comment_id: 20, verified: true, body: "Fix verified." },
    ]);
    expect(result.unjudged).toEqual([]);
  });

  it("posts a failed verdict on a claimed thread and stays silent on an unclaimed one", () => {
    const result = validateVerdicts(
      [
        { comment_id: 10, verified: false, reason: "no test covers NaN." },
        { comment_id: 20, verified: false, reason: "still the old name." },
      ],
      under
    );
    expect(result.verdicts).toEqual([
      { comment_id: 10, verified: false, body: "Fix not verified: no test covers NaN." },
    ]);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      "thread at comment 20 claims no fix, so an unverified verdict stays unsaid",
    ]);
    expect(result.unjudged).toEqual([20]);
  });

  it("drops a verdict outside the threads, keeps the first per thread, and lists threads left unjudged", () => {
    const result = validateVerdicts(
      [
        { comment_id: 7, verified: true, reason: "" },
        { comment_id: 10, verified: true, reason: "first" },
        { comment_id: 11, verified: false, reason: "second" },
      ],
      under
    );
    expect(result.verdicts).toEqual([{ comment_id: 10, verified: true, body: "Fix verified. first" }]);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      "comment 7 is not in a thread under confirmation",
      "thread at comment 10 already has a verdict",
    ]);
    expect(result.unjudged).toEqual([20]);
  });
});
