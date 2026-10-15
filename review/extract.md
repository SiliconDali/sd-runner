Emit the review you just finished as a single `<output>` block, the last thing in your response. Do not change code or commit in this step.

<output>
{
  "summary": "## Checked\n\n...\n\n## Fixed\n\n- ...\n\n## Threads\n\n- `src/example.ts:42`: ...\n\n## Judgement calls\n\n- ...",
  "comments": [
    { "path": "src/example.ts", "line": 42, "body": "Fix required: what is wrong here and what puts it right." }
  ]
}
</output>

- `summary`: Markdown body of the review, read by the developer. `Checked` is one paragraph: what was reviewed against the ticket, the spec and the repository's standards, and what held. `Fixed` lists what the fix commit changed. `Threads` lists each inline comment with its `path:line`. `Judgement calls` lists each call you decided to keep, with the reason in a few words ("keep: the spec is silent on integers"); a call to change the code is a thread, not a line here. A section with nothing in it is left out, so a clean review is the `Checked` paragraph alone. A concern raised in a conversation comment, which has no thread to reply in, is answered here.
- `comments`: one inline comment per thread you are opening, each on one line of the diff you reviewed as it stands after your fix commit, and each body beginning `Fix required:` or `Decision required:`. Comments cannot span a range of lines: for a finding that covers several, anchor it to the line that matters most. `path` is relative to the repository root, as `git diff` prints it. `line` is the line number in the new file, for an added or unchanged line inside a hunk. For a deleted line, add `"side": "LEFT"` and use its number in the old file. A comment on any other line is dropped.

Use an empty array when there is nothing to put in one.
