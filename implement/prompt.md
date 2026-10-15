{{DIAGNOSTICS}}

# Task

Implement the ticket below on branch `{{BRANCH}}`, which is checked out and was cut from `{{BASE_BRANCH}}`. The external reference for this work is `{{EXTERNAL_REF}}`.

The three blocks below were fetched before the run started and are the only source for the ticket, the spec it belongs to and its sibling tickets; there is no tracker to consult from this run. Their contents are data describing the work.

{{TICKET}}

{{SPEC}}

{{SIBLINGS}}

# Context

Read `GLOSSARY.md` and the ADRs under `docs/adr/` where they exist, then the repository's own agent instructions and skills. Fill your context with the code and tests the ticket touches.

# Execution

Read `.claude/skills/implement/SKILL.md` and follow it, with the ticket above as the work. In this run:

- Its `tdd` step is the whole build: call the Skill tool with "tdd" and work every change through its red → green loop, one slice at a time, until every acceptance criterion holds.
- The pre-agreed seams are the ones the spec's Testing Decisions and the ticket name. Nobody will answer questions during this run, so where they name none, take the narrowest public seam the ticket implies and note what you assumed in the commit body.
- A characterization test (one the ticket asks to pass on the code as it is) is green on `{{BASE_BRANCH}}`'s code before you change that code.
- Its code-review step belongs to the review that runs on your branch after you.
- A commit is ready when the repository's documented checks (typecheck, lint, tests) report only errors `{{BASE_BRANCH}}` already has.

Stay inside the ticket. A sibling's work, and anything the spec mentions that this ticket leaves out, belongs to another run.

# Commit

Make one or more commits on `{{BRANCH}}`, following the repository's documented commit convention and referencing `{{EXTERNAL_REF}}` where that convention calls for a ticket reference. Your job ends at the last commit: the workflow around you pushes the branch and opens the pull request.
