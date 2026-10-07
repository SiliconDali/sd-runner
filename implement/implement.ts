import * as path from "node:path";
import { execSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "../no-sandbox";
import { fail, optional, required } from "../env";
import { failureReason } from "../failure-reason";
import { fileBlock, readRunInputs } from "../prompt-args";
import { diagnosticsBlock } from "./diagnostics";

const inputs = readRunInputs();
const TICKET_FILE = required("TICKET_FILE");
const SPEC_FILE = required("SPEC_FILE");
const SIBLINGS_FILE = required("SIBLINGS_FILE");
const DIAGNOSTICS_FILE = optional("DIAGNOSTICS_FILE", "");

const startSha = git("rev-parse HEAD");

try {
  const result = await sandcastle.run({
    name: `implement ${inputs.externalRef}`,
    agent: sandcastle.claudeCode(inputs.model),
    sandbox: noSandbox(),
    logging: { type: "stdout" },
    promptFile: path.join(import.meta.dirname, "prompt.md"),
    promptArgs: {
      BRANCH: inputs.branch,
      BASE_BRANCH: inputs.baseBranch,
      EXTERNAL_REF: inputs.externalRef,
      TICKET: fileBlock("ticket", TICKET_FILE),
      SPEC: fileBlock("spec", SPEC_FILE),
      SIBLINGS: fileBlock("siblings", SIBLINGS_FILE),
      DIAGNOSTICS: diagnosticsBlock(DIAGNOSTICS_FILE),
    },
  });

  const commitsAhead = Number(git(`rev-list --count ${startSha}..HEAD`));
  if (!Number.isFinite(commitsAhead) || commitsAhead === 0) {
    fail(inputs.outputDir, "Agent finished without committing on the branch.");
  }

  const leftovers = git("status --porcelain");
  if (leftovers) {
    console.warn(`\nUncommitted changes left behind (not pushed):\n${leftovers}`);
  }

  console.log(
    `\nImplementation produced ${commitsAhead} commit(s) on ${inputs.branch} ` +
      `(sandcastle recorded ${result.commits.length}).`
  );
} catch (error) {
  fail(inputs.outputDir, failureReason(error));
}

function git(args: string): string {
  return execSync(`git ${args}`, { encoding: "utf8" }).trim();
}
