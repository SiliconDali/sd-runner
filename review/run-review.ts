import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { dataBlock } from "../data-block";
import { fileBlock, type RunInputs } from "../prompt-args";
import { runWithExtraction } from "../run-with-extraction";
import { diffAgainst, parseDiff } from "./diff";
import { ConfirmOutput, ReviewOutput } from "./output";
import { confirmScope, OPENERS, parseThreads, selectThreads, type Threads } from "./threads";
import {
  validateComments,
  validateVerdicts,
  type AnchoredComment,
  type Dropped,
  type PostedVerdict,
} from "./validate";

/**
 * `review` reviews the whole diff, fixes what it proves broken and opens
 * threads. `confirm` judges the threads under confirmation on HEAD, read-only,
 * and opens a thread only on a fault in the commits since the review.
 */
export type ReviewMode = "review" | "confirm";

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
  readonly mode?: ReviewMode;
}

export interface ReviewRunResult {
  readonly headSha: string;
  readonly fixCommits: number;
  readonly comments: AnchoredComment[];
  readonly dropped: Dropped[];
  /** Confirm mode only: one per thread judged. */
  readonly verdicts: PostedVerdict[];
  /** Confirm mode only: threads given and left without a verdict, by first comment id. */
  readonly unjudged: number[];
}

/** The body the host POSTs to the pull request reviews endpoint as is. */
export interface ReviewPayload {
  readonly commit_id: string;
  readonly event: "COMMENT";
  readonly body: string;
  readonly comments: AnchoredComment[];
}

function readThreads(file: string): Threads {
  try {
    return parseThreads(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `The threads file ${file} is malformed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Review the checked-out branch against the base: the agent reviews, commits
 * its fixes at most once, then emits the review as structured output. Anchors
 * are checked against the diff as it stands after the fix commit, so a comment
 * can point at a line the fix added. Every thread it opens says who acts on
 * it next (`Fix required:` or `Decision required:`). Writes `review.json` to
 * the output dir; in confirm mode `verdicts.json` too, and the agent may not
 * commit. Throws on any failure, leaving the caller to record it.
 */
export async function runReview(options: ReviewRunOptions): Promise<ReviewRunResult> {
  const { inputs, cwd } = options;
  const mode: ReviewMode = options.mode ?? "review";
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();

  const all = readThreads(options.threadsFile);
  // The review sees every open thread, so it skips a point one covers. The
  // confirmation sees only what it judges, so every thread it gets needs a verdict.
  const threads = mode === "confirm" ? selectThreads(all, confirmScope) : all;
  if (mode === "confirm" && threads.threads.length === 0) {
    throw new Error(`The threads file ${options.threadsFile} has no thread under confirmation: nothing to confirm.`);
  }

  if (!diffAgainst(inputs.baseBranch, cwd)) {
    throw new Error(`HEAD has no changes against ${inputs.baseBranch}: nothing to review.`);
  }
  const startSha = git("rev-parse", "HEAD");
  const threadsText = JSON.stringify(threads, null, 2);

  const prompt = mode === "confirm" ? "confirm-prompt.md" : "prompt.md";
  const extract = mode === "confirm" ? "confirm-extract.md" : "extract.md";
  const schema = mode === "confirm" ? ConfirmOutput : ReviewOutput;
  const result = await runWithExtraction({
    name: `${mode} ${inputs.externalRef}`,
    agent: options.agent,
    sandbox: options.sandbox,
    cwd,
    logging: { type: "stdout" },
    promptFile: path.join(import.meta.dirname, prompt),
    promptArgs: {
      BRANCH: inputs.branch,
      BASE_BRANCH: inputs.baseBranch,
      EXTERNAL_REF: inputs.externalRef,
      TICKET: fileBlock("ticket", options.ticketFile),
      SPEC: fileBlock("spec", options.specFile),
      THREADS: dataBlock("threads", threadsText),
    },
    output: sandcastle.Output.object({ tag: "output", schema }),
    extractionPrompt: fs.readFileSync(path.join(import.meta.dirname, extract), "utf8"),
    maxAttempts: options.maxAttempts,
  });

  try {
    git("merge-base", "--is-ancestor", startSha, "HEAD");
  } catch {
    throw new Error(
      `${mode === "confirm" ? "The confirmation" : "Review"} rewrote the branch: ${startSha} is no longer an ancestor of HEAD. ` +
        "Existing commits are never amended, reset or rebased."
    );
  }
  const fixCommits = Number(git("rev-list", "--count", `${startSha}..HEAD`));
  if (mode === "confirm" && fixCommits > 0) {
    throw new Error(`The confirmation made ${fixCommits} commit(s); it judges and never changes the code.`);
  }
  if (fixCommits > 1) {
    throw new Error(`Review made ${fixCommits} commits; fixes go in at most one.`);
  }
  const leftovers = git("status", "--porcelain");
  if (leftovers) {
    console.warn(`\nUncommitted changes left behind (not pushed):\n${leftovers}`);
  }

  const headSha = git("rev-parse", "HEAD");
  const diff = parseDiff(diffAgainst(inputs.baseBranch, cwd));
  const openers =
    mode === "confirm"
      ? [OPENERS.decisionRequired]
      : [OPENERS.fixRequired, OPENERS.decisionRequired];
  const fallback = mode === "confirm" ? OPENERS.decisionRequired : OPENERS.fixRequired;
  const validated = validateComments(result.output.comments, diff, openers, fallback);
  const dropped: Dropped[] = [...validated.dropped];

  let verdicts: PostedVerdict[] = [];
  let unjudged: number[] = [];
  if (mode === "confirm") {
    const judged = validateVerdicts((result.output as ConfirmOutput).verdicts, threads);
    verdicts = judged.verdicts;
    unjudged = judged.unjudged;
    dropped.push(...judged.dropped);
    for (const root of unjudged) {
      console.warn(`Unjudged thread: comment ${root} got no verdict`);
    }
  }
  for (const item of dropped) {
    const what = "body" in item.item ? item.item.body : JSON.stringify(item.item);
    console.warn(`Dropped ${item.kind}: ${item.reason}: ${what}`);
  }

  const payload: ReviewPayload = {
    commit_id: headSha,
    event: "COMMENT",
    body: result.output.summary,
    comments: validated.comments,
  };
  fs.mkdirSync(inputs.outputDir, { recursive: true });
  fs.writeFileSync(path.join(inputs.outputDir, "review.json"), JSON.stringify(payload, null, 2));
  if (mode === "confirm") {
    fs.writeFileSync(path.join(inputs.outputDir, "verdicts.json"), JSON.stringify(verdicts, null, 2));
  }

  console.log(
    `\n${mode === "confirm" ? "Confirmation" : "Review"} written to ${inputs.outputDir}: ` +
      `${validated.comments.length} inline comment(s), ` +
      (mode === "confirm" ? `${verdicts.length} verdict(s), ${unjudged.length} unjudged, ` : "") +
      `${dropped.length} dropped, ${fixCommits} fix commit(s).`
  );

  return { headSha, fixCommits, comments: validated.comments, dropped, verdicts, unjudged };
}
