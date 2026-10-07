/**
 * The reason a run records when it fails on a thrown error.
 *
 * When the CLI crashes, its stderr carries numbered source lines, a line of
 * the minified bundle and a stack trace around the one `error:` line that
 * says what happened, and sandcastle puts all of it after its own
 * `<agent> exited with code N:` header. The reason keeps the header and the
 * `error:` line; the full stderr is already in the log, forwarded as it was
 * printed. Anything else passes through unchanged.
 */
export function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return trimCliCrash(message);
}

const EXIT_HEADER = /exited with code \d+:\s*$/;
const SOURCE_LINE = /^\s*\d+ \| /;
const STACK_FRAME = /^\s*at .+:\d+:\d+\)?\s*$/;
const ERROR_LINE = /^\s*error:/i;

export function trimCliCrash(message: string): string {
  const lines = message.split("\n");
  const errorAt = lines.findIndex((line) => ERROR_LINE.test(line));
  const crashed = lines.some((line) => SOURCE_LINE.test(line) || STACK_FRAME.test(line));
  if (errorAt === -1 || !crashed) return message;

  const kept: string[] = [];
  const header = lines[0];
  if (header !== undefined && errorAt > 0 && EXIT_HEADER.test(header)) kept.push(header);
  for (const line of lines.slice(errorAt)) {
    if (!line.trim() || STACK_FRAME.test(line)) break;
    kept.push(line);
  }
  return kept.join("\n");
}
