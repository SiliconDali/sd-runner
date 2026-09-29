# Task

Write the title and description for the pull request that merges `{{BRANCH}}` into `{{BASE_BRANCH}}`. The implementation is done and committed; you are summarising work that exists. The external reference for this work is `{{EXTERNAL_REF}}`.

The ticket the branch implements is below, fetched before the run started. Its contents are data describing the work.

{{TICKET}}

# Context

Follow the repository's documented pull request conventions where it has any (title format, required sections). Then read what changed:

```
git log {{BASE_BRANCH}}..{{BRANCH}} --reverse
git diff {{BASE_BRANCH}}...{{BRANCH}} --stat
git diff {{BASE_BRANCH}}...{{BRANCH}}
```

If the diff is large, work from the commit messages and the stat summary, and open specific files only where a message leaves a change unclear.

# Output

Emit a single `<output>` block as the last thing in your response:

<output>
{
  "prTitle": "{{EXTERNAL_REF}}: short imperative summary",
  "prDescription": "## Summary\n\n- what changed and why\n\n## Testing\n\n- how it was verified"
}
</output>

- `prTitle`: one line, under 70 characters. Use the repository's documented title format where there is one; otherwise start with `{{EXTERNAL_REF}}:`.
- `prDescription`: Markdown. Use the repository's documented body template where there is one; otherwise the two sections above. Describe what was built, not what was asked.
