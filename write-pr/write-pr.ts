import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { fail, required } from "../env";
import { fileBlock, readRunInputs } from "../prompt-args";
import { runWithRetry } from "../run-with-retry";
import { PrOutput } from "./output";
import { agent } from "../agent"

const inputs = readRunInputs();
const TICKET_FILE = required("TICKET_FILE");
const MAX_ATTEMPTS = 3;

try {
  const result = await runWithRetry({
    name: `write-pr ${inputs.externalRef}`,
    agent: agent(inputs.model),
    sandbox: noSandbox(),
    logging: { type: "stdout" },
    promptFile: path.join(import.meta.dirname, "prompt.md"),
    promptArgs: {
      BRANCH: inputs.branch,
      BASE_BRANCH: inputs.baseBranch,
      EXTERNAL_REF: inputs.externalRef,
      TICKET: fileBlock("ticket", TICKET_FILE),
    },
    output: sandcastle.Output.object({ tag: "output", schema: PrOutput }),
    maxAttempts: MAX_ATTEMPTS,
  });

  const title = result.output.prTitle.split("\n")[0]?.trim() ?? "";
  fs.mkdirSync(inputs.outputDir, { recursive: true });
  fs.writeFileSync(path.join(inputs.outputDir, "pr_title.txt"), title);
  fs.writeFileSync(
    path.join(inputs.outputDir, "pr_description.txt"),
    result.output.prDescription
  );

  console.log(`\nWrote PR metadata to ${inputs.outputDir}`);
  console.log(`  title: ${title}`);
} catch (error) {
  if (error instanceof sandcastle.StructuredOutputError) {
    fail(
      inputs.outputDir,
      `PR text did not validate after ${MAX_ATTEMPTS} attempts: ${error.message}`
    );
  }
  fail(inputs.outputDir, error instanceof Error ? error.message : String(error));
}
