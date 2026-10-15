# write-pr

`write-pr` drafts the pull request title and description in one pass from the ticket and the branch's log and diff against `BASE_BRANCH`, in the code repo's documented pull request conventions where it has any.

- The output must validate: a title of 1 to 256 characters, a non-empty description.
- A failure resumes the session with feedback, up to 3 attempts in all, then fails the run with `PR text did not validate after 3 attempts`.
- `pr_title.txt` keeps the title's first line.
