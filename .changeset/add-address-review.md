---
"sd-runner": minor
---

Add the `address-review` run script beside `review`. It takes a branch with unresolved review threads and fixes or declines each one that is the fixer's work: a correctness claim gets a test that breaks on the bug before any fix, and is declined citing the test when it passes; a standards breach is fixed; a request for missing spec coverage is declined as left for the dev; a disagreement is declined with the reason. Fixes land in at most one commit in the code repo's own convention, zero being valid, and rewritten history fails the run. A resumed pass extracts one reply per thread, validated against the fetched threads with every dropped reply and every unanswered thread logged, written as `replies.json`, one entry per thread at its first comment, with `summary.md` beside it.
