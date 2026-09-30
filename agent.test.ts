import { describe, it, expect } from "vitest";
import { agent } from "./agent";

describe("agent", () => {
  it("bypasses permission prompts, since nobody can answer them in a run", () => {
    const { command } = agent("some-model").buildPrintCommand({
      prompt: "p",
      dangerouslySkipPermissions: false,
    });
    expect(command).toContain("--permission-mode bypassPermissions");
    expect(command).toContain("--model 'some-model'");
  });
});
