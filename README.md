# runner

What an unattended run executes: the scripts that drive Claude Code through [sandcastle](https://github.com/mattpocock/sandcastle), their prompts, the policy Claude Code reads above every other settings level, and the two shell scripts that install that policy and neutralise a checkout's project settings. A host workflow checks this repo out at a pinned commit and calls into here; nothing in this directory knows which tracker, repository or organisation the host serves.

## Layout

- `implement/`: implement a ticket on a branch and commit. `write-pr/`: draft a pull request title and description from the diff, as structured output. `review/`: review a pull request's branch with the `code-review` skill, commit fixes at most once, and emit the review as payloads the host posts.
- `run-with-retry.ts`, `run-with-extraction.ts`, `retry-feedback.ts`: wrappers over sandcastle's `run()` that resume the agent's session with feedback when structured output fails validation.
- `policy/`: `managed-settings.json` (hooks off, web and MCP tools denied, pinned env, sandbox with a strict one-host allowlist and the credential unset for sandboxed commands) and `managed-mcp.json` (no servers).
- `bin/`: `install-runner-policy.sh`, `neutralise-checkout-settings.sh`, `test.sh`.

## Inputs and outputs

Each script reads its inputs from the environment and runs from the checkout's root. All read `BRANCH`, `BASE_BRANCH`, `EXTERNAL_REF`, `OUTPUT_DIR` and `MODEL`; `implement` also reads `TICKET_FILE`, `SPEC_FILE` and `SIBLINGS_FILE`, `review` reads `TICKET_FILE`, `SPEC_FILE` and `THREADS_FILE`, and `write-pr` reads `TICKET_FILE` only:

| Variable | Meaning |
| --- | --- |
| `BRANCH` | branch to work on, already checked out |
| `BASE_BRANCH` | branch it was cut from and merges into; for `review`, any ref that resolves in the checkout (`origin/main`, say), since the script diffs `BASE_BRANCH...HEAD` |
| `EXTERNAL_REF` | opaque reference to the work in the host's system |
| `TICKET_FILE`, `SPEC_FILE`, `SIBLINGS_FILE` | files the host fetched before the run; each reaches the prompt as a tagged data block (`<ticket>`, `<spec>`, `<siblings>`); `write-pr` takes the ticket only |
| `THREADS_FILE` | `review` only: the pull request's existing discussion as JSON (shape below), fetched before the run; reaches the prompt as `<threads>` |
| `OUTPUT_DIR` | where results go (default: the OS temp dir) |
| `MODEL` | Claude model id (default in `prompt-args.ts`) |

The Claude credential is not read by the scripts: Claude Code inherits it from the step's environment. Outputs land in `OUTPUT_DIR`: `pr_title.txt` and `pr_description.txt` from `write-pr`, `review.json` and `replies.json` from `review`, and `failure_reason.txt` from any script that fails, for the host to post. A failed script exits 1 after writing `failure_reason.txt`; a missing required variable exits 1 without it.

## Review

`review` runs the `code-review` skill against `BASE_BRANCH`. Correctness findings get a test that breaks on the bug and a fix; every fix lands in a single commit in the code repo's own convention, and more than one commit fails the run. Missing spec coverage is reported, never coded. A second, resumed pass extracts the review as structured output, which the script validates against `git diff BASE_BRANCH...HEAD` taken after the fix commit, so a comment can sit on a line the fix added.

`THREADS_FILE` holds unresolved review threads, each with its comments first to last, and the conversation comments. Extra fields are ignored; write `{"threads": [], "comments": []}` when there are none:

```json
{
  "threads": [
    {
      "path": "src/a.ts",
      "line": 12,
      "comments": [{ "id": 101, "author": "dev", "body": "Why this?" }]
    }
  ],
  "comments": [{ "id": 202, "author": "dev", "body": "General note." }]
}
```

`id` is the REST id of a review comment (in a thread) or of a conversation comment. The GraphQL `reviewThreads` connection gives `isResolved` and each comment's `databaseId`, which is the REST id.

Outputs:

- `review.json`: the body for `POST /repos/{owner}/{repo}/pulls/{number}/reviews`, as is (`gh api ... --input review.json`). `commit_id` is `HEAD` after the fix commit, so push before posting.

  ```json
  {
    "commit_id": "<sha>",
    "event": "COMMENT",
    "body": "Markdown summary",
    "comments": [{ "path": "src/a.ts", "line": 12, "side": "RIGHT", "body": "..." }]
  }
  ```

- `replies.json`: `[{ "comment_id": 101, "body": "..." }]`, one `POST /repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies` with `body` per entry. `comment_id` is already the thread's first comment, which that endpoint requires.

Validation drops, and logs as `Dropped comment: ...` or `Dropped reply: ...`, every inline comment whose file is not in the diff or whose line is not an added or context line of a hunk on its side (`RIGHT` unless the agent chose `LEFT` for a deleted line), and every reply whose `comment_id` is not in a fetched review thread. Conversation comments cannot be replied to inline; the agent answers them in the summary.

## Wiring a host workflow

1. Check this repo out at a pinned commit and run `npm ci --prefix runner`.
2. `sudo runner/bin/install-runner-policy.sh` before the agent step (`--no-sandbox` for a controls-only run). It writes to `/etc/claude-code/`; override with `DESTDIR`.
3. `runner/bin/neutralise-checkout-settings.sh <checkout>` so no project `env`, hook or helper command reaches the CLI while `CLAUDE.md`, `AGENTS.md` and the skills beside them still load.
4. From the checkout, run the scripts with the fork's own tsx, with only the Claude credential, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` and the variables above in the step's environment:

```
node <fork>/runner/node_modules/.bin/tsx <fork>/runner/implement/implement.ts
node <fork>/runner/node_modules/.bin/tsx <fork>/runner/write-pr/write-pr.ts
node <fork>/runner/node_modules/.bin/tsx <fork>/runner/review/review.ts
```

The host pushes the branch and opens the pull request itself, after the scripts finish, and posts `review`'s payloads the same way; the agent never holds a token for that.

## Tests

`npm run check --prefix runner` runs the typecheck, the vitest suite (wrappers and the review flow with sandcastle's `run` mocked, output schemas, the diff anchor index, data blocks, prompt placeholders) and `bin/test.sh` (both shell scripts against throwaway git repos and a `DESTDIR`).

The wrappers and their tests are adapted from [mattpocock/course-video-manager](https://github.com/mattpocock/course-video-manager) (MIT).
