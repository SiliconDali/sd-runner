import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { dataBlock } from "../data-block";
import { fileBlock, type RunInputs } from "../prompt-args";
import { runWithExtraction } from "../run-with-extraction";
import type { ThreadReply } from "../review/output";
import { fixerWork, parseThreads, selectThreads, type Threads } from "../review/threads";
import { validateReplies, type Dropped } from "../review/validate";
import { AddressReviewOutput } from "./output";

export interface AddressReviewRunOptions {
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

/** A fetched review thread the agent left without a reply. */
export interface UnansweredThread {
  readonly comment_id: number;
  readonly path: unknown;
  readonly line: unknown;
}

export interface AddressReviewRunResult {
  readonly headSha: string;
  readonly fixCommits: number;
  readonly replies: ThreadReply[];
  readonly dropped: Dropped[];
  readonly unanswered: UnansweredThread[];
}

/**
 * Address the review threads that are the fixer's work on the checked-out
 * branch: the agent fixes or declines each one, commits its fixes at most
 * once, then emits one reply per thread as structured output. A
 * `Decision required:` thread the developer has not answered yet, or one a
 * bot's last word closed, is left out before the agent sees it. Writes
 * `replies.json` (one entry per thread at its first comment) and `summary.md`
 * to the output dir; throws on any failure, leaving the caller to record it.
 */
export async function runAddressReview(
  options: AddressReviewRunOptions
): Promise<AddressReviewRunResult> {
  const { inputs, cwd } = options;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();

  let threads: Threads;
  try {
    threads = selectThreads(parseThreads(fs.readFileSync(options.threadsFile, "utf8")), fixerWork);
  } catch (error) {
    throw new Error(
      `The threads file ${options.threadsFile} is malformed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (threads.threads.length === 0) {
    throw new Error(`The threads file ${options.threadsFile} has no thread for the fixer: nothing to address.`);
  }
  const threadsText = JSON.stringify(threads, null, 2);

  const startSha = git("rev-parse", "HEAD");

  const result = await runWithExtraction({
    name: `address-review ${inputs.externalRef}`,
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
    output: sandcastle.Output.object({ tag: "output", schema: AddressReviewOutput }),
    extractionPrompt: fs.readFileSync(path.join(import.meta.dirname, "extract.md"), "utf8"),
    maxAttempts: options.maxAttempts,
  });

  try {
    git("merge-base", "--is-ancestor", startSha, "HEAD");
  } catch {
    throw new Error(
      `The fixer rewrote the branch: ${startSha} is no longer an ancestor of HEAD. ` +
        "Fixes go in one new commit on top; existing commits are never amended, reset or rebased."
    );
  }
  const fixCommits = Number(git("rev-list", "--count", `${startSha}..HEAD`));
  if (fixCommits > 1) {
    throw new Error(`The fixer made ${fixCommits} commits; fixes go in at most one.`);
  }
  const leftovers = git("status", "--porcelain");
  if (leftovers) {
    console.warn(`\nUncommitted changes left behind (not pushed):\n${leftovers}`);
  }

  const headSha = git("rev-parse", "HEAD");
  const validated = validateReplies(result.output.replies, threads);
  for (const dropped of validated.dropped) {
    console.warn(`Dropped ${dropped.kind}: ${dropped.reason}: ${"body" in dropped.item ? dropped.item.body : JSON.stringify(dropped.item)}`);
  }
  const answered = new Set(validated.replies.map((reply) => reply.comment_id));
  const unanswered: UnansweredThread[] = threads.threads
    .map((thread) => ({ comment_id: thread.comments[0]!.id, path: thread.path, line: thread.line }))
    .filter((thread) => !answered.has(thread.comment_id));
  for (const thread of unanswered) {
    console.warn(
      `Unanswered thread: comment ${thread.comment_id} at ${String(thread.path)}:${String(thread.line)} got no reply`
    );
  }

  fs.mkdirSync(inputs.outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(inputs.outputDir, "replies.json"),
    JSON.stringify(validated.replies, null, 2)
  );
  fs.writeFileSync(path.join(inputs.outputDir, "summary.md"), result.output.summary);

  console.log(
    `\nReplies written to ${inputs.outputDir}: ${validated.replies.length} reply(ies), ` +
      `${validated.dropped.length} dropped, ${unanswered.length} thread(s) unanswered, ` +
      `${fixCommits} fix commit(s).`
  );

  return { headSha, fixCommits, replies: validated.replies, dropped: validated.dropped, unanswered };
}
