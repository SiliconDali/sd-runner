# Wiring a host workflow

The host is whatever runs the scripts: a CI workflow, a self-hosted runner, a person at a terminal. Between host and scripts there are only environment variables and files.

## Contract

- **Before:** on an Ubuntu host with `sudo` and `jq` (the policy install uses `apt-get` and an Ubuntu AppArmor sysctl), `npm ci` here, then `bin/prepare-host.sh <checkout>` as the user the agent runs as.
- **In:** environment variables, and files whose paths those variables name. The host fetches everything a run reads (ticket, spec, siblings, review threads) before the run and writes it to files; the scripts never fetch.
- **Out:** files in `OUTPUT_DIR`, which the host reads back and acts on after the script exits: pushing the branch, opening the pull request, posting the review, recording a failure.
- **Never:** a tracker or code-host API call from anything in this repo, and never a GitHub token in a script's environment.

## Steps

1. Check this repo out at a full commit SHA, never a branch or tag, and run `npm ci` in it.
2. Run `<runner>/bin/prepare-host.sh <checkout>` before the agent step. The steps that need root go through `sudo`. In order, it:
   - links `<runner>/node_modules/.bin/claude` to `/usr/local/bin/claude` after checking it is the version `package-lock.json` pins (with its integrity hash), so a version bump is one reviewed change here and no host installs Claude Code itself;
   - runs `install-runner-policy.sh`, which writes the policy to `/etc/claude-code/`, installs bubblewrap, socat and ripgrep, and lifts the AppArmor restriction on unprivileged user namespaces host-wide (`sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`) so bubblewrap can run. `--no-sandbox`, run directly, gives a controls-only policy; both modes install the same packages and set the same sysctl;
   - prints one line stating the configured sandbox, beginning `Configured policy:`, for the run log;
   - runs `neutralise-checkout-settings.sh <checkout>`, so no project `env`, hook or helper command reaches the CLI while `CLAUDE.md`, `AGENTS.md` and the skills beside them still load, and excludes sandcastle's `.sandcastle/` from git.
3. Provide the skills (below).
4. From the checkout, run the scripts with this repo's own tsx, with only the Claude credential and the [inputs](../README.md#inputs) in the step's environment:

   ```sh
   node <runner>/node_modules/.bin/tsx <runner>/implement/implement.ts
   node <runner>/node_modules/.bin/tsx <runner>/write-pr/write-pr.ts
   node <runner>/node_modules/.bin/tsx <runner>/review/review.ts
   node <runner>/node_modules/.bin/tsx <runner>/address-review/address-review.ts
   # optional, confirm mode:
   REVIEW_MODE=confirm node <runner>/node_modules/.bin/tsx <runner>/review/review.ts
   ```

   Leave `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` unset: Claude Code 2.1.284 then forces the default permission mode, and every write waits for an approval nobody can give.

5. After the scripts finish, the host pushes the branch and opens the pull request itself, and posts `review`'s and `address-review`'s payloads the same way (and `verdicts.json`, if it runs confirm mode). The agent never holds a token for that.

## Skills

| Script                       | Skills the host copies in                          |
| ---------------------------- | -------------------------------------------------- |
| `implement`                  | `<runner>/skills/implement`, `<runner>/skills/tdd` |
| `review`                     | `<runner>/skills/code-review`                      |
| `address-review`, `write-pr` | none                                               |

- Copy each to `<checkout>/.claude/skills/<name>`, unless the checkout has its own.
- When that path is a link to nothing (a skills install the code repo ignores), copy to the link's target instead, refusing a target outside the checkout.
- Add the path that received the copy to `<checkout>/.git/info/exclude`, so it never lands in a commit.

## Reading the run log

The run log shows the agent's text and its Bash, WebSearch, WebFetch and Agent calls, the tools Sandcastle prints. Skill, Read and Edit calls are not printed, so a skill's use shows only in what the agent says and does.
