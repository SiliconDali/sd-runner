import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { dataBlock } from "../data-block";
import { fileBlock, type RunInputs } from "../prompt-args";
import { runWithExtraction } from "../run-with-extraction";
import { diffAgainst, parseDiff } from "./diff";
import { ReviewOutput } from "./output";
import { parseThreads } from "./threads";
import { validateReview, type AnchoredComment, type Dropped } from "./validate";

export interface ReviewRunOptions {
  readonly inputs: RunInputs;
  readonly ticketFile: string;
  readonly specFile: string;
  readonly threadsFile: string;
  /** The code repo checkout, on the pull request's branch. */
  readonly cwd: string;
  readonly agent: sandcastle.RunOptions["agent"];
  readonly sandbox: sandcastle.RunOptions["sandbox"];
  readonly maxAttempts?: number;
}

export interface ReviewRunResult {
  readonly headSha: string;
  readonly fixCommits: number;
  readonly comments: AnchoredComment[];
  readonly dropped: Dropped[];
}

/** The body the host POSTs to the pull request reviews endpoint as is. */
export interface ReviewPayload {
  readonly commit_id: string;
  readonly event: "COMMENT";
  readonly body: string;
  readonly comments: AnchoredComment[];
}

/**
 * Review the checked-out branch against the base: the agent reviews, commits
 * its fixes at most once, then emits the review as structured output. Anchors
 * are checked against the diff as it stands after the fix commit, so a comment
 * can point at a line the fix added. Writes `review.json` and `replies.json`
 * to the output dir; throws on any failure, leaving the caller to record it.
 */
export async function runReview(options: ReviewRunOptions): Promise<ReviewRunResult> {
  const { inputs, cwd } = options;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();

  const threadsText = fs.readFileSync(options.threadsFile, "utf8");
  let threads;
  try {
    threads = parseThreads(threadsText);
  } catch (error) {
    throw new Error(
      `The threads file ${options.threadsFile} is malformed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!diffAgainst(inputs.baseBranch, cwd)) {
    throw new Error(`HEAD has no changes against ${inputs.baseBranch}: nothing to review.`);
  }
  const startSha = git("rev-parse", "HEAD");

  const result = await runWithExtraction({
    name: `review ${inputs.externalRef}`,
    agent: options.agent,
    sandbox: options.sandbox,
    cwd,
    logging: { type: "stdout" },
    promptFile: path.join(import.meta.dirname, "prompt.md"),
    promptArgs: {
      BRANCH: inputs.branch,
      BASE_BRANCH: inputs.baseBranch,
      EXTERNAL_REF: inputs.externalRef,
      TICKET: fileBlock("ticket", options.ticketFile),
      SPEC: fileBlock("spec", options.specFile),
      THREADS: dataBlock("threads", threadsText),
    },
    output: sandcastle.Output.object({ tag: "output", schema: ReviewOutput }),
    extractionPrompt: fs.readFileSync(path.join(import.meta.dirname, "extract.md"), "utf8"),
    maxAttempts: options.maxAttempts,
  });

  try {
    git("merge-base", "--is-ancestor", startSha, "HEAD");
  } catch {
    throw new Error(
      `Review rewrote the branch: ${startSha} is no longer an ancestor of HEAD. ` +
        "Fixes go in one new commit on top; existing commits are never amended, reset or rebased."
    );
  }
  const fixCommits = Number(git("rev-list", "--count", `${startSha}..HEAD`));
  if (fixCommits > 1) {
    throw new Error(`Review made ${fixCommits} commits; fixes go in at most one.`);
  }
  const leftovers = git("status", "--porcelain");
  if (leftovers) {
    console.warn(`\nUncommitted changes left behind (not pushed):\n${leftovers}`);
  }

  const headSha = git("rev-parse", "HEAD");
  const review = validateReview(result.output, parseDiff(diffAgainst(inputs.baseBranch, cwd)), threads);
  for (const dropped of review.dropped) {
    console.warn(`Dropped ${dropped.kind}: ${dropped.reason}: ${dropped.item.body}`);
  }

  const payload: ReviewPayload = {
    commit_id: headSha,
    event: "COMMENT",
    body: review.summary,
    comments: review.comments,
  };
  fs.mkdirSync(inputs.outputDir, { recursive: true });
  fs.writeFileSync(path.join(inputs.outputDir, "review.json"), JSON.stringify(payload, null, 2));
  fs.writeFileSync(
    path.join(inputs.outputDir, "replies.json"),
    JSON.stringify(review.replies, null, 2)
  );

  console.log(
    `\nReview written to ${inputs.outputDir}: ${review.comments.length} inline comment(s), ` +
      `${review.replies.length} reply(ies), ${review.dropped.length} dropped, ` +
      `${fixCommits} fix commit(s).`
  );

  return { headSha, fixCommits, comments: review.comments, dropped: review.dropped };
}
