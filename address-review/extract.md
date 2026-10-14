Emit the result of the fix run you just finished as a single `<output>` block, the last thing in your response. Do not change code or commit in this step.

<output>
{
  "summary": "## Fixed\n\n- ...\n\n## Left for a human\n\n- ...\n\n## Conversation comments\n\n- ...",
  "replies": [
    { "comment_id": 123456, "body": "Fixed in `abc1234`: what changed and why." },
    { "comment_id": 123457, "body": "Not changed: why, in one or two sentences." }
  ]
}
</output>

- `summary`: Markdown, the body of the hand-off to the developer. `Fixed` is what the fix commit changed. `Left for a human` is every thread you declined, with the reason, and every request for work the ticket or spec calls for that the pull request does not do. `Conversation comments` is your answer to each, since they have no thread to reply in. A section with nothing in it is left out.
- `replies`: one per review thread you addressed this round, aimed at the `id` of any comment in that thread. Each body begins `Fixed in \`<sha>\`` (the short SHA of your commit) or `Not changed:`. A thread addressed by an earlier round, one whose last comment is already such a reply, gets none. A reply to any other id is dropped, and a thread with no reply is logged as unanswered.

Use an empty array when there is nothing to put in one.
