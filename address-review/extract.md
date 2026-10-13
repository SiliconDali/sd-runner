Emit the result of the fix run you just finished as a single `<output>` block, the last thing in your response. Do not change code or commit in this step.

<output>
{
  "summary": "## Fixed\n\n- ...\n\n## Not changed\n\n- ...\n\n## Conversation comments\n\n- ...",
  "replies": [
    { "comment_id": 123456, "body": "Fixed in `abc1234`: what changed and why." },
    { "comment_id": 123457, "body": "Not changed: why, in one or two sentences." }
  ]
}
</output>

- `summary`: Markdown. What the fix commit changed, what you declined and why, and your answer to each conversation comment, which has no thread to reply in.
- `replies`: one per review thread in the `<threads>` block, aimed at the `id` of any comment in that thread. Each body begins `Fixed in \`<sha>\`` (the short SHA of your commit) or `Not changed:`. A reply to any other id is dropped, and a thread with no reply is logged as unanswered.

Use an empty array when there is nothing to put in one.
