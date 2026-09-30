---
"mattpocock-skills": patch
---

`install-runner-policy.sh` installs bubblewrap and lifts the AppArmor user-namespace restriction with `--no-sandbox` too, since `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` needs bubblewrap.
