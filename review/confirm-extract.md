Emit the confirmation you just finished as a single `<output>` block, the last thing in your response. Do not change code or commit in this step.

<output>
{
  "summary": "## Verified\n\n- ...\n\n## Not verified\n\n- ...\n\n## Threads\n\n- `src/example.ts:42`: ...",
  "verdicts": [
    { "comment_id": 123456, "verified": true, "reason": "the test on the limit fails without the guard and HEAD rejects 3.5." },
    { "comment_id": 123457, "verified": false, "reason": "no test exercises a tab before the limit." }
  ],
  "comments": [
    { "path": "src/example.ts", "line": 42, "body": "Decision required: what the fix broke and why." }
  ]
}
</output>

- `verdicts`: one per thread in the `<threads>` block, by the `id` of any comment in it. `reason` is one sentence: what you checked for a verified fix, which of the three parts failed for one not verified. The reply the developer reads (`Fix verified.` or `Fix not verified:`) is composed from it.
- `comments`: one inline comment per fault in the fix commits that no thread names, each body beginning `Decision required:`, on one line of the diff between the base branch and HEAD. `path` is relative to the repository root, as `git diff` prints it. `line` is the line number in the new file, for an added or unchanged line inside a hunk. For a deleted line, add `"side": "LEFT"` and use its number in the old file. A comment on any other line is dropped.
- `summary`: Markdown for the run log, by thread: `Verified`, `Not verified` with the part that failed, and `Threads` with each inline comment's `path:line`. A section with nothing in it is left out.

Use an empty array when there is nothing to put in one.
