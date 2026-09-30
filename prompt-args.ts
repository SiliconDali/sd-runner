import * as fs from "node:fs";
import * as os from "node:os";
import { dataBlock } from "./data-block";
import { optional, required } from "./env";

/** Every `{{KEY}}` a prompt in this directory may reference. */
export const PROMPT_ARG_KEYS = [
  "BRANCH",
  "BASE_BRANCH",
  "EXTERNAL_REF",
  "TICKET",
  "SPEC",
  "SIBLINGS",
  "THREADS",
] as const;

export const DEFAULT_MODEL = "claude-opus-5-5";

export interface RunInputs {
  /** Branch the run works on, already checked out. */
  readonly branch: string;
  /** Branch the work branch was cut from and will merge into. */
  readonly baseBranch: string;
  /** Opaque reference to the work in whatever system the host uses. */
  readonly externalRef: string;
  /** Where result files and `failure_reason.txt` go. */
  readonly outputDir: string;
  readonly model: string;
}

/** The inputs every run script takes from its environment. */
export function readRunInputs(): RunInputs {
  return {
    branch: required("BRANCH"),
    baseBranch: required("BASE_BRANCH"),
    externalRef: required("EXTERNAL_REF"),
    outputDir: optional("OUTPUT_DIR", os.tmpdir()),
    model: optional("MODEL", DEFAULT_MODEL),
  };
}

/** A file's contents as a tagged data block for a prompt. */
export function fileBlock(tag: string, file: string): string {
  return dataBlock(tag, fs.readFileSync(file, "utf8"));
}
