import { describe, it, expect } from "vitest";
import { parseThreads, threadRoots } from "./threads";

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
