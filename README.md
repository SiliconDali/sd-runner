# runner

What an unattended run executes: the scripts that drive Claude Code through [sandcastle](https://github.com/mattpocock/sandcastle), their prompts, the policy Claude Code reads above every other settings level, and the two shell scripts that install that policy and neutralise a checkout's project settings. A host workflow checks this repo out at a pinned commit and calls into here; nothing in this directory knows which tracker, repository or organisation the host serves.

## Layout

- `implement/`: implement a ticket on a branch and commit. `write-pr/`: draft a pull request title and description from the diff, as structured output.
- `run-with-retry.ts`, `run-with-extraction.ts`, `retry-feedback.ts`: wrappers over sandcastle's `run()` that resume the agent's session with feedback when structured output fails validation.
- `policy/`: `managed-settings.json` (hooks off, web and MCP tools denied, pinned env, sandbox with a strict one-host allowlist and the credential unset for sandboxed commands) and `managed-mcp.json` (no servers).
- `bin/`: `install-runner-policy.sh`, `neutralise-checkout-settings.sh`, `test.sh`.

## Inputs and outputs

Each script reads its inputs from the environment and runs from the checkout's root. Both read `BRANCH`, `BASE_BRANCH`, `EXTERNAL_REF`, `OUTPUT_DIR` and `MODEL`; `implement` also reads `TICKET_FILE`, `SPEC_FILE` and `SIBLINGS_FILE`, and `write-pr` reads `TICKET_FILE` only:

| Variable | Meaning |
| --- | --- |
| `BRANCH` | branch to work on, already checked out |
| `BASE_BRANCH` | branch it was cut from and merges into |
| `EXTERNAL_REF` | opaque reference to the work in the host's system |
| `TICKET_FILE`, `SPEC_FILE`, `SIBLINGS_FILE` | files the host fetched before the run; each reaches the prompt as a tagged data block (`<ticket>`, `<spec>`, `<siblings>`); `write-pr` takes the ticket only |
| `OUTPUT_DIR` | where results go (default: the OS temp dir) |
| `MODEL` | Claude model id (default in `prompt-args.ts`) |

The Claude credential is not read by the scripts: Claude Code inherits it from the step's environment. Outputs land in `OUTPUT_DIR`: `pr_title.txt` and `pr_description.txt` from `write-pr`, and `failure_reason.txt` from any script that fails, for the host to post.

## Wiring a host workflow

1. Check this repo out at a pinned commit and run `npm ci --prefix runner`.
2. `sudo runner/bin/install-runner-policy.sh` before the agent step (`--no-sandbox` for a controls-only run). It writes to `/etc/claude-code/`; override with `DESTDIR`.
3. `runner/bin/neutralise-checkout-settings.sh <checkout>` so no project `env`, hook or helper command reaches the CLI while `CLAUDE.md`, `AGENTS.md` and the skills beside them still load.
4. From the checkout, run the scripts with the fork's own tsx, with only the Claude credential, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` and the variables above in the step's environment:

```
node <fork>/runner/node_modules/.bin/tsx <fork>/runner/implement/implement.ts
node <fork>/runner/node_modules/.bin/tsx <fork>/runner/write-pr/write-pr.ts
```

The host pushes the branch and opens the pull request itself, after the scripts finish; the agent never holds a token for that.

## Tests

`npm run check --prefix runner` runs the typecheck, the vitest suite (wrappers with sandcastle's `run` mocked, output schema, data blocks, prompt placeholders) and `bin/test.sh` (both shell scripts against throwaway git repos and a `DESTDIR`).

The wrappers and their tests are adapted from [mattpocock/course-video-manager](https://github.com/mattpocock/course-video-manager) (MIT).
