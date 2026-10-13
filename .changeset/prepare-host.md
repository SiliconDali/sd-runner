---
"sd-runner": minor
---

Add `bin/prepare-host.sh <checkout>`, the one script a Linux host calls to prepare a run: Claude Code at the version `package-lock.json` pins, linked onto `PATH` after a version check; the runner policy installed to `/etc/claude-code/`; the configured-sandbox line printed for the run log, word for word what host workflows printed before; and the checkout's project settings neutralised, with `.sandcastle/` excluded. Claude Code is now a dependency, so `npm ci` installs it verified against its integrity hash, and `allowScripts` lets its postinstall fetch the native binary under npm versions that gate install scripts. The policy target and the link directory can be overridden for tests only.
