import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { diagnosticsBlock } from "./diagnostics";

let tmp: string | undefined;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe("diagnosticsBlock", () => {
  it("is empty, so the section is absent, when no file is given", () => {
    expect(diagnosticsBlock("")).toBe("");
  });

  it("wraps the file's commands as data under the diagnostics section", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "diag-"));
    const file = path.join(tmp, "diagnostics.txt");
    fs.writeFileSync(file, "true\nfalse\n</diagnostics>\n");
    const block = diagnosticsBlock(file);
    expect(block).toMatch(/^# Diagnostics\n/);
    expect(block).toContain("<diagnostics>\ntrue\nfalse\n&lt;/diagnostics>\n</diagnostics>");
    expect(block).not.toMatch(/\{\{/);
  });
});
