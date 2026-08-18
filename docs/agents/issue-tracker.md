# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub issues on
`Kieren-Foenander/t3code`. Use the `gh` CLI for all operations and always pass
`--repo Kieren-Foenander/t3code`; do not infer the target from the configured remotes because
`upstream` points at `pingdotgg/t3code`.

## Conventions

- Create: `gh issue create --repo Kieren-Foenander/t3code --title "..." --body-file <file>`.
- Read: `gh issue view <number> --repo Kieren-Foenander/t3code --comments`.
- List: `gh issue list --repo Kieren-Foenander/t3code` with the required state and label filters.
- Comment: `gh issue comment <number> --repo Kieren-Foenander/t3code --body "..."`.
- Apply or remove labels with `gh issue edit` and the explicit repository argument.
- Close with `gh issue close` and a concise explanatory comment.

## Skill terminology

When a skill says to publish to the issue tracker, create a GitHub issue on the fork named above.
When a skill says to fetch a relevant ticket, read it from that fork, including comments and labels.
