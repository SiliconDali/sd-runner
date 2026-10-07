#!/usr/bin/env bash
# Install the runner policy Claude Code reads above every other settings level,
# so nothing the checkout contains (hooks, MCP servers, project env) can
# override it. Run before the agent step, with the rights to write DESTDIR.
#
#   sudo install-runner-policy.sh              sandbox on
#   sudo install-runner-policy.sh --no-sandbox controls only: the sandbox
#                                              block is stripped
#
# Both modes install bubblewrap, socat and ripgrep (the sandbox runtime needs
# rg, Claude Code does not) and lift the AppArmor user-namespace restriction
# (Ubuntu 24.04), so the two modes differ only in the policy file.
#
# Environment:
#   DESTDIR             where the two files go (default /etc/claude-code)
#   RUNNER_POLICY_DEPS  set to 0 to skip apt-get and sysctl (tests, hosts that
#                       already have both)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
policy_dir="$here/../policy"
destdir="${DESTDIR:-/etc/claude-code}"
sandbox=1

for arg in "$@"; do
  case "$arg" in
    --no-sandbox) sandbox=0 ;;
    *)
      echo "install-runner-policy: unknown argument '$arg'" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$destdir"

if [ "${RUNNER_POLICY_DEPS:-1}" = 1 ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq bubblewrap socat ripgrep
  sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
fi

if [ "$sandbox" = 1 ]; then
  cp "$policy_dir/managed-settings.json" "$destdir/managed-settings.json"
else
  command -v jq >/dev/null || { echo "install-runner-policy: jq is required for --no-sandbox" >&2; exit 1; }
  jq 'del(.sandbox)' "$policy_dir/managed-settings.json" > "$destdir/managed-settings.json"
fi

cp "$policy_dir/managed-mcp.json" "$destdir/managed-mcp.json"
chmod 644 "$destdir/managed-settings.json" "$destdir/managed-mcp.json"

echo "runner policy installed to $destdir (sandbox $([ "$sandbox" = 1 ] && echo on || echo off))"
