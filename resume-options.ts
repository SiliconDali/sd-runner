import type { OutputObjectDefinition, RunOptions } from "@ai-hero/sandcastle";

/**
 * Throw the shared "cannot resume" error when a run carried no sessionId.
 * `context` names the caller and what it was about to do.
 */
export function requireSessionId(
  sessionId: string | undefined,
  context: string
): string {
  if (!sessionId) {
    throw new Error(
      `${context} no sessionId, so it cannot be resumed. Session capture must ` +
        "be enabled (Claude Code provider with sessions written to the host)."
    );
  }
  return sessionId;
}

/**
 * Build the options for resuming a session with an inline prompt. Drops
 * `promptArgs` (sandcastle only allows it alongside a promptFile), clears
 * `promptFile`, suffixes the run name, and attaches the output definition.
 */
export function resumeRunOptions<T>(
  runOptions: Omit<RunOptions, "output">,
  resume: {
    readonly suffix: string;
    readonly prompt: string;
    readonly sessionId: string;
    readonly output: OutputObjectDefinition<T>;
  }
): Omit<RunOptions, "output"> & { readonly output: OutputObjectDefinition<T> } {
  const { promptArgs: _dropped, ...options } = runOptions;
  return {
    ...options,
    name: runOptions.name ? `${runOptions.name} (${resume.suffix})` : undefined,
    promptFile: undefined,
    prompt: resume.prompt,
    resumeSession: resume.sessionId,
    output: resume.output,
  };
}
