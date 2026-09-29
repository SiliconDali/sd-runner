import { describe, it, expect } from "vitest";
import { PrOutput } from "./output";

describe("PrOutput", () => {
  it("accepts a title and description", () => {
    const parsed = PrOutput.safeParse({
      prTitle: "REF-1: add thing",
      prDescription: "## Summary\n\n- added thing",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a hallucinated field", () => {
    const parsed = PrOutput.safeParse({
      prTitle: "REF-1: add thing",
      prDescription: "body",
      reviewers: ["someone"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty title", () => {
    const parsed = PrOutput.safeParse({ prTitle: "", prDescription: "body" });
    expect(parsed.success).toBe(false);
  });
});
