import {
  run,
  StructuredOutputError,
  type OutputObjectDefinition,
  type RunOptions,
  type RunResult,
} from "@ai-hero/sandcastle";
import { buildRetryFeedback } from "./retry-feedback";
import { requireSessionId, resumeRunOptions } from "./resume-options";

/**
 * Options for {@link runWithRetry}: the standard `run()` options with `output`
 * required and a `maxAttempts` cap added.
 */
export interface RunWithRetryOptions<T> extends Omit<RunOptions, "output"> {
  /** Structured output to extract. Applied to the first call and every retry. */
  readonly output: OutputObjectDefinition<T>;
  /**
   * Total number of attempts (the first call plus retries) before giving up.
   * Default: 3, one initial call and up to two resumed retries.
   */
  readonly maxAttempts?: number;
}

/**
 * Run an agent in a single call that both does the work and emits structured
 * output, retrying the same session if extraction fails.
 *
 * Use this for side-effect-free scripts where the structured output is the
 * work (drafting a PR title and description, say). Splitting those into a
 * produce pass and an extract pass (see `runWithExtraction`) buys nothing,
 * because the drafting and the emission are the same act.
 *
 * 1. Run `prompt`/`promptFile` with the `output` definition. On the happy path
 *    this is a single call.
 * 2. If `run()` throws {@link StructuredOutputError}, resume that same session
 *    (via `error.sessionId`) with feedback describing what it emitted and why
 *    it failed. The session still holds the agent's work, so it only re-emits.
 *    Retry up to `maxAttempts` times in total.
 *
 * Throws the final {@link StructuredOutputError} if every attempt fails.
 */
export async function runWithRetry<T>(
  options: RunWithRetryOptions<T>
): Promise<RunResult & { output: T }> {
  const { output, maxAttempts = 3, ...runOptions } = options;

  let lastError: StructuredOutputError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (!lastError) {
        // First attempt: the original prompt does the work and emits output.
        return await run({ ...runOptions, output });
      }

      // Retry: resume the failed session and feed back what went wrong.
      const sessionId = requireSessionId(
        lastError.sessionId,
        "runWithRetry: the failed run carried"
      );
      return await run(
        resumeRunOptions(runOptions, {
          suffix: `retry ${attempt - 1}`,
          prompt: buildRetryFeedback(lastError, attempt, maxAttempts),
          sessionId,
          output,
        })
      );
    } catch (error) {
      if (error instanceof StructuredOutputError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}
