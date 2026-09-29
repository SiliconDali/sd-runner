#!/usr/bin/env bash
# Neutralise the checkout's project settings so no project `env`, hook or
# helper command reaches the CLI, while CLAUDE.md, AGENTS.md and the skills
# beside them keep loading. Run before the agent step.
#
#   neutralise-checkout-settings.sh [checkout-root]   (default: current dir)
#
# Each of .claude/settings.json and .claude/settings.local.json becomes `{}`.
# A tracked file is hidden from git with skip-worktree, so the agent's commits
# never carry the change; an untracked or missing file is created and listed
# in .git/info/exclude.
set -euo pipefail

cd "${1:-.}"
git rev-parse --show-toplevel >/dev/null
exclude="$(git rev-parse --git-path info/exclude)"

mkdir -p .claude
for file in .claude/settings.json .claude/settings.local.json; do
  if git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
    git update-index --skip-worktree "$file"
    printf '{}\n' > "$file"
    echo "$file: tracked, hidden with skip-worktree, contents replaced"
  else
    printf '{}\n' > "$file"
    mkdir -p "$(dirname "$exclude")"
    grep -qxF "$file" "$exclude" 2>/dev/null || echo "$file" >> "$exclude"
    echo "$file: created and excluded"
  fi
done
