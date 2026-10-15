# Review threads

## Openers

A thread's first words say who acts on it next. The openers every stage reads threads by are in `review/threads.ts`.

| Opener                                | Written by           | Means                                                               |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| `Fix required:`                       | review               | the fixer takes it as work                                          |
| `Decision required:`                  | review               | written to the developer; coded only once they answer in the thread |
| `Fixed in`                            | fixer reply          | fixed in the named commit                                           |
| `Not changed:`                        | fixer reply          | declined, with the reason                                           |
| `Fix verified.` / `Fix not verified:` | confirm-mode verdict | the fix held on HEAD, or the part that failed                       |

- **The fixer's work:** every thread unless its last word is a bot's: a `Decision required:` opener nobody has answered yet, `Fixed in`, `Not changed:` or `Fix verified.`.
- **Under confirmation:** every thread unless it opens `Decision required:`, was declined (`Not changed:`) or was verified already.

## THREADS_FILE

Unresolved review threads, each with its comments first to last, and the conversation comments. Extra fields are ignored; write `{"threads": [], "comments": []}` when there are none:

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

- `id` is the REST id of a review comment (in a thread) or of a conversation comment. The GraphQL `reviewThreads` connection gives `isResolved` and each comment's `databaseId`, which is the REST id.
- It reaches the prompt as `<threads>`: every thread for `review`; for confirm mode only the threads under confirmation, and for `address-review` only the fixer's work.
