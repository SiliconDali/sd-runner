#!/usr/bin/env bash
# Prepare a Linux host for a run, after `npm ci` in this repo and before the
# agent step: Claude Code at the version in package-lock.json onto PATH, the
# runner policy where Claude Code reads it, the configured sandbox reported,
# and the checkout's project settings neutralised. Run as the user the agent
# runs as; the two steps that need root go through sudo.
#
#   prepare-host.sh <checkout-root>
#
# Environment, for tests only:
#   RUNNER_POLICY_DIR   policy target (default /etc/claude-code)
#   CLAUDE_BIN_DIR      where `claude` is linked (default /usr/local/bin)
#   RUNNER_POLICY_DEPS  passed to install-runner-policy.sh
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: prepare-host.sh <checkout-root>" >&2
  exit 2
fi
checkout="$1"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
policy_dir="${RUNNER_POLICY_DIR:-/etc/claude-code}"
bin_dir="${CLAUDE_BIN_DIR:-/usr/local/bin}"

as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi
}

# Claude Code: npm ci verified the package against the lockfile's integrity
# hash; check the binary is the locked version, then put it on PATH.
claude="$root/node_modules/.bin/claude"
locked="$(jq -r '.packages["node_modules/@anthropic-ai/claude-code"].version // empty' "$root/package-lock.json")"
version="$("$claude" --version 2>/dev/null)" || {
  echo "prepare-host: Claude Code is not installed in $root/node_modules; run npm ci there first" >&2
  exit 1
}
case "$version" in
  "$locked "*) ;;
  *)
    echo "prepare-host: Claude Code is '$version', package-lock.json pins $locked" >&2
    exit 1
    ;;
esac
as_root ln -sf "$claude" "$bin_dir/claude"
echo "$version"

as_root env DESTDIR="$policy_dir" RUNNER_POLICY_DEPS="${RUNNER_POLICY_DEPS:-1}" \
  bash "$here/install-runner-policy.sh"

# Sandcastle's banner later in the run says "Sandbox: no-sandbox". That is its
# own container provider, off by design in the run scripts. Claude Code's
# sandbox is what the policy just installed configures.
f="$policy_dir/managed-settings.json"
if [ "$(jq -r '.sandbox.enabled // false' "$f")" = "true" ]; then
  hosts=$(jq -r '.sandbox.network.allowedDomains // [] | join(", ")' "$f")
  echo "Configured policy: Claude Code sandbox on, allowed hosts: ${hosts:-none}. Sandcastle's 'Sandbox: no-sandbox' banner below is its own container provider, not this."
else
  echo "Configured policy: Claude Code sandbox OFF."
fi

bash "$here/neutralise-checkout-settings.sh" "$checkout"
exclude="$(git -C "$checkout" rev-parse --git-path info/exclude)"
case "$exclude" in /*) ;; *) exclude="$checkout/$exclude" ;; esac
grep -qxF ".sandcastle/" "$exclude" || echo ".sandcastle/" >> "$exclude"
