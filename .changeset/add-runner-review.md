---
"mattpocock-skills": minor
---

Add the `review` run script to `runner/`. It runs the `code-review` skill against the base branch, writes a failing test and a fix for each correctness finding, commits the fixes at most once in the code repo's own convention, and reports missing spec coverage without coding it. A resumed pass extracts the review as structured output; inline comments are kept only on lines of the post-fix diff and replies only on fetched review threads, with every dropped one logged. The results land as `review.json`, ready to post as a `COMMENT` review, and `replies.json`.
