# review

`review` runs the `code-review` skill against `BASE_BRANCH` and emits the review as a payload the host posts.

## Rules

- **Fixes:** a correctness finding gets a test that breaks on the bug, and a fix. Every fix lands in a single commit in the code repo's own convention, on top of the branch as it was. More than one commit, or rewriting the commits already there (amend, reset, rebase), fails the run.
- **Threads:** an inline thread is opened only for a finding that needs action after the run, with an [opener](threads.md#openers):
  - `Fix required:` for wrong behaviour no test could express, a standards breach that is not mechanical to fix, or a judgement call to change the code. The fix run that follows takes it as work.
  - `Decision required:` for spec coverage missing or wrong, or a spec that disagrees with the ticket.
  - A body that opens with neither gets `Fix required:` put in front.
- **Calls to keep** are decided in the body, one line each.
- **Existing threads:** the review answers none. A point an open thread covers is skipped.
- **Body:** a `Checked` paragraph, then `Fixed`, `Threads` and `Judgement calls` sections where there is something to put in them.

## Extraction and validation

A second, resumed pass extracts the review as structured output. The script validates it against `git diff BASE_BRANCH...HEAD` taken after the fix commit, so a comment can sit on a line the fix added.

- Inline comments anchor to a single line.
- Validation drops, and logs with its body as `Dropped comment: ...`, every inline comment whose file is not in the diff, or whose line is not an added or context line of a hunk on its side (`RIGHT` unless the agent chose `LEFT` for a deleted line).
- Conversation comments cannot be replied to inline; the agent answers them in the summary.

The run fails when:

- HEAD has no diff against `BASE_BRANCH`;
- the threads file is malformed;
- confirm mode has no thread under confirmation;
- the output does not validate after 3 attempts.

## Output

`review.json` is the body for `POST /repos/{owner}/{repo}/pulls/{number}/reviews`, as is (`gh api ... --input review.json`). `commit_id` is `HEAD` after the fix commit, so push before posting.

```json
{
  "commit_id": "<sha>",
  "event": "COMMENT",
  "body": "Markdown summary",
  "comments": [
    { "path": "src/a.ts", "line": 12, "side": "RIGHT", "body": "..." }
  ]
}
```

## Confirm mode

Available; current hosts do not run it, and no stage resolves threads.

`REVIEW_MODE=confirm` runs the same script read-only on HEAD. The agent is given only the threads [under confirmation](threads.md#openers) and judges each one.

- **Verified** means: the repository's documented checks pass on HEAD, a test exercises the behaviour the thread named and fails without the fix (a standards breach is gone), and the behaviour holds when exercised directly.
- A commit by the agent fails the run.
- A fault in the fix commits that no thread names is a `Decision required:` thread, anchored and validated as a review comment.

Outputs:

- `review.json`: the shape above, with the decision threads and a log-only body. A host posts it when `comments` is not empty.
- `verdicts.json`: `[{ "comment_id": 101, "verified": true, "body": "Fix verified. ..." }]`, one per thread judged, at the thread's first comment.
  - The body is composed here: `Fix verified.` with the agent's one-sentence reason, or `Fix not verified:` with the part that failed.
  - A failed verdict on a thread no reply claimed fixed is dropped and logged, so an untouched thread gets silence.
  - A thread given and left without a verdict is logged as `Unjudged thread: ...`.
  - A host running confirm posts each body as a reply. `verified` is there for a host that also resolves a verified thread whose first comment is the bot's own, leaving a human's thread to the human.
