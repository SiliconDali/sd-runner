import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { PROMPT_ARG_KEYS } from "./prompt-args";

const here = import.meta.dirname;
const prompts = ["implement/prompt.md", "write-pr/prompt.md"];
const read = (file: string) => fs.readFileSync(path.join(here, file), "utf8");

describe("prompts", () => {
  it("write-pr expects an <output> block", () => {
    expect(read("write-pr/prompt.md")).toContain("<output>");
  });

  it.each(prompts)("%s references only known prompt args", (file) => {
    const keys = [...read(file).matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map(
      (m) => m[1]
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(PROMPT_ARG_KEYS).toContain(key);
    }
  });
});
