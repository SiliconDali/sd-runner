---
"sd-runner": patch
---

The runner policy lets sandboxed commands write to `~/.npm`, npm's default cache. Without it a plain `npm ci` in a checkout fails with `EROFS`, since the sandbox writes only to the working directory and its per-user temp directory, and the agent has to notice and re-run with `--cache "$TMPDIR/npm-cache"`.
