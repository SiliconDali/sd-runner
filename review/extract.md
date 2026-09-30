Emit the review you just finished as a single `<output>` block, the last thing in your response. Do not change code or commit in this step.

<output>
{
  "summary": "## Standards\n\n- ...\n\n## Spec\n\n- ...\n\n## Fixed\n\n- ...\n\n## Left for a human\n\n- ...",
  "comments": [
    { "path": "src/example.ts", "line": 42, "body": "What is wrong here and why." }
  ],
  "replies": [
    { "comment_id": 123456, "body": "Fixed in the review commit: ..." }
  ]
}
</output>

- `summary`: Markdown body of the review. Keep the code-review skill's Standards and Spec sections separate, then say what the fix commit changed and what a human still has to decide. Anything that does not sit on a diff line goes here.
- `comments`: inline comments, each on a line of the diff you reviewed as it stands after your fix commit. `path` is relative to the repository root, as `git diff` prints it. `line` is the line number in the new file, for an added or unchanged line inside a hunk. For a deleted line, add `"side": "LEFT"` and use its number in the old file. A comment on any other line is dropped.
- `replies`: answers to existing review threads. `comment_id` is the `id` of a comment in one of the threads in the `<threads>` block. Conversation comments have no thread to reply in; answer those in `summary`. A reply to any other id is dropped.

Use empty arrays when there is nothing to put in one.
