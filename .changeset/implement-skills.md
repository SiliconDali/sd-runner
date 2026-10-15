---
"sd-runner": patch
---

`implement` runs Matt Pocock's `implement` and `tdd` skills, copied byte for byte into `skills/` at a pinned upstream commit, instead of a paraphrase. The prompt reads `implement`, builds every change through `tdd`'s red → green loop at the seams the spec and ticket name, runs a test the ticket asks to pass on the code as it is against the base branch first, and leaves code review to the review run. A host copies both skills into the checkout as it does `code-review`.
