# implement

`implement` works the ticket on `BRANCH` by the `implement` skill, building every change through the `tdd` skill's red → green loop at the seams the spec and ticket name.

- It makes one or more commits in the code repo's own convention. A run that ends with none fails with `Agent finished without committing on the branch.`
- A successful run writes nothing to `OUTPUT_DIR`.
- Uncommitted changes the agent leaves behind are logged as a warning and stay out of the commits the host pushes.

## Diagnostics

`DIAGNOSTICS_FILE`, optional: commands, one per line, that the agent runs in Bash before the task and reports verbatim (exit status and output) under a `Diagnostics` heading in its final message.

- It reaches the prompt as `<diagnostics>` under the section text in `implement/diagnostics.md`. Unset, the section is absent.
- For a host proving a runner control on one run, not for normal runs.
