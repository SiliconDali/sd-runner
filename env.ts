import * as fs from "node:fs";
import * as path from "node:path";

/** Read an environment variable the run cannot do without. */
export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

/** Read an environment variable, falling back when unset or empty. */
export function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/**
 * Record why the run failed where the host workflow can read it
 * (`<outputDir>/failure_reason.txt`), then exit non-zero.
 */
export function fail(outputDir: string, message: string): never {
  console.error(`\nFAILED: ${message}`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "failure_reason.txt"), message);
  process.exit(1);
}
