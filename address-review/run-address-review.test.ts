import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { run } from "@ai-hero/sandcastle";
import { AddressReviewOutput } from "./output";
import { runAddressReview, type AddressReviewRunOptions } from "./run-address-review";

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

function options(overrides: Partial<AddressReviewRunOptions> = {}): AddressReviewRunOptions {
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

/** Two unresolved threads and one conversation comment. */
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
    { path: "src/a.ts", line: 3, comments: [{ id: 20, author: "reviewer", body: "Rename this." }] },
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
function extracted(output: unknown) {
  return {
    iterations: [{ sessionId: "sess-2" }],
    stdout: "",
    commits: [],
    branch: "feat/x",
    output: AddressReviewOutput.parse(output),
  } as never;
}

const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(out, file), "utf8"));
const outputExists = (file: string) => fs.existsSync(path.join(out, file));

let warn: MockInstance;
const logged = () => warn.mock.calls.map((c) => c.join(" ")).join("\n");

beforeEach(() => {
  mockRun.mockReset();
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "address-review-repo-"));
  out = fs.mkdtempSync(path.join(os.tmpdir(), "address-review-out-"));
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
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

describe("runAddressReview", () => {
  it("accepts one fix commit and writes the replies, one per thread, at the thread's first comment", async () => {
    mockRun
      .mockImplementationOnce(async () => {
        write("src/a.test.ts", "test('two', () => {});\n");
        commit("test: cover two");
        return produced();
      })
      .mockResolvedValueOnce(
        extracted({
          summary: "## Addressed\n\nOne fix committed.",
          replies: [
            { comment_id: 11, body: "Fixed in `abc1234`: covered by a test." },
            { comment_id: 20, body: "Not changed: the name follows the module's convention." },
          ],
        })
      );

    const result = await runAddressReview(options());

    expect(readJson("replies.json")).toEqual([
      { comment_id: 10, body: "Fixed in `abc1234`: covered by a test." },
      { comment_id: 20, body: "Not changed: the name follows the module's convention." },
    ]);
    expect(fs.readFileSync(path.join(out, "summary.md"), "utf8")).toBe(
      "## Addressed\n\nOne fix committed."
    );
    expect(result.fixCommits).toBe(1);
    expect(result.headSha).toBe(git("rev-parse", "HEAD"));
    expect(result.dropped).toEqual([]);
    expect(result.unanswered).toEqual([]);
  });

  it("accepts zero commits when every thread is declined, and still writes the replies", async () => {
    mockRun.mockResolvedValueOnce(produced()).mockResolvedValueOnce(
      extracted({
        summary: "Nothing changed.",
        replies: [
          { comment_id: 10, body: "Not changed: the test for this passes." },
          { comment_id: 20, body: "Not changed: left for the dev." },
        ],
      })
    );

    const result = await runAddressReview(options());

    expect(result.fixCommits).toBe(0);
    expect(readJson("replies.json")).toEqual([
      { comment_id: 10, body: "Not changed: the test for this passes." },
      { comment_id: 20, body: "Not changed: left for the dev." },
    ]);
  });

  it("feeds the ticket, spec and threads to the produce prompt as data blocks", async () => {
    mockRun
      .mockResolvedValueOnce(produced())
      .mockResolvedValueOnce(extracted({ summary: "ok", replies: [] }));

    await runAddressReview(options());

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
    expect(produce.promptArgs?.THREADS).toContain('"id": 20');

    const extract = mockRun.mock.calls[1]![0];
    expect(extract.prompt).toContain("<output>");
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

    await expect(runAddressReview(options())).rejects.toThrow(/2 commits/);
    expect(outputExists("replies.json")).toBe(false);
  });

  it("fails when the agent rewrote the commits it was given", async () => {
    mockRun
      .mockImplementationOnce(async () => {
        write("src/a.ts", "one\nTWO!\nthree\n");
        git("commit", "-q", "-a", "--amend", "--no-edit");
        return produced();
      })
      .mockResolvedValueOnce(extracted({ summary: "ok" }));

    await expect(runAddressReview(options())).rejects.toThrow(/rewrote/);
    expect(outputExists("replies.json")).toBe(false);
  });

  it("drops a reply to an unknown comment id, or to a conversation comment, and logs it", async () => {
    mockRun.mockResolvedValueOnce(produced()).mockResolvedValueOnce(
      extracted({
        summary: "ok",
        replies: [
          { comment_id: 10, body: "Not changed: fine as is." },
          { comment_id: 20, body: "Not changed: fine as is." },
          { comment_id: 7, body: "Unknown." },
          { comment_id: 99, body: "Conversation, not a thread." },
        ],
      })
    );

    const result = await runAddressReview(options());

    expect(readJson("replies.json")).toEqual([
      { comment_id: 10, body: "Not changed: fine as is." },
      { comment_id: 20, body: "Not changed: fine as is." },
    ]);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      "comment 7 is not in an open review thread",
      "comment 99 is not in an open review thread",
    ]);
    expect(logged()).toContain("Dropped reply: comment 7 is not in an open review thread: Unknown.");
    expect(logged()).toContain("Dropped reply: comment 99 is not in an open review thread");
  });

  it("joins two replies aimed at one thread into one, at the thread's first comment", async () => {
    mockRun.mockResolvedValueOnce(produced()).mockResolvedValueOnce(
      extracted({
        summary: "ok",
        replies: [
          { comment_id: 11, body: "Not changed: first part." },
          { comment_id: 10, body: "Second part." },
          { comment_id: 20, body: "Not changed: fine." },
        ],
      })
    );

    await runAddressReview(options());

    expect(readJson("replies.json")).toEqual([
      { comment_id: 10, body: "Not changed: first part.\n\nSecond part." },
      { comment_id: 20, body: "Not changed: fine." },
    ]);
  });

  it("logs a fetched thread the agent left without a reply", async () => {
    mockRun
      .mockResolvedValueOnce(produced())
      .mockResolvedValueOnce(
        extracted({ summary: "ok", replies: [{ comment_id: 11, body: "Not changed: fine." }] })
      );

    const result = await runAddressReview(options());

    expect(result.unanswered).toEqual([{ comment_id: 20, path: "src/a.ts", line: 3 }]);
    expect(logged()).toContain("Unanswered thread: comment 20 at src/a.ts:3 got no reply");
    expect(readJson("replies.json")).toEqual([{ comment_id: 10, body: "Not changed: fine." }]);
  });

  it("keeps threads closed by a bot's last word and decision threads from the agent, and never counts them unanswered", async () => {
    const withOthers = {
      ...threads,
      threads: [
        ...threads.threads,
        {
          path: "src/a.ts",
          line: 9,
          comments: [
            { id: 30, author: "reviewer", body: "Fix required: drop this." },
            { id: 31, author: "bot", body: "Not changed: out of scope." },
          ],
        },
        { path: "src/a.ts", line: 1, comments: [{ id: 40, author: "reviewer", body: "Decision required: spec story 3." }] },
      ],
    };
    fs.writeFileSync(path.join(out, "threads.json"), JSON.stringify(withOthers));
    mockRun.mockResolvedValueOnce(produced()).mockResolvedValueOnce(
      extracted({
        summary: "ok",
        replies: [
          { comment_id: 10, body: "Not changed: fine." },
          { comment_id: 20, body: "Fixed in `abc1234`: renamed." },
        ],
      })
    );

    const result = await runAddressReview(options());

    expect(result.unanswered).toEqual([]);
    expect(logged()).not.toContain("comment 30");
    const given = mockRun.mock.calls[0]![0].promptArgs?.THREADS;
    expect(given).toContain('"id": 10');
    expect(given).not.toContain('"id": 30');
    expect(given).not.toContain('"id": 40');
  });

  it("fails before running the agent when no thread is the fixer's work", async () => {
    fs.writeFileSync(
      path.join(out, "threads.json"),
      JSON.stringify({
        threads: [{ path: "a", line: 1, comments: [{ id: 40, body: "Decision required: spec story 3." }] }],
        comments: [{ id: 99, body: "General note." }],
      })
    );
    await expect(runAddressReview(options())).rejects.toThrow(/nothing to address/);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("fails before running the agent when the threads file is malformed", async () => {
    fs.writeFileSync(path.join(out, "threads.json"), '{"threads":"nope"}');
    await expect(runAddressReview(options())).rejects.toThrow(/threads file .* is malformed/);
    expect(mockRun).not.toHaveBeenCalled();
  });
});
