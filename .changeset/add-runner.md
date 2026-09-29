---
"mattpocock-skills": minor
---

Add the `runner/` directory: what an unattended run executes. It carries the `implement` and `write-pr` scripts that drive Claude Code through sandcastle, their prompts (ticket, spec and siblings arrive as tagged data blocks from files the host fetched), the `runWithRetry` and `runWithExtraction` wrappers with tests, the managed policy templates (`managed-settings.json`, `managed-mcp.json`) that a host installs above every other settings level, and two shell scripts: `install-runner-policy.sh` (with `--no-sandbox` for a controls-only run) and `neutralise-checkout-settings.sh`. Its own `package.json` and lockfile keep it out of the skills' way; `npm run check --prefix runner` runs the whole suite, and a `Runner` workflow runs it in CI.
