import { describe, it, expect } from "vitest";
import { awaitingDecision, claimed, confirmScope, fixerWork, forDecision, parseThreads, selectThreads, threadRoots } from "./threads";

const file = {
  threads: [
    {
      path: "src/a.ts",
      line: 3,
      comments: [
        { id: 10, author: "dev", body: "Why this?" },
        { id: 11, author: "bot", body: "Because." },
      ],
    },
    { path: "src/b.ts", line: null, comments: [{ id: 20, author: "dev", body: "Outdated?" }] },
  ],
  comments: [{ id: 99, author: "dev", body: "General note." }],
};

describe("parseThreads", () => {
  it("accepts the documented shape", () => {
    expect(parseThreads(JSON.stringify(file)).threads).toHaveLength(2);
  });

  it("defaults missing lists to empty", () => {
    expect(parseThreads("{}")).toEqual({ threads: [], comments: [] });
  });

  it("throws on malformed JSON or shape", () => {
    expect(() => parseThreads("not json")).toThrow();
    expect(() => parseThreads('{"threads":[{"comments":"x"}]}')).toThrow();
  });
});

describe("threadRoots", () => {
  const roots = threadRoots(parseThreads(JSON.stringify(file)));

  it("maps every thread comment to the thread's first comment", () => {
    expect(roots.get(10)).toBe(10);
    expect(roots.get(11)).toBe(10);
    expect(roots.get(20)).toBe(20);
  });

  it("does not map conversation comments, which have no thread to reply in", () => {
    expect(roots.has(99)).toBe(false);
  });
});

const thread = (...bodies: string[]) => ({
  path: "src/a.ts",
  line: 1,
  comments: bodies.map((body, i) => ({ id: i + 1, author: i === 0 ? "reviewer" : "bot", body })),
});

describe("thread kinds", () => {
  const fixRequired = thread("Fix required: off by one.");
  const decision = thread("Decision required: the spec asks for X, the ticket omits it.");
  const answered = thread("Decision required: the spec asks for X, the ticket omits it.", "(b): add X here.");
  const answeredFixed = thread("Decision required: the spec asks for X.", "(b): add X here.", "Fixed in `abc1234`: X added.");
  const human = thread("Is this right?");
  const fixed = thread("Fix required: off by one.", "Fixed in `abc1234`: bounds check.");
  const declined = thread("Fix required: rename.", "Not changed: the name is the spec's.");
  const reopened = thread("Fix required: rename.", "Not changed: the name is the spec's.", "Please do it anyway.");
  const verified = thread("Is this right?", "Fixed in `abc1234`.", "Fix verified.");
  const notVerified = thread("Fix required: off by one.", "Fixed in `abc1234`.", "Fix not verified: the test passes without the change.");

  it("forDecision reads the first comment's opener", () => {
    expect(forDecision(decision)).toBe(true);
    expect(forDecision(fixRequired)).toBe(false);
    expect(forDecision(human)).toBe(false);
  });

  it("fixerWork is every thread whose last word is not a bot's: a decision awaiting the developer, fixed, declined or verified", () => {
    expect([fixRequired, human, reopened, notVerified, answered].map(fixerWork)).toEqual([true, true, true, true, true]);
    expect([decision, fixed, declined, verified, answeredFixed].map(fixerWork)).toEqual([false, false, false, false, false]);
  });

  it("awaitingDecision is a decision thread nobody has answered yet", () => {
    expect([decision].map(awaitingDecision)).toEqual([true]);
    expect([answered, answeredFixed, fixRequired, human].map(awaitingDecision)).toEqual([false, false, false, false]);
  });

  it("confirmScope keeps claimed and unclaimed threads, and drops decisions, declines and verified ones", () => {
    expect([fixRequired, human, fixed, reopened, notVerified].map(confirmScope)).toEqual([true, true, true, true, true]);
    expect([decision, declined, verified].map(confirmScope)).toEqual([false, false, false]);
  });

  it("claimed is any reply opening Fixed in", () => {
    expect(claimed(fixed)).toBe(true);
    expect(claimed(notVerified)).toBe(true);
    expect(claimed(fixRequired)).toBe(false);
  });

  it("selectThreads filters the threads and keeps the conversation comments", () => {
    const all = parseThreads(JSON.stringify({ threads: [fixRequired, decision], comments: [{ id: 99, body: "note" }] }));
    expect(selectThreads(all, fixerWork)).toEqual({ threads: [fixRequired], comments: [{ id: 99, body: "note" }] });
  });
});
