import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { run } from "@ai-hero/sandcastle";
import { ConfirmOutput, ReviewOutput } from "./output";
import { runReview, type ReviewRunOptions } from "./run-review";

vi.mock("@ai-hero/sandcastle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ai-hero/sandcastle")>();
  return { ...actual, run: vi.fn() };
});

const mockRun = vi.mocked(run);

let repo: string;
let out: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), content);
}

function commit(message: string) {
  git("add", "-A");
  git("commit", "-q", "-m", message);
}

function options(overrides: Partial<ReviewRunOptions> = {}): ReviewRunOptions {
  return {
    inputs: {
      branch: "feat/x",
      baseBranch: "main",
      externalRef: "REF-1",
      outputDir: out,
      model: "test-model",
    },
    ticketFile: path.join(out, "ticket.md"),
    specFile: path.join(out, "spec.md"),
    threadsFile: path.join(out, "threads.json"),
    cwd: repo,
    agent: {} as never,
    sandbox: {} as never,
    ...overrides,
  };
}

const threads = {
  threads: [
    {
      path: "src/a.ts",
      line: 2,
      comments: [
        { id: 10, author: "dev", body: "Is this right?" },
        { id: 11, author: "dev", body: "Ping." },
      ],
    },
  ],
  comments: [{ id: 99, author: "dev", body: "General note." }],
};

function produced() {
  return {
    iterations: [{ sessionId: "sess-1" }],
    stdout: "",
    commits: [],
    branch: "feat/x",
  } as never;
}

/** Sandcastle hands back the schema's parsed value, defaults applied. */
function extracted(output: unknown, schema: { parse(value: unknown): unknown } = ReviewOutput) {
  return {
    iterations: [{ sessionId: "sess-2" }],
    stdout: "",
    commits: [],
    branch: "feat/x",
    output: schema.parse(output),
  } as never;
}
const confirmed = (output: unknown) => extracted(output, ConfirmOutput);

const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(out, file), "utf8"));

