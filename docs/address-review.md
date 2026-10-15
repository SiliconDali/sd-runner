# address-review

`address-review` takes a branch with review threads and fixes or declines each one that is [the fixer's work](threads.md#openers). It runs no skill.

## What the agent sees

- A `Decision required:` thread only once the developer has answered it.
- Never a thread a bot's last word closed.

## Rules

| Thread                                                              | Outcome                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| An answered decision                                                | carried out; declined when the answer keeps the code as it is or cannot be acted on without guessing        |
| A correctness claim                                                 | a test that breaks on the bug first: if it fails, the code is fixed; if it passes, declined citing the test |
| A documented-standard breach                                        | fixed                                                                                                       |
| Work the ticket or spec calls for that the pull request does not do | declined as left for the dev, so a comment never grows the pull request's scope                             |
| Anything else the agent disagrees with                              | declined with the reason                                                                                    |

- Every fix lands in a single commit in the code repo's own convention, on top of the branch as it was. Zero commits is valid; more than one, or rewriting the commits already there, fails the run.
- Conversation comments are answered in the summary only.
- It reads `THREADS_FILE` ([shape](threads.md#threads_file)) and fails before running the agent when it is malformed or holds no thread for the fixer. A host should check that before it spends a run.

## Outputs

- `replies.json`: `[{ "comment_id": 101, "body": "..." }]`, one `POST /repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies` with `body` per entry, one per thread the agent answered, aimed at the thread's first comment, which that endpoint requires.
  - The prompt asks for each body to begin `Fixed in \`<sha>\``or`Not changed:`; validation checks only the id.
  - Replies the agent aimed at the same thread are joined.
  - A reply to an id outside the threads given is dropped and logged as `Dropped reply: ...`.
  - A thread given and left with no reply is logged as `Unanswered thread: ...`.
- `summary.md`: the agent's account for the run log: what the commit changed, the threads it declined with the reason, and the answers to conversation comments.

The script never resolves a thread or emits a review. Verifying a fix is left to the developer, or to [confirm mode](review.md#confirm-mode) on a host that runs it.

Push the fix commit, when there is one, before posting the replies.
