import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "../no-sandbox";
import { fail, optional, required } from "../env";
import { failureReason } from "../failure-reason";
import { readRunInputs } from "../prompt-args";
import { runReview, type ReviewMode } from "./run-review";

const inputs = readRunInputs();
const TICKET_FILE = required("TICKET_FILE");
const SPEC_FILE = required("SPEC_FILE");
const THREADS_FILE = required("THREADS_FILE");
const MODE = optional("REVIEW_MODE", "review");
const MAX_ATTEMPTS = 3;

if (MODE !== "review" && MODE !== "confirm") {
  fail(inputs.outputDir, `REVIEW_MODE must be "review" or "confirm", got "${MODE}".`);
}

try {
  await runReview({
    inputs,
    ticketFile: TICKET_FILE,
    specFile: SPEC_FILE,
    threadsFile: THREADS_FILE,
    cwd: process.cwd(),
    agent: sandcastle.claudeCode(inputs.model),
    sandbox: noSandbox(),
    maxAttempts: MAX_ATTEMPTS,
    mode: MODE as ReviewMode,
  });
} catch (error) {
  if (error instanceof sandcastle.StructuredOutputError) {
    fail(
      inputs.outputDir,
      `${MODE === "confirm" ? "Confirm" : "Review"} output did not validate after ${MAX_ATTEMPTS} attempts: ${error.message}`
    );
  }
  fail(inputs.outputDir, failureReason(error));
}
