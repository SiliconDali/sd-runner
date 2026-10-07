import { Writable } from "node:stream";
import { describe, it, expect } from "vitest";
import { noSandbox } from "./no-sandbox";

function sink() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, text: () => chunks.join("") };
}

describe("noSandbox", () => {
  it("keeps sandcastle's provider name and tag", () => {
    const provider = noSandbox();
    expect(provider.tag).toBe("none");
    expect(provider.name).toBe("no-sandbox");
    expect(provider.env).toEqual({});
  });

  it("forwards stderr as it arrives and keeps it for the result, exit 0 or not", async () => {
    const forwarded = sink();
    const handle = await noSandbox({ stderr: forwarded.stream }).create({
      worktreePath: process.cwd(),
      env: {},
    });
    const lines: string[] = [];

    const result = await handle.exec("echo out; echo 'sandbox disabled: test' >&2", {
      onLine: (line) => lines.push(line),
    });

    expect(result).toEqual({ stdout: "out", stderr: "sandbox disabled: test\n", exitCode: 0 });
    expect(lines).toEqual(["out"]);
    expect(forwarded.text()).toBe("sandbox disabled: test\n");
  });

  it("pipes stdin, injects env, honours cwd and reports the exit code", async () => {
    const forwarded = sink();
    const handle = await noSandbox({ stderr: forwarded.stream }).create({
      worktreePath: "/",
      env: { RUNNER_TEST_MARK: "marked" },
    });

    const result = await handle.exec('cat; echo "$RUNNER_TEST_MARK" >&2; pwd; exit 3', {
      stdin: "fed\n",
      cwd: process.cwd(),
    });

    expect(result.stdout).toBe(`fed\n${process.cwd()}\n`);
    expect(result.stderr).toBe("marked\n");
    expect(result.exitCode).toBe(3);
    expect(forwarded.text()).toBe("marked\n");
  });

  it("bounds the streamed tail it keeps, not what it forwards", async () => {
    const forwarded = sink();
    const handle = await noSandbox({ stderr: forwarded.stream, maxOutputTailChars: 8 }).create({
      worktreePath: process.cwd(),
      env: {},
    });

    const result = await handle.exec("echo first; echo second; echo third; echo 'e1' >&2; sleep 0.1; echo 'second-warning' >&2", {
      onLine: () => {},
    });

    expect(result.stdout).toBe("third");
    expect(result.stderr).toBe("second-warning\n");
    expect(forwarded.text()).toBe("e1\nsecond-warning\n");
  });
});
