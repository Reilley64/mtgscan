# Issue tracker: GitHub

Implementation and change requests for this repo live in GitHub Issues at
`Reilley64/mtgscan`. In the AI feature workflow, a ticket is a published
GitHub implementation issue. Living feature specifications stay in `docs/features/`.
Use the `gh` CLI for issue operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments with `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`. The `gh` CLI does this automatically when run inside the worktree.

## Living specification impact

Every behavior-changing feature ticket must include this section:

```markdown
## Living specification impact

Canonical spec path: `docs/features/<feature-slug>/spec.md`
Affected or reserved requirement IDs: `<FEATURE-SLUG-UPPER>-REQ-001`, `<FEATURE-SLUG-UPPER>-REQ-002`
Action: Create or update the spec in the implementation PR.
```

Use exactly one action:

- `Action: Create or update the spec in the implementation PR.`
- `Action: No spec change. Reason: <concrete reason>.`

When the ticket changes intended behavior, require a spec create or update. Add that
work to the ticket acceptance criteria.

When the ticket fixes a bug that restores existing specified behavior, use no spec
change only if the reason cites the existing behavior, canonical spec path, and
affected requirement IDs.

Tickets are change requests. They are not the canonical feature contract.

### Ticket acceptance criteria

Every behavior-changing feature ticket must require the implementation PR to:

- update the canonical living spec at the listed path;
- update the cited or reserved requirements and the verification matrix evidence
  status;
- add or update tests at the agreed verification boundary;
- update the interface contract when the ticket changes a machine-facing interface;
- stop for clarification if the ticket, spec, interface contract, or code conflicts.

A ticket may omit the spec-update acceptance criterion only when its living-spec
impact action is `No spec change` and the concrete reason satisfies the bug-fix
policy above.

### New-feature ticket sets

When `to-tickets` breaks down a new feature, it must reserve one feature slug, one
canonical spec path, and stable requirement IDs across the approved ticket set
before publishing tickets.

Use this lifecycle:

1. The first vertical ticket creates `docs/features/<feature-slug>/spec.md` as
   Draft and adds the requirements assigned to that slice.
2. Later vertical tickets extend or update the same Draft spec and keep the
   reserved IDs stable.
3. The final ticket verifies the complete approved feature, updates evidence
   statuses, and promotes Draft to Active only when all approved behavior is
   delivered and evidenced.

Do not create a horizontal spec-only ticket. Bundle spec creation with the first
vertical slice.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` if the repo treats external PRs as feature requests. The `/triage` skill reads this flag.

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>`.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`, then keep only `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` author associations.
- **Comment, label, or close**: use `gh pr comment`, `gh pr edit --add-label` or `--remove-label`, and `gh pr close`.

GitHub shares one number space across issues and PRs. A bare `#42` may be either. Resolve it with `gh pr view 42`, then fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

The `/wayfinder` skill uses one map issue with child issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes, Decisions-so-far, and Fog body. Create it with `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue using `gh api`. Where sub-issues are unavailable, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Apply a `wayfinder:<type>` label, where the type is `research`, `prototype`, `grilling`, or `task`. Once claimed, assign the ticket to the driving developer.
- **Blocking**: use GitHub's native issue dependencies. Add an edge with `gh api --method POST repos/Reilley64/mtgscan/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. Fetch the blocker's numeric database ID with `gh api repos/Reilley64/mtgscan/issues/<number> --jq .id`. Do not use the issue number or `node_id`. If dependencies are unavailable, add `Blocked by: #<number>` at the top of the child body.
- **Frontier query**: list the map's open children, then remove tickets with an open blocker or an assignee. The first remaining ticket in map order wins.
- **Claim**: run `gh issue edit <number> --add-assignee @me`. This is the session's first write.
- **Resolve**: comment with the answer, close the issue, then append a context pointer and link to the map's Decisions-so-far section.
