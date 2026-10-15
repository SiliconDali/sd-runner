# sd-runner

What an unattended run executes: the scripts that drive Claude Code through [sandcastle](https://github.com/mattpocock/sandcastle), their prompts, the policy Claude Code reads above every other settings level, the shell script that prepares a host (Claude Code at the locked version, that policy, the checkout's project settings neutralised), and the skills a run loads when the code repo has none of its own. A host workflow checks this repo out at a full commit SHA and calls into here; nothing in this repo knows which tracker, repository or organisation the host serves.

## Public repo

This repo is public so a host needs no read credential and the team whose code a run touches can audit exactly what runs. So nothing committed here (code, prompts, docs, tests, fixtures, commit messages, changesets) names a client, a client's repository or a client's tracker. Examples use placeholders (`src/a.ts`, `dev`, `<sha>`); host-specific values arrive at run time through the inputs below.

## Host contract

The host is whatever runs the scripts: a CI workflow, a self-hosted runner, a person at a terminal. Between host and scripts there are only environment variables and files:

- **Before:** on an Ubuntu host with `sudo` and `jq` (the policy install uses `apt-get` and an Ubuntu AppArmor sysctl, below), `npm ci` here, then `bin/prepare-host.sh <checkout>` as the user the agent runs as. It puts Claude Code at the version `package-lock.json` pins (with its integrity hash) on `PATH` as `claude`, installs the runner policy to `/etc/claude-code/` with bubblewrap, socat and ripgrep, prints the configured sandbox, and neutralises the checkout's project settings. The steps that need root go through `sudo`.
- **In:** environment variables, and files whose paths those variables name. The host fetches everything a run reads (ticket, spec, siblings, review threads) before the run and writes it to files; the scripts never fetch.
- **Out:** files in `OUTPUT_DIR`, which the host reads back and acts on after the script exits: pushing the branch, opening the pull request, posting the review, recording a failure.
- **Never:** a tracker or code-host API call from anything in this repo, and never a GitHub token in a script's environment. The only credential a run holds is Claude's, which Claude Code inherits from the environment; the scripts do not read it.

Outputs are neutral text and JSON a host maps onto its own system, with one known exception: the review body. `review.json` is already the body of GitHub's create-review API call, so the review's output stays GitHub-shaped until a second code host is real. `replies.json` from `address-review` and `verdicts.json` from `review` in confirm mode are host-neutral: each entry is the id the host gave a comment in the threads file plus a body (and, in `verdicts.json`, `verified`), and the host maps it onto its own reply endpoint. Inputs and outputs per script are listed below.

## Layout

- `implement/`: implement a ticket on a branch and commit; `diagnostics.md` is the optional section a host can switch on for one run (below). `write-pr/`: draft a pull request title and description from the diff, as structured output. `review/`: review a pull request's branch with the `code-review` skill, commit fixes at most once, and emit the review as payloads the host posts; in the optional confirm mode (`REVIEW_MODE=confirm`, below), judge the fixes on HEAD read-only and emit a verdict per thread. `review.ts` only reads the environment and records failures, so the flow in `run-review.ts` can be tested against a throwaway repo with sandcastle mocked; `threads.ts` holds the openers every stage reads threads by. `address-review/`: fix or decline each review thread that is the fixer's work on a pull request's branch, commit at most once, and emit one reply per thread for the host to post; the same split, `address-review.ts` over `run-address-review.ts`.
- `run-with-retry.ts`, `run-with-extraction.ts`, `retry-feedback.ts`: wrappers over sandcastle's `run()` that resume the agent's session with feedback when structured output fails validation.
- `no-sandbox.ts`: sandcastle's host provider with the agent's stderr forwarded to the log as it arrives; sandcastle's own keeps stderr for the error it raises on a non-zero exit, so a warning on a successful run would be lost. `failure-reason.ts`: the reason a run records when it fails on a thrown error, trimmed to sandcastle's header and the `error:` line when the CLI crashed, since the full dump is already in the log.
- `policy/`: `managed-settings.json` (hooks off, web and MCP tools denied, pinned env, sandbox with a strict one-host allowlist, `~/.npm` writable so `npm ci` works, and the Claude credential `CLAUDE_CODE_OAUTH_TOKEN` denied to sandboxed commands) and `managed-mcp.json` (no servers).
- `bin/`: `prepare-host.sh`, which a host calls, and the two scripts it runs, `install-runner-policy.sh` and `neutralise-checkout-settings.sh`; `test.sh`.
- `skills/`: `code-review/`, `implement/` and `tdd/`, copies of the upstream skills the `review` and `implement` scripts run, for a code repo that has no copy of its own; `skills/README.md` records the upstream commit, and `skills/LICENSE` is its MIT licence.

## Inputs and outputs

Each script reads its inputs from the environment and runs from the checkout's root. All read `BRANCH`, `BASE_BRANCH`, `EXTERNAL_REF`, `OUTPUT_DIR` and `MODEL`; `implement` also reads `TICKET_FILE`, `SPEC_FILE` and `SIBLINGS_FILE` (and `DIAGNOSTICS_FILE` if set), `review` and `address-review` read `TICKET_FILE`, `SPEC_FILE` and `THREADS_FILE`, and `write-pr` reads `TICKET_FILE` only:

| Variable | Meaning |
| --- | --- |
| `BRANCH` | branch to work on, already checked out |
| `BASE_BRANCH` | branch it was cut from and merges into; for `review` and `write-pr`, any ref that resolves in the checkout (`origin/main`, say), since `review` diffs `BASE_BRANCH...HEAD` and `write-pr`'s agent runs `git log` and `git diff` against it |
| `EXTERNAL_REF` | opaque reference to the work in the host's system |
| `TICKET_FILE`, `SPEC_FILE`, `SIBLINGS_FILE` | files the host fetched before the run; each reaches the prompt as a tagged data block (`<ticket>`, `<spec>`, `<siblings>`); `write-pr` takes the ticket only |
| `DIAGNOSTICS_FILE` | `implement` only, optional: commands, one per line, that the agent runs in Bash before the task and reports verbatim (exit status and output) under a `Diagnostics` heading in its final message. Reaches the prompt as `<diagnostics>` under the section text in `implement/diagnostics.md`; unset, the section is absent. For a host proving a runner control on one run, not for normal runs |
| `THREADS_FILE` | `review` and `address-review`: the pull request's existing discussion as JSON (shape below), fetched before the run; reaches the prompt as `<threads>`: every thread for `review`, and for confirm mode and `address-review` only the threads each acts on (below) |
| `REVIEW_MODE` | `review` only: `review` (default) or the optional `confirm` (below) |
| `OUTPUT_DIR` | where results go (default: the OS temp dir) |
| `MODEL` | Claude model id (default in `prompt-args.ts`) |

The Claude credential is not read by the scripts: Claude Code inherits it from the step's environment. Outputs land in `OUTPUT_DIR`: `pr_title.txt` and `pr_description.txt` from `write-pr`, `review.json` from `review` (and `verdicts.json` in confirm mode), `replies.json` and `summary.md` from `address-review`, and `failure_reason.txt` from any script that fails, for the host to post. A failed script exits 1 after writing `failure_reason.txt`; a missing required variable exits 1 without it.

The `implement` and `address-review` prompts read the code repo's `GLOSSARY.md` and `docs/adr/` where they exist.

## Implement

`implement` works the ticket on `BRANCH` by the `implement` skill, building every change through the `tdd` skill's red → green loop at the seams the spec and ticket name, and makes one or more commits in the code repo's own convention; a run that ends with none fails with `Agent finished without committing on the branch.` A successful run writes nothing to `OUTPUT_DIR`. Uncommitted changes the agent leaves behind are logged as a warning and stay out of the commits the host pushes.

## Write PR

`write-pr` drafts the title and description in one pass from the ticket and the branch's log and diff against `BASE_BRANCH`, in the code repo's documented pull request conventions where it has any. The output must validate (a title of 1 to 256 characters, a non-empty description); a failure resumes the session with feedback, up to 3 attempts in all, then fails the run with `PR text did not validate after 3 attempts`. `pr_title.txt` keeps the title's first line.

## Review

`review` runs the `code-review` skill against `BASE_BRANCH`. Correctness findings get a test that breaks on the bug and a fix; every fix lands in a single commit in the code repo's own convention on top of the branch as it was, and more than one commit, or rewriting the commits already there (amend, reset, rebase), fails the run. An inline thread is opened only for a finding that needs action after the run, and its first words say who acts on it next: `Fix required:` for wrong behaviour no test could express, a standards breach that is not mechanical to fix, or a judgement call to change the code, which the fix run that follows takes as work; `Decision required:` for spec coverage missing or wrong, or a spec that disagrees with the ticket, which is written to the developer and coded only once they answer it in the thread. A body that opens with neither gets `Fix required:` put in front. Calls to keep are decided in the body, one line each. The review answers no existing thread: a point an open thread covers is skipped. The body is a `Checked` paragraph, then `Fixed`, `Threads` and `Judgement calls` sections where there is something to put in them. A second, resumed pass extracts the review as structured output, which the script validates against `git diff BASE_BRANCH...HEAD` taken after the fix commit, so a comment can sit on a line the fix added. The run also fails when HEAD has no diff against `BASE_BRANCH`, the threads file is malformed, confirm mode has no thread under confirmation, or the output does not validate after 3 attempts.

The openers every stage reads threads by are in `review/threads.ts`: a thread is the fixer's work unless its last word is a bot's: a `Decision required:` opener nobody has answered yet, `Fixed in`, `Not changed:` or `Fix verified.`; it is under confirmation unless it opens `Decision required:`, was declined (`Not changed:`) or was verified already.

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

Inline comments anchor to a single line. Validation drops, and logs with its body as `Dropped comment: ...`, every inline comment whose file is not in the diff or whose line is not an added or context line of a hunk on its side (`RIGHT` unless the agent chose `LEFT` for a deleted line). Conversation comments cannot be replied to inline; the agent answers them in the summary.

## Confirm

Available; current hosts do not run it, and no stage resolves threads.

`REVIEW_MODE=confirm` runs the same script read-only on HEAD: the agent is given only the threads under confirmation (above) and judges each one. A fix is verified when the repository's documented checks pass on HEAD, a test exercises the behaviour the thread named and fails without the fix (a standards breach is gone), and the behaviour holds when exercised directly. A commit by the agent fails the run. A fault in the fix commits that no thread names is a `Decision required:` thread, anchored and validated as a review comment. Outputs:

- `review.json`: the review shape above, with the decision threads and a log-only body; a host posts it when `comments` is not empty.
- `verdicts.json`: `[{ "comment_id": 101, "verified": true, "body": "Fix verified. ..." }]`, one per thread judged, at the thread's first comment. The body is composed here: `Fix verified.` with the agent's one-sentence reason, or `Fix not verified:` with the part that failed. A failed verdict on a thread no reply claimed fixed is dropped and logged, so an untouched thread gets silence; a thread given and left without a verdict is logged as `Unjudged thread: ...`. A host running confirm posts each body as a reply; `verified` is there for one that also resolves a verified thread whose first comment is the bot's own, leaving a human's thread to the human.

## Address review

`address-review` takes a branch with review threads and fixes or declines each one that is the fixer's work (above): the agent sees a `Decision required:` thread only once the developer has answered it, and never one a bot's last word closed. An answered decision is carried out, or declined when the answer keeps the code as it is or cannot be acted on without guessing. A correctness claim gets a test that breaks on the bug first: if the test fails, the code is fixed; if it passes, the thread is declined citing the test. A documented-standard breach is fixed. A request for work the ticket or spec calls for but the pull request does not do is declined as left for the dev, so a comment never grows the pull request's scope. Anything else the agent disagrees with is declined with the reason. Every fix lands in a single commit in the code repo's own convention on top of the branch as it was; zero commits is valid, and more than one, or rewriting the commits already there, fails the run. Conversation comments are answered in the summary only.

It reads `THREADS_FILE` in the shape above and fails before running the agent when it is malformed or holds no thread for the fixer; a host should check that before it spends a run. Outputs:

- `replies.json`: `[{ "comment_id": 101, "body": "..." }]`, one `POST /repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies` with `body` per entry, one per thread the agent answered, aimed at the thread's first comment, which that endpoint requires. The prompt asks for each body to begin `Fixed in \`<sha>\`` or `Not changed:`; validation checks only the id. Replies the agent aimed at the same thread are joined; a reply to an id outside the threads given is dropped and logged as `Dropped reply: ...`; a thread given and left with no reply is logged as `Unanswered thread: ...`. The script never resolves a thread or emits a review; verifying a fix is left to the developer, or to confirm mode on a host that runs it.
- `summary.md`: the agent's account for the run log: what the commit changed, the threads it declined with the reason, and the answers to conversation comments.

Push the fix commit, when there is one, before posting the replies.

## Wiring a host workflow

1. Check this repo out at a full commit SHA, never a branch or tag, and run `npm ci` in it.
2. `<runner>/bin/prepare-host.sh <checkout>` before the agent step. In order, it:
   - links `<runner>/node_modules/.bin/claude` to `/usr/local/bin/claude` after checking it is the version the lockfile pins, so a version bump is one reviewed change here and no host installs Claude Code itself;
   - runs `install-runner-policy.sh`, which writes the policy to `/etc/claude-code/` and installs bubblewrap, socat and ripgrep, and lifts the AppArmor restriction on unprivileged user namespaces host-wide (`sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`) so bubblewrap can run (`--no-sandbox`, run directly, gives a controls-only policy; both modes install the same packages and set the same sysctl);
   - prints one line stating the configured sandbox, beginning `Configured policy:`, for the run log;
   - runs `neutralise-checkout-settings.sh <checkout>` so no project `env`, hook or helper command reaches the CLI while `CLAUDE.md`, `AGENTS.md` and the skills beside them still load, and excludes sandcastle's `.sandcastle/` from git.
3. For `review`, copy `<runner>/skills/code-review` to `<checkout>/.claude/skills/code-review`, and for `implement`, `<runner>/skills/implement` and `<runner>/skills/tdd` the same way, each unless the checkout has its own. When that path is a link to nothing (a skills install the code repo ignores), copy to the link's target instead, refusing a target outside the checkout. Add the path that received the copy to `<checkout>/.git/info/exclude` so it never lands in a commit. `address-review` runs no skill.
4. From the checkout, run the scripts with this repo's own tsx, with only the Claude credential and the variables above in the step's environment. Do not set `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`: Claude Code 2.1.284 then forces the default permission mode, and every write waits for an approval nobody can give:

```
node <runner>/node_modules/.bin/tsx <runner>/implement/implement.ts
node <runner>/node_modules/.bin/tsx <runner>/write-pr/write-pr.ts
node <runner>/node_modules/.bin/tsx <runner>/review/review.ts
node <runner>/node_modules/.bin/tsx <runner>/address-review/address-review.ts
# optional, confirm mode (above):
REVIEW_MODE=confirm node <runner>/node_modules/.bin/tsx <runner>/review/review.ts
```

The host pushes the branch and opens the pull request itself, after the scripts finish, and posts `review`'s and `address-review`'s payloads the same way (and `verdicts.json`, if it runs confirm mode); the agent never holds a token for that.

## Tests

`npm run check` runs the typecheck, the vitest suite (the retry and extraction wrappers, the review and address-review flows with sandcastle's `run` mocked against throwaway repos, every output schema, the thread kinds, comment, reply and verdict validation, the diff anchor index, data blocks, prompt placeholders, the diagnostics section, the failure reason and the stderr-forwarding provider) and `bin/test.sh` (the shell scripts against throwaway git repos, with the policy and Claude Code's link in temp dirs and `sudo` stubbed). CI runs it on every pull request and on `main`.

## Changes

Every change that alters what a run does carries a changeset (`npm run changeset`), updating a copied skill included. History before the move to this repo, blame included, comes from the skills fork's `runner/` directory; `Merge pull request SiliconDali/skills#N` commits refer to that repo's pull requests.

The wrappers and their tests are adapted from [mattpocock/course-video-manager](https://github.com/mattpocock/course-video-manager) (MIT).
