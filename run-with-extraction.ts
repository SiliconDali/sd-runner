import {
  run,
  type OutputObjectDefinition,
  type RunOptions,
  type RunResult,
} from "@ai-hero/sandcastle";
import { runWithRetry } from "./run-with-retry";

/**
 * Options for {@link runWithExtraction}: the standard `run()` options, with
 * `output` separated out and an `extractionPrompt` added.
 *
 * The `output` definition is not applied to the produce run; it is applied to
 * the extraction run(s) instead.
 */
export interface RunWithExtractionOptions<T> extends Omit<
  RunOptions,
  "output"
> {
  /** Structured output to extract during the extraction pass. */
  readonly output: OutputObjectDefinition<T>;
  /**
   * Prompt for the extraction pass, sent after resuming the produce session.
   * Must contain the configured opening tag literal (e.g. `<output>`), since
   * sandcastle requires the resolved prompt to contain it.
   */
  readonly extractionPrompt: string;
  /** Maximum number of extraction attempts before giving up. Default: 3. */
  readonly maxAttempts?: number;
}

/**
 * Run an agent in two phases to make structured output reliable.
 *
 * Asking the agent to both do the work and emit rigid JSON in one turn is
 * brittle: it returns malformed JSON or omits the tag, and a single failure
 * aborts the run. This wrapper splits the two, which matters when the produce
 * phase has side effects that must not be repeated (commits, say):
 *
 * 1. Produce. Run the agent on `prompt`/`promptFile` with no `output`
 *    definition, so `run()` never throws on extraction and the resumable
 *    `sessionId` is kept. The produce prompt carries no JSON instructions.
 * 2. Extract. Resume that session with `extractionPrompt` and the `output`
 *    definition, retrying via {@link runWithRetry}: the first attempt resumes
 *    the produce session; any retry resumes the failed extraction's own
 *    session with feedback, so the correction happens in context.
 *
 * Returns the produce run's result (commits, branch, stdout) with the
 * extraction run's `output`. Extraction must not commit, so the produce
 * commits are the source of truth for callers that inspect `commits`.
 *
 * Throws the final `StructuredOutputError` if every attempt fails.
 *
 * For side-effect-free scripts where the output is the work, prefer
 * {@link runWithRetry} directly.
 */
export async function runWithExtraction<T>(
  options: RunWithExtractionOptions<T>
): Promise<RunResult & { output: T }> {
  const { output, extractionPrompt, maxAttempts, ...produceOptions } = options;

  const produce = await run(produceOptions);

  const sessionId = produce.iterations.at(-1)?.sessionId;
  if (!sessionId) {
    throw new Error(
      "runWithExtraction: produce run returned no sessionId, so the extraction " +
        "pass cannot resume it. Session capture must be enabled (Claude Code " +
        "provider with sessions written to the host)."
    );
  }

  // The extraction pass uses an inline `prompt`, so drop the produce phase's
  // `promptArgs`: sandcastle only allows promptArgs alongside a promptFile.
  const { promptArgs: _produceArgs, ...extractionOptions } = produceOptions;

  const extraction = await runWithRetry({
    ...extractionOptions,
    name: produceOptions.name ? `${produceOptions.name} (extract)` : undefined,
    promptFile: undefined,
    prompt: extractionPrompt,
    resumeSession: sessionId,
    output,
    maxAttempts,
  });

  return { ...produce, output: extraction.output };
}
