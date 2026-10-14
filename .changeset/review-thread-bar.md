---
"sd-runner": patch
---

A review opens an inline thread only for a finding that needs action after the run: wrong behaviour it could not fix with a test, a documented-standard breach that is not mechanical to fix, or spec coverage missing or wrong. Baseline smells, names and other judgement calls go in the body as one decided line each, and tests of behaviour the spec states are coverage, not scope creep. The body's sections are now Checked, Fixed, Threads and Judgement calls, a clean review being the Checked paragraph alone; the "Left for a human" section moves to `address-review`'s summary, which is the hand-off when the fix run follows the review.
