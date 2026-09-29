#!/usr/bin/env bash
# Install the runner policy Claude Code reads above every other settings level,
# so nothing the checkout contains (hooks, MCP servers, project env) can
# override it. Run before the agent step, with the rights to write DESTDIR.
#
#   sudo install-runner-policy.sh              sandbox on: also installs
#                                              bubblewrap and socat and lifts
#                                              the AppArmor user-namespace
#                                              restriction (Ubuntu 24.04)
#   sudo install-runner-policy.sh --no-sandbox controls only: the sandbox
#                                              block is stripped
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

if [ "$sandbox" = 1 ]; then
  cp "$policy_dir/managed-settings.json" "$destdir/managed-settings.json"
  if [ "${RUNNER_POLICY_DEPS:-1}" = 1 ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq bubblewrap socat
    sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
  fi
else
  command -v jq >/dev/null || { echo "install-runner-policy: jq is required for --no-sandbox" >&2; exit 1; }
  jq 'del(.sandbox)' "$policy_dir/managed-settings.json" > "$destdir/managed-settings.json"
fi

cp "$policy_dir/managed-mcp.json" "$destdir/managed-mcp.json"
chmod 644 "$destdir/managed-settings.json" "$destdir/managed-mcp.json"

echo "runner policy installed to $destdir (sandbox $([ "$sandbox" = 1 ] && echo on || echo off))"