beforeEach(() => {
  mockRun.mockReset();
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "review-repo-"));
  out = fs.mkdtempSync(path.join(os.tmpdir(), "review-out-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  write("src/a.ts", "one\ntwo\nthree\n");
  commit("init");
  git("checkout", "-q", "-b", "feat/x");
  write("src/a.ts", "one\nTWO\nthree\n");
  commit("change");
  fs.writeFileSync(path.join(out, "ticket.md"), "Ticket body");
  fs.writeFileSync(path.join(out, "spec.md"), "Spec body");
  fs.writeFileSync(path.join(out, "threads.json"), JSON.stringify(threads));
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

describe("runReview", () => {
  it("runs the review, validates against the post-fix diff and writes the payloads", async () => {
    mockRun
      .mockImplementationOnce(async () => {
        // The agent's one fix commit adds a file the anchors below rely on.
        write("src/a.test.ts", "test('two', () => {});\n");
        commit("test: cover two");
        return produced();
      })
      .mockResolvedValueOnce(
        extracted({
          summary: "## Review\n\nOne fix committed.",
          comments: [
            { path: "src/a.ts", line: 2, body: "Fix required: kept." },
            { path: "src/a.test.ts", line: 1, body: "Decision required: added by the fix." },
            { path: "src/a.ts", line: 3, body: "No opener." },
            { path: "src/a.ts", line: 50, body: "Hallucinated line." },
            { path: "src/nowhere.ts", line: 1, body: "Hallucinated file." },
          ],
        })
      );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runReview(options());

    const head = git("rev-parse", "HEAD");
    expect(readJson("review.json")).toEqual({
      commit_id: head,
      event: "COMMENT",
      body: "## Review\n\nOne fix committed.",
      comments: [
        { path: "src/a.ts", line: 2, side: "RIGHT", body: "Fix required: kept." },
        { path: "src/a.test.ts", line: 1, side: "RIGHT", body: "Decision required: added by the fix." },
        { path: "src/a.ts", line: 3, side: "RIGHT", body: "Fix required: No opener." },
      ],
    });
    expect(fs.existsSync(path.join(out, "replies.json"))).toBe(false);
    expect(fs.existsSync(path.join(out, "verdicts.json"))).toBe(false);
    expect(result.fixCommits).toBe(1);
    expect(result.dropped).toHaveLength(2);

    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("src/a.ts:50 (RIGHT) is not a line in the diff: Hallucinated line.");
    expect(logged).toContain("src/nowhere.ts is not in the diff");
  });

  it("feeds the ticket, spec and threads to the produce prompt as data blocks", async () => {
    mockRun
      .mockResolvedValueOnce(produced())
      .mockResolvedValueOnce(extracted({ summary: "ok" }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await runReview(options());

    const produce = mockRun.mock.calls[0]![0];
    expect(produce.promptFile).toBe(path.join(import.meta.dirname, "prompt.md"));
    expect(produce.promptArgs).toMatchObject({
      BRANCH: "feat/x",
      BASE_BRANCH: "main",
      EXTERNAL_REF: "REF-1",
      TICKET: "<ticket>\nTicket body\n</ticket>",
      SPEC: "<spec>\nSpec body\n</spec>",
    });
    expect(produce.promptArgs?.THREADS).toContain("<threads>");
    expect(produce.promptArgs?.THREADS).toContain('"id": 10');

    const extract = mockRun.mock.calls[1]![0];
    expect(extract.prompt).toContain("<output>");
    expect(readJson("review.json").comments).toEqual([]);
  });

  it("fails when the agent commits more than once", async () => {
    mockRun
      .mockImplementationOnce(async () => {
        write("b.ts", "b\n");
        commit("one");
        write("c.ts", "c\n");
        commit("two");
        return produced();
      })
      .mockResolvedValueOnce(extracted({ summary: "ok" }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runReview(options())).rejects.toThrow(/2 commits/);
    expect(fs.existsSync(path.join(out, "review.json"))).toBe(false);
  });

  it("fails when the agent rewrote the commits it was given", async () => {
    mockRun
      .mockImplementationOnce(async () => {
        write("src/a.ts", "one\nTWO!\nthree\n");
        git("commit", "-q", "-a", "--amend", "--no-edit");
        return produced();
      })
      .mockResolvedValueOnce(extracted({ summary: "ok" }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runReview(options())).rejects.toThrow(/rewrote/);
    expect(fs.existsSync(path.join(out, "review.json"))).toBe(false);
  });

  it("fails before running the agent when the branch has no diff", async () => {
    git("checkout", "-q", "main");
    await expect(
      runReview(options({ inputs: { ...options().inputs, branch: "main" } }))
    ).rejects.toThrow(/nothing to review/);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("fails before running the agent when the threads file is malformed", async () => {
    fs.writeFileSync(path.join(out, "threads.json"), '{"threads":"nope"}');
    await expect(runReview(options())).rejects.toThrow(/threads file/);
    expect(mockRun).not.toHaveBeenCalled();
  });

  describe("confirm mode", () => {
    const underConfirmation = {
      threads: [
        {
          path: "src/a.ts",
          line: 2,
          comments: [
            { id: 10, author: "bot", body: "Fix required: upper-case it." },
            { id: 11, author: "bot", body: "Fixed in `abc1234`: upper-cased." },
          ],
        },
        { path: "src/a.ts", line: 3, comments: [{ id: 20, author: "dev", body: "Is three right?" }] },
        { path: "src/a.ts", line: 1, comments: [{ id: 30, author: "bot", body: "Decision required: spec story 3." }] },
        {
          path: "src/a.ts",
          line: 1,
          comments: [
            { id: 40, author: "bot", body: "Fix required: rename." },
            { id: 41, author: "bot", body: "Not changed: the name is the spec's." },
          ],
        },
      ],
      comments: [],
    };

    beforeEach(() => {
      fs.writeFileSync(path.join(out, "threads.json"), JSON.stringify(underConfirmation));
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    it("gives the agent only the threads under confirmation, from the confirm prompt", async () => {
      mockRun.mockResolvedValueOnce(produced()).mockResolvedValueOnce(confirmed({ summary: "ok" }));

      await runReview(options({ mode: "confirm" }));

      const produce = mockRun.mock.calls[0]![0];
      expect(produce.promptFile).toBe(path.join(import.meta.dirname, "confirm-prompt.md"));
      expect(produce.promptArgs?.THREADS).toContain('"id": 10');
      expect(produce.promptArgs?.THREADS).toContain('"id": 20');
      expect(produce.promptArgs?.THREADS).not.toContain('"id": 30');
      expect(produce.promptArgs?.THREADS).not.toContain('"id": 40');
      expect(mockRun.mock.calls[1]![0].prompt).toContain("<output>");
    });

    it("writes the verdicts and a review with decision threads only, and logs an unjudged thread", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockRun.mockResolvedValueOnce(produced()).mockResolvedValueOnce(
        confirmed({
          summary: "## Verified\n\n- upper-cased.",
          verdicts: [{ comment_id: 11, verified: true, reason: "the test fails without it." }],
          comments: [{ path: "src/a.ts", line: 2, body: "the fix dropped the trailing newline." }],
        })
      );

      const result = await runReview(options({ mode: "confirm" }));

      expect(readJson("verdicts.json")).toEqual([
        { comment_id: 10, verified: true, body: "Fix verified. the test fails without it." },
      ]);
      expect(readJson("review.json").comments).toEqual([
        { path: "src/a.ts", line: 2, side: "RIGHT", body: "Decision required: the fix dropped the trailing newline." },
      ]);
      expect(result.unjudged).toEqual([20]);
      expect(result.fixCommits).toBe(0);
      expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("Unjudged thread: comment 20");
    });

    it("fails when the confirmation commits", async () => {
      mockRun
        .mockImplementationOnce(async () => {
          write("b.ts", "b\n");
          commit("sneaky");
          return produced();
        })
        .mockResolvedValueOnce(confirmed({ summary: "ok" }));

      await expect(runReview(options({ mode: "confirm" }))).rejects.toThrow(/never changes the code/);
      expect(fs.existsSync(path.join(out, "verdicts.json"))).toBe(false);
    });

    it("fails before running the agent when no thread is under confirmation", async () => {
      fs.writeFileSync(
        path.join(out, "threads.json"),
        JSON.stringify({ threads: [underConfirmation.threads[2], underConfirmation.threads[3]], comments: [] })
      );
      await expect(runReview(options({ mode: "confirm" }))).rejects.toThrow(/nothing to confirm/);
      expect(mockRun).not.toHaveBeenCalled();
    });
  });
});
