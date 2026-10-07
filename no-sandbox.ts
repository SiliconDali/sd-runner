import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { NoSandboxProvider } from "@ai-hero/sandcastle";

/**
 * Sandcastle's no-sandbox provider with one change: the agent's stderr is
 * forwarded to this process's stderr as it arrives, as well as kept for the
 * error sandcastle raises on a non-zero exit. Sandcastle's own provider only
 * keeps it, so a warning the CLI prints on a successful run (`sandbox
 * disabled: ...`, say) never reaches the log. Adapted from
 * `@ai-hero/sandcastle` (MIT); POSIX hosts only.
 *
 * `tag` and `create` are the part of the provider contract sandcastle keeps
 * out of its public type, so the return type adds them here.
 */
export interface NoSandboxOptions {
  /** Environment variables injected by this provider. Merged at launch time. */
  readonly env?: Record<string, string>;
  /** Where the agent's stderr is forwarded (default: this process's stderr). */
  readonly stderr?: NodeJS.WritableStream;
  /**
   * Characters of each stream kept for the result when `onLine` streams the
   * output (default: 64 KiB). Without `onLine` the whole output is kept.
   */
  readonly maxOutputTailChars?: number;
}

export interface ExecOptions {
  readonly onLine?: (line: string) => void;
  readonly cwd?: string;
  readonly sudo?: boolean;
  readonly stdin?: string;
}

export interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface NoSandboxHandle {
  readonly worktreePath: string;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  close(): Promise<void>;
}

export interface NoSandboxCreateOptions {
  readonly worktreePath: string;
  readonly env: Record<string, string>;
}

export type HostProvider = NoSandboxProvider & {
  readonly tag: "none";
  readonly create: (options: NoSandboxCreateOptions) => Promise<NoSandboxHandle>;
};

const MAX_TAIL_CHARS = 64 * 1024;

export function noSandbox(options: NoSandboxOptions = {}): HostProvider {
  const forward = options.stderr ?? process.stderr;
  const maxTail = options.maxOutputTailChars ?? MAX_TAIL_CHARS;

  return {
    tag: "none",
    name: "no-sandbox",
    env: options.env ?? {},
    create: async ({ worktreePath, env }) => {
      const processEnv = { ...process.env, ...env };
      return {
        worktreePath,
        exec: (command, opts = {}) =>
          new Promise<ExecResult>((resolve, reject) => {
            const proc = spawn("sh", ["-c", command], {
              cwd: opts.cwd ?? worktreePath,
              env: processEnv,
              stdio: ["pipe", "pipe", "pipe"],
            });
            proc.stdin.end(opts.stdin);
            proc.on("error", (error) => {
              reject(new Error(`exec failed: ${error.message}`));
            });

            const streaming = opts.onLine !== undefined;
            const stdout = new Tail(streaming ? maxTail : Infinity, streaming ? "\n" : "");
            const stderr = new Tail(streaming ? maxTail : Infinity, "");
            if (opts.onLine) {
              const onLine = opts.onLine;
              createInterface({ input: proc.stdout }).on("line", (line) => {
                stdout.push(line);
                onLine(line);
              });
            } else {
              proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk.toString()));
            }
            proc.stderr.on("data", (chunk: Buffer) => {
              stderr.push(chunk.toString());
              forward.write(chunk);
            });
            proc.on("close", (code) => {
              resolve({ stdout: stdout.toString(), stderr: stderr.toString(), exitCode: code ?? 0 });
            });
          }),
        close: async () => {},
      };
    },
  };
}

/** The last `max` characters of what was pushed, oldest pieces dropped whole. */
class Tail {
  private pieces: string[] = [];
  private size = 0;

  constructor(
    private readonly max: number,
    private readonly separator: string
  ) {}

  push(piece: string): void {
    this.pieces.push(piece);
    this.size += piece.length + this.separator.length;
    while (this.size > this.max && this.pieces.length > 1) {
      this.size -= (this.pieces.shift() as string).length + this.separator.length;
    }
  }

  toString(): string {
    return this.pieces.join(this.separator);
  }
}
