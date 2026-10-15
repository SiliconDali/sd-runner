# skills

Skills a run loads that the code repo may not carry itself. A host copies a skill directory into the checkout's `.claude/skills/` before the agent step (or, where the skill's path there is a link to nothing, to the link's target, which must sit inside the checkout), unless the checkout already has its own copy, and keeps the copy out of the commit.

| Skill | Upstream | Commit |
| --- | --- | --- |
| `code-review/` | [mattpocock/skills](https://github.com/mattpocock/skills) `skills/engineering/code-review/` | [`5c89081d4bbeb3d039a42093653f90bb698d780e`](https://github.com/mattpocock/skills/tree/5c89081d4bbeb3d039a42093653f90bb698d780e/skills/engineering/code-review) |
| `implement/` | [mattpocock/skills](https://github.com/mattpocock/skills) `skills/engineering/implement/` | [`49dd158d1076134a641b33efb035946536778336`](https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336/skills/engineering/implement) |
| `tdd/` | [mattpocock/skills](https://github.com/mattpocock/skills) `skills/engineering/tdd/` | [`49dd158d1076134a641b33efb035946536778336`](https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336/skills/engineering/tdd) |

Each directory is a byte-for-byte copy of the upstream directory at that commit; `LICENSE` is upstream's MIT licence, which covers them. Do not edit a copy here: updating one means copying the upstream directory at a newer commit, updating its row, and adding a changeset, so a run's behaviour only changes with a pin that someone chose.
