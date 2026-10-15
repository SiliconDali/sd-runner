---
"sd-runner": minor
---

Add the runner: what an unattended run executes. It carries the `implement` and `write-pr` scripts that drive Claude Code through sandcastle, their prompts (ticket, spec and siblings arrive as tagged data blocks from files the host fetched), the `runWithRetry` and `runWithExtraction` wrappers with tests, the managed policy templates (`managed-settings.json`, `managed-mcp.json`) that a host installs above every other settings level, and two shell scripts: `install-runner-policy.sh` (with `--no-sandbox` for a controls-only run) and `neutralise-checkout-settings.sh`. `npm run check` runs the whole suite, and CI runs it.
