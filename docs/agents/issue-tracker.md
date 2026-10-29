# Issue tracker: Plane

Issues and specs for this repo live in Plane Cloud, not on GitHub. Use the Plane MCP server for all operations. Its tools take an `action` argument, for example `workitem` with `action: "create"`.

- Workspace slug: `reilley`
- Project: `mtgscan`, identifier `MTGSCAN`, id `c37cdc69-f5f1-4eb6-b6fd-e0a2fff0b9e1`
- Work item URL: `https://app.plane.so/reilley/browse/MTGSCAN-<n>/`

Plane calls issues "work items". Tools that take a UUID (`state`, `labels`, `assignees`, `parent`) need the id, not the name. Look ids up with `state list`, `label list` and `member me` first.

## Old GitHub issue numbers

On 2026-10-29 every GitHub issue moved to Plane, and the GitHub issues were deleted. Each work item keeps its old number in `external_id`, with `external_source: "github"`, and its description starts with the old number. Commits, PRs and docs from before then still say `#N`. GitHub shares one number space across issues and PRs, so `#N` may be a PR: try `gh pr view N` first. If no PR has that number, find the work item with `workitem list`, `project_id`, `external_source: "github"` and `external_id: "N"`.

## States and the board

The board columns are the project's states. Move a work item by updating its `state`.

| State | Group | Meaning |
| --- | --- | --- |
| Backlog | backlog | Open, not ready to start. The default for new work items. |
| Todo | unstarted | Open and ready to start. |
| In Progress | started | Claimed and being worked on. |
| Done | completed | Resolved. |
| Cancelled | cancelled | Will not be done, or ruled out of scope. |

A work item is **open** while its state group is `backlog`, `unstarted` or `started`, and **closed** once it is `completed` or `cancelled`.

## Conventions

- **Create an issue**: `workitem create` with `project_id`, `name` and `description_html`. Descriptions and comments are HTML, so convert markdown before sending it.
- **Read an issue**: `workitem retrieve_by_identifier` with `workitem_identifier: "MTGSCAN-<n>"`. Read its comments with `workitem_comment list`.
- **List issues**: `workitem list` with `project_id` and a PQL filter, for example `stateGroup IN openStates() AND label = "<label id>"`. Pass `fields` (such as `id,name,parent,assignees,labels,sequence_id,state`) to keep the result small. Call `get_pql_reference` for the syntax. PQL cannot filter on `parent`, so filter children in code.
- **Make an issue a sub-issue of a parent**: pass `parent: <parent id>` to `workitem create`, or set it later with `workitem update`.
- **Blocking**: Plane's native dependencies. `workitem_relation create` with `workitem_id: <blocked id>`, `workitem_ids: [<blocker id>, ...]` and `relation_type: "blocked_by"`. A work item is unblocked when every item in its `blocked_by` list is closed.
- **Count open blockers**: `workitem_relation list` on the work item returns `dependencies.blocked_by` with each blocker's `state_id`. Count the blockers whose state is in an open group.
- **Comment on an issue**: `workitem_comment create` with `comment_html`.
- **Apply / remove labels**: `workitem manage_label` with `add_label_id` or `remove_label_id`. Create a missing label first with `label create`.
- **Close**: post the explanation with `workitem_comment create`, then `workitem update` with the Done state. Use the Cancelled state instead when the issue will not be done.

## Link a pull request to an issue

GitHub closing keywords such as `Closes #N` do not reach Plane. Name the work item by its identifier and link it.

- In a PR body, write `Part of [MTGSCAN-N](https://app.plane.so/reilley/browse/MTGSCAN-N/)`. List any post-merge steps, such as a hosted import or an owner check.
- In a commit message, write `Refs MTGSCAN-N`.
- After the merge, when every acceptance criterion is done, comment on the work item with the PR link and move it to Done.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

## When a skill says "publish to the issue tracker"

Create a work item in the `mtgscan` project.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single work item with **child** work items as tickets.

- **Map**: a work item labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. It stays In Progress while the effort runs and moves to Done when the map clears.
- **Child ticket**: a work item whose `parent` is the map. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). New tickets start in Backlog. Once claimed, the ticket is assigned to the driving dev and moves to In Progress.
- **Blocking**: see **Blocking** under Conventions. Create every ticket first, then add the relations in a second pass, because relations need ids.
- **Frontier query**: list the project's open work items with `fields` including `parent` and `assignees`, keep those whose `parent` is the map, drop any with an assignee, then drop any with an open blocker (see **Count open blockers**). The lowest `sequence_id` wins.
- **Claim**: `workitem update` with `assignees: [<your member id>]` and the In Progress state, as the session's first write. Get the member id from `member me`.
- **Resolve**: post the answer with `workitem_comment create`, move the ticket to Done, then append a context pointer (gist + link) to the map's Decisions-so-far with `workitem update` on the map's `description_html`.
