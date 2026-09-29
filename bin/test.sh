#!/usr/bin/env bash
# Tests for the two runner scripts, run against throwaway directories.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failures=0

assert() {
  local name="$1"; shift
  if "$@"; then
    echo "ok   $name"
  else
    echo "FAIL $name" >&2
    failures=$((failures + 1))
  fi
}

new_repo() {
  local dir="$1"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email t@example.com
  git -C "$dir" config user.name t
}

# neutralise: tracked settings file with hooks, skills beside it
repo="$tmp/tracked"
new_repo "$repo"
mkdir -p "$repo/.claude/skills/x"
printf '{"hooks":{"PreToolUse":[{"command":"touch /tmp/marker"}]}}\n' > "$repo/.claude/settings.json"
printf 'skill body\n' > "$repo/.claude/skills/x/SKILL.md"
git -C "$repo" add -A && git -C "$repo" commit -q -m init
bash "$here/neutralise-checkout-settings.sh" "$repo" >/dev/null
assert "tracked settings.json becomes {}" test "$(cat "$repo/.claude/settings.json")" = "{}"
assert "settings.local.json becomes {}" test "$(cat "$repo/.claude/settings.local.json")" = "{}"
assert "status is clean" test -z "$(git -C "$repo" status --porcelain)"
assert "settings.json is skip-worktree" bash -c "git -C '$repo' ls-files -v | grep -q '^S .claude/settings.json'"
assert "skill untouched" test "$(cat "$repo/.claude/skills/x/SKILL.md")" = "skill body"
git -C "$repo" add -A
assert "git add -A stages nothing" test -z "$(git -C "$repo" status --porcelain)"

# neutralise: repo without a .claude dir
repo="$tmp/bare"
new_repo "$repo"
printf 'x\n' > "$repo/README.md"
git -C "$repo" add -A && git -C "$repo" commit -q -m init
bash "$here/neutralise-checkout-settings.sh" "$repo" >/dev/null
assert "missing settings.json created as {}" test "$(cat "$repo/.claude/settings.json")" = "{}"
assert "missing settings.local.json created as {}" test "$(cat "$repo/.claude/settings.local.json")" = "{}"
assert "created files are excluded" test -z "$(git -C "$repo" status --porcelain)"

# install: --no-sandbox strips the sandbox block
dest="$tmp/policy-off"
DESTDIR="$dest" RUNNER_POLICY_DEPS=0 bash "$here/install-runner-policy.sh" --no-sandbox >/dev/null
assert "no-sandbox: sandbox key absent" test "$(jq 'has("sandbox")' "$dest/managed-settings.json")" = "false"
assert "no-sandbox: hooks disabled" test "$(jq '.disableAllHooks' "$dest/managed-settings.json")" = "true"
assert "no-sandbox: HUSKY pinned" test "$(jq -r '.env.HUSKY' "$dest/managed-settings.json")" = "0"
assert "no-sandbox: managed mcp empty" test "$(jq -c . "$dest/managed-mcp.json")" = '{"mcpServers":{}}'

# install: default keeps the sandbox block
dest="$tmp/policy-on"
DESTDIR="$dest" RUNNER_POLICY_DEPS=0 bash "$here/install-runner-policy.sh" >/dev/null
assert "sandbox: strict allowlist on" test "$(jq '.sandbox.network.strictAllowlist' "$dest/managed-settings.json")" = "true"
assert "sandbox: managed mcp empty" test "$(jq -c . "$dest/managed-mcp.json")" = '{"mcpServers":{}}'

# install: unknown flag
set +e
DESTDIR="$tmp/x" RUNNER_POLICY_DEPS=0 bash "$here/install-runner-policy.sh" --bogus >/dev/null 2>&1
code=$?
set -e
assert "unknown flag exits 2" test "$code" = 2

if [ "$failures" -gt 0 ]; then
  echo "$failures shell test(s) failed" >&2
  exit 1
fi
echo "all shell tests passed"
