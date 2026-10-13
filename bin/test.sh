#!/usr/bin/env bash
# Tests for the runner scripts, run against throwaway directories.
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

# install: deps are installed in both modes (they differ only in the policy file)
stubs="$tmp/stubs"; mkdir -p "$stubs"
for cmd in apt-get sysctl; do
  printf '#!/usr/bin/env bash\necho "%s $*" >> "%s/calls"\n' "$cmd" "$stubs" > "$stubs/$cmd"
  chmod +x "$stubs/$cmd"
done
for mode in "--no-sandbox" ""; do
  rm -f "$stubs/calls"
  # shellcheck disable=SC2086
  PATH="$stubs:$PATH" DESTDIR="$tmp/policy-deps" bash "$here/install-runner-policy.sh" $mode >/dev/null
  label="${mode:-sandbox}"
  assert "${label#--}: installs bubblewrap, socat, ripgrep" grep -Eq "apt-get install .*bubblewrap socat ripgrep" "$stubs/calls"
  assert "${label#--}: lifts userns restriction" grep -q "sysctl -w kernel.apparmor_restrict_unprivileged_userns=0" "$stubs/calls"
done

# install: unknown flag
set +e
DESTDIR="$tmp/x" RUNNER_POLICY_DEPS=0 bash "$here/install-runner-policy.sh" --bogus >/dev/null 2>&1
code=$?
set -e
assert "unknown flag exits 2" test "$code" = 2

# prepare-host: a throwaway checkout, policy and Claude Code into temp dirs,
# sudo stubbed to record its call and run it unprivileged
sudo_stub="$tmp/sudo-exec"; mkdir -p "$sudo_stub"
printf '#!/usr/bin/env bash\necho "$*" >> "%s/calls"\nexec "$@"\n' "$sudo_stub" > "$sudo_stub/sudo"
chmod +x "$sudo_stub/sudo"
repo="$tmp/host-code"
new_repo "$repo"
mkdir -p "$repo/.claude"
printf '{"hooks":{"PreToolUse":[{"command":"touch /tmp/marker"}]}}\n' > "$repo/.claude/settings.json"
git -C "$repo" add -A && git -C "$repo" commit -q -m init
policy="$tmp/host-policy"; bindir="$tmp/host-bin"; mkdir -p "$bindir"
locked="$(jq -r '.packages["node_modules/@anthropic-ai/claude-code"].version' "$here/../package-lock.json")"
hosts="$(jq -r '.sandbox.network.allowedDomains | join(", ")' "$here/../policy/managed-settings.json")"
set +e
out="$(PATH="$sudo_stub:$PATH" RUNNER_POLICY_DIR="$policy" CLAUDE_BIN_DIR="$bindir" RUNNER_POLICY_DEPS=0 \
  bash "$here/prepare-host.sh" "$repo" 2>&1)"
code=$?
set -e
assert "prepare-host: exits 0" test "$code" = 0
assert "prepare-host: Claude Code linked at the locked version" bash -c "'$bindir/claude' --version | grep -q '^$locked '"
assert "prepare-host: policy installed with the sandbox on" test "$(jq '.sandbox.enabled' "$policy/managed-settings.json")" = "true"
assert "prepare-host: managed mcp installed" test "$(jq -c . "$policy/managed-mcp.json")" = '{"mcpServers":{}}'
assert "prepare-host: policy installed through sudo" grep -q "install-runner-policy.sh" "$sudo_stub/calls"
assert "prepare-host: sandbox line word for word" grep -qxF "Configured policy: Claude Code sandbox on, allowed hosts: $hosts. Sandcastle's 'Sandbox: no-sandbox' banner below is its own container provider, not this." <<<"$out"
assert "prepare-host: settings neutralised" test "$(cat "$repo/.claude/settings.json")" = "{}"
assert "prepare-host: .sandcastle/ excluded" grep -qxF ".sandcastle/" "$repo/.git/info/exclude"
mkdir -p "$repo/.sandcastle" && touch "$repo/.sandcastle/log"
assert "prepare-host: checkout status clean" test -z "$(git -C "$repo" status --porcelain)"
PATH="$sudo_stub:$PATH" RUNNER_POLICY_DIR="$policy" CLAUDE_BIN_DIR="$bindir" RUNNER_POLICY_DEPS=0 \
  bash "$here/prepare-host.sh" "$repo" >/dev/null 2>&1
assert "prepare-host: second run adds no duplicate exclude" test "$(grep -cxF ".sandcastle/" "$repo/.git/info/exclude")" = 1

# prepare-host: the default targets are Claude Code's managed settings directory
# and a directory on PATH; sudo is stubbed to record only, so nothing is written
sudo_rec="$tmp/sudo-record"; mkdir -p "$sudo_rec"
printf '#!/usr/bin/env bash\necho "$*" >> "%s/calls"\n' "$sudo_rec" > "$sudo_rec/sudo"
chmod +x "$sudo_rec/sudo"
PATH="$sudo_rec:$PATH" RUNNER_POLICY_DEPS=0 bash "$here/prepare-host.sh" "$repo" >/dev/null 2>&1 || true
assert "prepare-host: default policy target is /etc/claude-code" grep -q "DESTDIR=/etc/claude-code .*install-runner-policy.sh" "$sudo_rec/calls"
assert "prepare-host: default Claude Code link is /usr/local/bin/claude" grep -q "ln -sf .* /usr/local/bin/claude$" "$sudo_rec/calls"

# prepare-host: no checkout argument
set +e
bash "$here/prepare-host.sh" >/dev/null 2>&1
code=$?
set -e
assert "prepare-host: missing checkout exits 2" test "$code" = 2

if [ "$failures" -gt 0 ]; then
  echo "$failures shell test(s) failed" >&2
  exit 1
fi
echo "all shell tests passed"
