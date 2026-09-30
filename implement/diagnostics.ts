import * as fs from "node:fs";
import * as path from "node:path";
import { fileBlock } from "../prompt-args";

/**
 * The optional diagnostics section of the implement prompt: the commands in
 * `file` (one per line) as a data block under the section text in
 * `diagnostics.md`. Empty, so the section is absent, when `file` is empty.
 * The host decides what to probe; the prompt only asks for each command's
 * result verbatim.
 */
export function diagnosticsBlock(file: string): string {
  if (!file) return "";
  const section = fs.readFileSync(path.join(import.meta.dirname, "diagnostics.md"), "utf8");
  return `${section.trimEnd()}\n\n${fileBlock("diagnostics", file)}`;
}
