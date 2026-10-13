---
"sd-runner": minor
---

Move the runner out of the skills fork into its own repo, `SiliconDali/sd-runner`, so a change to the run scripts and a sync of the skills no longer share a pin. The fork's `runner/` is now the root, its history rewritten with `git filter-repo` so blame carries over, and the package is renamed `sd-runner`. The five runner changesets pending in the fork move with it. A copy of upstream's `code-review` skill lives in `skills/`, with the upstream commit it came from and its MIT licence beside it, so one pin covers everything a run executes. The README states the public-repo rule and the host contract: environment and files in, files out to `OUTPUT_DIR`, never a tracker or code-host API call, with the review body as the one GitHub-shaped exception. CI runs the typecheck, the vitest suite and the shell tests on pull requests and on `main`.
