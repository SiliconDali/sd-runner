---
"sd-runner": patch
---

`install-runner-policy.sh` installs bubblewrap and lifts the AppArmor user-namespace restriction with `--no-sandbox` too, so the two modes install the same packages and differ only in the policy file.
