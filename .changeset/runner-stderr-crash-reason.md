---
"mattpocock-skills": patch
---

`runner`: the agent's stderr reaches the log on every run, not only on a non-zero exit, so a warning the CLI prints on a successful run is no longer lost. A CLI crash's failure reason is trimmed to sandcastle's header and the `error:` line instead of the bundle dump and stack. `install-runner-policy.sh` also installs ripgrep for the sandbox runtime.
