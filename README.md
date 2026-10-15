# sd-runner

Runs Claude Code unattended on one ticket: implement it, review the result, answer the review's threads. A host workflow (GitHub Actions, say) fetches the inputs to files, calls a script, then pushes and posts what the script left in `OUTPUT_DIR`.

The scripts drive Claude Code through [sandcastle](https://github.com/mattpocock/sandcastle) under a locked-down policy, with pinned copies of Matt Pocock's `implement`, `tdd` and `code-review` skills. Nothing here knows which tracker, repository or organisation the host serves.

## Quick start

Needs an Ubuntu host with Node 22+, `sudo` and `jq`.

```sh
# 1. This repo checked out at a full commit SHA, never a branch or tag
(cd <runner> && npm ci)

# 2. Claude Code at the pinned version, the runner policy, the checkout's project settings neutralised
<runner>/bin/prepare-host.sh <checkout>

# 3. Inputs: files the host fetched, named by environment variables
export BRANCH=feature/x BASE_BRANCH=main EXTERNAL_REF=<ref> OUTPUT_DIR=/tmp/out
export TICKET_FILE=ticket.md SPEC_FILE=spec.md SIBLINGS_FILE=siblings.md

# 4. Run a script from the checkout's root, with this repo's own tsx
cd <checkout> && node <runner>/node_modules/.bin/tsx <runner>/implement/implement.ts
```

Then read `OUTPUT_DIR` and act on it: push, open the pull request, post. The full steps, skill copies included, are in [docs/wiring.md](docs/wiring.md).

## How a run flows

```mermaid
flowchart TD
  F[host: fetch ticket, spec,<br/>threads to files] --> I[implement]
  I --> P[host: push branch]
  P --> W[write-pr]
  W --> O[host: open draft PR]
  O --> R[review]
  R --> RP[host: push fix commit,<br/>post review.json]
  RP --> A[address-review]
  A --> AP[host: push fix commit,<br/>post replies.json]
  classDef host fill:#eee,stroke:#999,color:#333
  class F,P,O,RP,AP host
```

Grey boxes are the host's steps. The scripts never call a tracker or code-host API and never hold a GitHub token: the host fetches before, and pushes and posts after.

## Scripts

| Script                                                | What it does                                                                               | Reads                                                                      | Writes to `OUTPUT_DIR`               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------ |
| [`implement`](docs/implement.md)                      | Works the ticket on `BRANCH` through the `implement` and `tdd` skills; one or more commits | `TICKET_FILE`, `SPEC_FILE`, `SIBLINGS_FILE`, `DIAGNOSTICS_FILE` (optional) | nothing on success                   |
| [`write-pr`](docs/write-pr.md)                        | Drafts the pull request title and description from the diff                                | `TICKET_FILE`                                                              | `pr_title.txt`, `pr_description.txt` |
| [`review`](docs/review.md)                            | Runs the `code-review` skill against `BASE_BRANCH`; at most one fix commit; opens threads  | `TICKET_FILE`, `SPEC_FILE`, `THREADS_FILE`                                 | `review.json`                        |
| [`review`, confirm mode](docs/review.md#confirm-mode) | Optional, unused by current hosts: judges fixes on HEAD, read-only                         | the same, `REVIEW_MODE=confirm`                                            | `review.json`, `verdicts.json`       |
| [`address-review`](docs/address-review.md)            | Fixes or declines each thread that is the fixer's work; at most one commit                 | `TICKET_FILE`, `SPEC_FILE`, `THREADS_FILE`                                 | `replies.json`, `summary.md`         |

Every script also reads `BRANCH`, `BASE_BRANCH`, `EXTERNAL_REF`, `OUTPUT_DIR` and `MODEL`, and runs from the checkout's root.

## Inputs

| Variable                                    | Meaning                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRANCH`                                    | branch to work on, already checked out                                                                                                                              |
| `BASE_BRANCH`                               | branch it was cut from and merges into; `review` and `write-pr` take any ref that resolves (`origin/main`)                                                          |
| `EXTERNAL_REF`                              | opaque reference to the work in the host's system                                                                                                                   |
| `TICKET_FILE`, `SPEC_FILE`, `SIBLINGS_FILE` | files the host fetched before the run; each reaches the prompt as a tagged data block (`<ticket>`, `<spec>`, `<siblings>`)                                          |
| `DIAGNOSTICS_FILE`                          | `implement` only, optional: commands the agent runs and reports before the task, for proving a runner control on one run ([details](docs/implement.md#diagnostics)) |
| `THREADS_FILE`                              | `review` and `address-review`: the pull request's existing discussion as JSON ([shape](docs/threads.md#threads_file)), reaching the prompt as `<threads>`           |
| `REVIEW_MODE`                               | `review` only: `review` (default) or the optional `confirm`                                                                                                         |
| `OUTPUT_DIR`                                | where results go (default: the OS temp dir)                                                                                                                         |
| `MODEL`                                     | Claude model id (default in `prompt-args.ts`)                                                                                                                       |

- The Claude credential is not read by the scripts: Claude Code inherits it from the step's environment. It is the only credential a run holds.
- The `implement` and `address-review` prompts read the code repo's `GLOSSARY.md` and `docs/adr/` where they exist.

## Outputs and failures

- A failed script writes `failure_reason.txt` to `OUTPUT_DIR` and exits 1. A missing required variable exits 1 without it.
- Outputs are neutral text and JSON a host maps onto its own system, with one exception: `review.json` is already the body of GitHub's create-review API call, and stays GitHub-shaped until a second code host is real.
- `replies.json` and `verdicts.json` are host-neutral: each entry is the id the host gave a comment in the threads file, plus a body (and, in `verdicts.json`, `verified`). The host maps it onto its own reply endpoint.

## Layout

| Path                                                               | What's there                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `implement/`, `write-pr/`, `review/`, `address-review/`            | one script each, with its prompt; `review/threads.ts` holds the [thread openers](docs/threads.md); `review.ts` and `address-review.ts` only read the environment, so tests drive the flows in `run-review.ts` and `run-address-review.ts` |
| `run-with-retry.ts`, `run-with-extraction.ts`, `retry-feedback.ts` | wrappers that resume the agent with feedback when its structured output fails validation                                                                                                                                                  |
| `no-sandbox.ts`                                                    | sandcastle's host provider, forwarding the agent's stderr to the log as it arrives                                                                                                                                                        |
| `failure-reason.ts`                                                | the one-line reason a failed run records                                                                                                                                                                                                  |
| `policy/`                                                          | `managed-settings.json` (hooks off, web and MCP tools denied, one-host sandbox allowlist, credential hidden from commands) and `managed-mcp.json` (no servers)                                                                            |
| `bin/`                                                             | `prepare-host.sh` and the two scripts it runs; `test.sh`                                                                                                                                                                                  |
| `skills/`                                                          | the pinned upstream `code-review`, `implement` and `tdd`; `skills/README.md` records the commit, `skills/LICENSE` the MIT licence                                                                                                         |
| `docs/`                                                            | each script's contract, the thread openers, host wiring                                                                                                                                                                                   |

## Public repo

This repo is public, so a host needs no read credential and the team whose code a run touches can audit exactly what runs.

Nothing committed here (code, prompts, docs, tests, fixtures, commit messages, changesets) names a client, a client's repository or a client's tracker. Examples use placeholders (`src/a.ts`, `dev`, `<sha>`); host-specific values arrive at run time through the inputs.

## Tests

```sh
npm run check
```

Typecheck, the vitest suite (the flows run against throwaway repos with sandcastle mocked) and `bin/test.sh` (the shell scripts, `sudo` stubbed). CI runs it on every pull request and on `main`.

## Changes

- Every change that alters what a run does carries a changeset (`npm run changeset`), updating a copied skill included.
- History before the move to this repo, blame included, comes from the skills fork's `runner/` directory; `Merge pull request SiliconDali/skills#N` commits refer to that repo's pull requests.
- The wrappers and their tests are adapted from [mattpocock/course-video-manager](https://github.com/mattpocock/course-video-manager) (MIT).
