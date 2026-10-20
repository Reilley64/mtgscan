# Declarative database schemas

Date: 2026-10-19

Research notes for the architecture review of 19 October 2026. Candidate 4: keep each database function's current source in one file, with Supabase declarative schemas, instead of copying a full `create or replace` into each migration.

Sources: the review HTML (candidate 4), the explorer notes `supabase.md` (candidate 3 there), `GLOSSARY.md`, `CODING_STANDARDS.md`, `docs/adr/`, `docs/agents/local-development.md`, tickets #410, #411, #412, the git history of this worktree (`36c0138` is the tip), the Supabase CLI source at tag `v2.120.0` (github.com/supabase/cli), the pg-delta source at `@supabase/pg-delta@1.0.0-alpha.57` (github.com/supabase/pg-toolbelt), and the Supabase docs pages "Declarative database schemas" and "Diff engines" (github.com/supabase/supabase, `apps/docs/content/guides/local-development/`). I did not start Supabase, so nothing below was run against a database. Line counts come from a script over `supabase/migrations/*.sql`.

## 1. Is the friction real and as large as the review says?

The cost of copying is real and large. The silent loss that the review leads with has not happened yet, and the clash it cites was a timestamp clash, which declarative schemas do not prevent. The review also names the wrong commands for this repo's CLI.

### Claims that hold

- Function copies are most of the migration text. The 110 migration files have 31,245 lines. About 28,100 of them are function definitions. The current source of the live functions is about 9,500 lines, so about 18,600 lines are superseded copies.
- The copy counts in the review are right. `private.run_search` has 13 definitions (3,515 lines), `private.checked_object` 12, `private.check_search_query` 10, `public.get_copy` 10, `public.get_deck` 8, `private.judge_deck` 7. The review missed some that are as bad: `public.set_deck_commander` 8, `public.revert_deck_changes` 7 (854 lines), `public.add_deck_card` 7, `private.check_request` 7. In all, 109 live functions have more than one copy, 395 copies in total.
- #408 (`aed0f72`) adds a 299-line migration, `20261222090000_return_when_each_copy_was_created.sql`. The change to `run_search` inside it is 5 lines. #409 (`36c0138`) repeats the pattern: a 287-line migration for a 7-line change to `run_search` (the sort on `created_at`). A reviewer cannot see either change without diffing the two copies by hand.
- The rule "A migration that replaces a function starts from the latest version on `main`, so that parallel changes survive" is `CODING_STANDARDS.md:79`. It was added in `b223c61` (spec 1 retro). It is a manual way to keep two copies in sync, and nothing checks it.
- `supabase/config.toml:60-65` has `[db.migrations]` with `schema_paths = []`.

### Claims that are wrong or overstated

- There are 110 migrations, not 112 (`ls supabase/migrations`, the same on `origin/main`).
- The review counts "about 260" live functions. By name, I count about 284 (80 in `public`, 194 in `private`, the rest in `catalog_import`). Overloads are not split.
- The tool advice is wrong for this repo. `supabase/config.toml:418-421` sets `[experimental.pgdelta] enabled = true`. `supabase init` wrote it in `ac44836`. So the repo already uses the pg-delta diff engine, not migra. On pg-delta:
  - `supabase db diff` never reads schema files. It always compares a live database with a shadow built from `supabase/migrations` (CLI `apps/cli/src/commands/db/diff/diff.command.ts:103`; Diff engines page, table row "What `db diff` compares").
  - `schema_paths` is ignored, and the CLI warns when it lists paths (`apps/cli/src/command-internal/diff-engine.ts:4-5`; Declarative page, line 272).
  - The commands are `supabase db schema declarative generate` (export a database into schema files) and `supabase db schema declarative sync` (write a migration from the difference between the migrations and the schema files). Both need pg-delta (`apps/cli/docs/supabase/db/schema-declarative-generate.md:11`; sync `SIDE_EFFECTS.md:112`).
  - The docs warn against `db diff` here: "Don't use `supabase db diff` here, because it diffs a live database against your migrations and never uses `supabase/schemas/` as its baseline" (Declarative page, line 94).
- "#408 becomes a one-line diff of `run_search.sql`" is only half true. The schema file diff would be 5 lines. But pg-delta still writes the whole function into the generated migration. A changed body re-runs the full `pg_get_functiondef` output as `CREATE OR REPLACE` (pg-delta `src/plan/rules/routines.ts:53-62`; `src/extract/routines.ts:20`). So each PR still adds a migration of about 290 lines for `run_search`. It is generated and is not the thing to review.
- #408 touched 16 files. Only the migration is SQL. The other 15 are TypeScript types, the zod schemas, the app fake, and tests. Declarative schemas fix none of those. #410 does.
- Silent loss has not happened in the history. I checked every function with 3 or more copies for lines that one copy adds and the next copy removes. The 18 hits are all deliberate, for example the price conversion that moved to the app in `20261108090000`, and the deck suggestion removal in `20261125090000`. The nearest case is `private.checked_object`: #380 (`4d86f3a`) changed it twice and #399 (`abcceba`) changed it twice in parallel. #399's copies kept #380's lines, so the rule worked.
- The recorded clash (memory "integration branch migrations can clash with main") is spec 10's `20261218090000` against #400's `20261218090000`: two files with the same timestamp, so `schema_migrations_pkey` failed. Generated migrations still get timestamps, so declarative schemas do not prevent this. The fix stays the rule in `docs/agents/local-development.md:165-166`.

### What the review missed

- Data changes are common and must stay hand-written. 14 migrations have data statements outside function bodies: the deck evaluation recomputes (`20261113110000` to `20261114160000`), `delete from public.card_prices` (`20261104090000`), the copy split `do` block (`20261027090000`), the who-changed backfill (`20261213090000`, `20261221090000`), `update public.copies` with the `record_who_changed` trigger turned off (#408), the `storage.buckets` rows (`20261021090000`, `20261219090000`), and the `private.storage_limit` row (`20261220090000`). pg-delta never captures data, and a data statement in a schema file is an error (Declarative page, line 321).
- ADR 0006 says "A migration that changes the judge also recomputes every deck" (`docs/adr/0006-...md:10`). With declarative schemas, a judge change becomes a generated migration plus a hand-written recompute migration that must sort after it.
- `alter role service_role set statement_timeout = '2min'` (`20261009070000_create_card_catalog.sql:344`) is not tracked. pg-delta's Supabase policy leaves out the `service_role` role object (`src/policy/supabase.ts:117-128`, Rule 7 at line 637). It must stay in the migrations.
- `supabase/tests/who-changed-records-migration.test.ts:12` resets to `20261212090000` and replays later migrations with `migration up`. It needs the migration history to stay as it is. All options below keep it.

## 2. What the deepened module would own

Today a database function has no module. Its source is spread over every migration that replaced it, and the live version is whichever ran last. The deepened module is one file per function that holds its current source and its grants. Its interface is "edit the file". The implementation, the migration that deploys the change, is generated behind a seam by `sync` and checked in CI. That gives locality (one place to read, change, and review a function) and leverage (one CI check covers every function, policy, and grant).

### What pg-delta handles (CLI 2.120.0, pg-delta 1.0.0-alpha.57)

| Object | How it is handled | Source |
|---|---|---|
| Functions | Modeled. The fact is `pg_get_functiondef`. A body, volatility, `security definer`, or `set search_path` change re-runs `CREATE OR REPLACE` in place, so grants survive. A change to the return type, argument names, or defaults drops and recreates the function and rebuilds its dependents. | `src/extract/routines.ts:13-31`; `src/plan/rules/routines.ts:53-75` |
| Grants and revokes on functions | Modeled as ACL facts, normalized against `acldefault`. The export writes them in the same file as their function. | `COVERAGE.md:18-19`; `src/frontends/export-sql-files.ts:204-206` |
| `alter default privileges for role postgres revoke execute on functions from public` (`c5afcb5`, #287) | Modeled ("default privilege"). Only defaults FOR a Supabase system role are left out. Defaults FOR `postgres` that grant to `anon`, `authenticated`, or `service_role` stay user state. | `COVERAGE.md:9`; `src/policy/supabase.ts:579-590` |
| RLS policies (52 `create policy`), including `storage.objects` | Modeled. Policies on managed tables are captured. | `COVERAGE.md:9-12`; partial `managed_schemas_diff_capture.mdx` |
| Triggers (2), including the one `on auth.users` | Modeled. A trigger on `auth.users` counts as yours when its function is outside `auth`. | same partial |
| Comments | Modeled. The repo has none (`CODING_STANDARDS.md:21`). | `COVERAGE.md:18` |
| Views with `security_invoker` (8 files) | Modeled. migra drops this setting. | Diff engines page; Declarative page, legacy limits |
| Roles `catalog_importer`, `deck_evaluator` | Modeled, in `_cluster/roles.sql`. | generate doc `:7` |
| Data, `storage.buckets` rows, `service_role` settings | Not captured. Hand-written migrations. | Declarative page, line 321 |

One trap for this repo: the docs say generated `GRANT`/`REVOKE` lines "you didn't write" are "safe to remove" if you have not customized permissions (Declarative page, lines 323-325). This repo has customized them (`CODING_STANDARDS.md:73-75`). Those lines must stay.

### Rules that would move

- `CODING_STANDARDS.md:79` ("starts from the latest version on `main`") goes away. Editing the one file replaces it.
- `CODING_STANDARDS.md:72-75` (`search_path = ''`, revoke then grant, closed `private` functions) stay. They become visible in one file per function. `supabase/tests/private-functions.test.ts` keeps checking them as behavior.
- `docs/agents/local-development.md:163-167` (Migrations) gains: edit the schema file, run `sync`, write data changes as their own migration, and after a rebase run `sync` again rather than only renaming.
- `README.md:168` ("After you change a migration") changes the same way.
- ADR 0006 (recompute on a judge change) needs a note on migration order. No ADR conflicts.

### Option A: schema files are the source, migrations are generated

Run `supabase db schema declarative generate --local` once after `db reset`. It writes `supabase/schemas/<schema>/<kind>/<name>.sql`. The 110 migrations stay as the history. The hosted project has run them, so no squash and no `migration repair` are needed. The Declarative page (line 295) requires that the history "describe the same database before your first `sync`". The adoption check is that the first `sync` says "No schema changes found". From then on, change the schema file and run `supabase db schema declarative sync --name <change> --no-apply`.

CI check, in the `database` job of `.github/workflows/checks.yml` after "Start local Supabase" (line 112): run `sync --no-apply --strict-coverage` and fail when `git status --porcelain supabase/migrations` is not empty. `sync` exits 0 both when it writes a file and when it finds nothing (sync `SIDE_EFFECTS.md:69`), so the git check does the work.

- Gains: real locality. Review reads the schema diff. When two branches change different parts of one function, git merges the schema file. The stale generated migration then makes the CI check fail, so a lost change becomes a red check instead of a silent overwrite. Today nothing catches it.
- Costs: authors write two kinds of migration, and the order between generated and hand-written ones matters (#408's backfill, ADR 0006's recompute). pg-delta is pre-1.0 and under `[experimental]` (Diff engines page, line 10). Its tree format has already moved once: from `supabase/database` to `supabase/schemas` in CLI 2.115.0, and `sync` now refuses trees from older exports (sync `SIDE_EFFECTS.md:92-100`). Each CLI bump may force a regenerate. Generated SQL is uppercase by default unless `format_options` sets lower case. `sync` builds two extra shadow databases, so the CI job gets slower by an amount I could not measure.

### Option B: a generated read-only snapshot of the schema, checked in CI

Keep writing migrations by hand. Commit the output of `generate --local` as a snapshot, the same way `supabase/database.types.ts` is generated and checked today (`supabase/package.json:24-25`, `checks.yml:115`). Add a `schema:check` script: after `supabase start`, run `generate --local --output-dir <tmp>` and `diff -r` it against the committed tree.

- Gains: a PR shows the function diff in the snapshot file, next to its grants. A stale copy that auto-merges in the snapshot fails the check, because the regenerated file lacks the other branch's lines. If the snapshot conflicts, the author regenerates it, and the lost lines show as removals in review. No change to how migrations are written. `generate` is the first step of option A anyway.
- Costs: authors still copy the full function into each migration, so `CODING_STANDARDS.md:79` stays. Locality improves for reading and review, not for writing. CLI bumps regenerate the snapshot.

### Option C: no new tool, a repo script

Add a script that starts a new migration from the live `pg_get_functiondef` of the local database, and a check that prints each replaced function's diff against its previous migration copy.

- Gains: no pre-1.0 dependency. It automates the "start from the latest" step.
- Costs: no file per function, so no locality and no git merges. The script is new code to own. It is the shallowest of the three.

## 3. Cost and risk

Files touched, option A:

- New: `supabase/schemas/**`. About 284 function files plus tables, types, views, policies, roles, and extensions, likely 400 or more files and about 12,000 lines. Generated once.
- Changed: `supabase/config.toml` (maybe `format_options` for lower-case SQL), `.github/workflows/checks.yml` (one step), `CODING_STANDARDS.md:79`, `docs/agents/local-development.md:163-167`, `README.md:168`, and any agent skill that tells an implementer to copy a function.
- Unchanged: the 110 migrations, `.github/workflows/database-migrations.yml` (`supabase db push` still reads `supabase/migrations`; it honors pg-delta's `transaction=false` files), `database.types.ts`, every app module.

Option B touches the same new tree, `supabase/package.json`, `checks.yml`, and the README. It leaves the standards as they are.

Tests: no test changes. The suite tests behavior, not SQL text (`CODING_STANDARDS.md:98`). `private-functions.test.ts:8,23` keeps checking the closed-by-default rule. `who-changed-records-migration.test.ts` keeps working because the history stays.

Risks and what could go wrong:

- The engine is experimental. A pg-delta bug in a generated migration reaches the hosted database through `db push`. The suite runs only after `supabase start`, and `start` applies the same migrations, so the suite would catch most of it.
- Grants. A reviewer who follows the docs' "safe to remove" advice would undo #287. The standards must say that generated grant lines stay.
- Signature changes. Changing argument names or defaults drops and recreates the function and rebuilds its dependents (`routines.ts:73-74`). That is correct, but the migration can be larger than the author expects.
- Order of hand-written data migrations. A backfill or a recompute must sort after the generated migration it depends on. `sync` stamps the current time, so a data migration written earlier sorts first and fails.
- Integration branches. After merging `main`, the agent must run `sync` again, not only rename. A renamed stale generated migration that sorts last would overwrite `main`'s change. The option A check catches this. Without the check, it is the same silent risk as today.
- Adoption PR. It conflicts with every open branch that adds a migration. Each later migration makes the tree stale until someone regenerates it. Land it when no spec integration branch is open.
- Local cost. Each worktree runs its own stack (memory "one local Supabase stack per worktree"). `sync` adds two shadow databases on random ports, with a shared baseline cache in `~/.supabase/cache/shadow-baseline` (about 90 MB per entry, sync `SIDE_EFFECTS.md:44`). That fits the per-worktree setup but uses more Docker memory.

Conflicts: none with an ADR. Option A replaces the process rule at `CODING_STANDARDS.md:79` and part of `local-development.md:163-167`, so it needs the owner's approval. Option B conflicts with nothing.

Overlap with filed tickets:

- #410 (one contract per database function): no overlap in code. #410 removes the 15 non-SQL file edits of a #408-style change. This candidate removes the SQL copy. They are independent and can land in either order. Both are large, so do not run them in parallel branches if #410 changes SQL. Its open item on the protected copy codes may.
- #411 (fake Supabase client as a thin adapter) and #412 (one read lifecycle module): no overlap.

## 4. Recommendation

Do it after a trial, in two steps, and keep the strength at **Worth exploring**.

1. Trial now, on a throwaway branch, with no merge. Run `generate --local` after `db reset`, then `sync`, and check for "No schema changes found". Replay #408 and #409 as schema file edits and compare the generated migrations with the hand-written ones. Time the `sync` step in CI. Check how the default privilege from `c5afcb5` and the `public` revoke-then-grant pattern come out in the tree.
2. If the trial is clean, land option B first (snapshot plus CI check). It needs no process change, it gives reviewers function diffs at once, and it turns an auto-merged stale copy into a red check. Land it in a window with no open spec integration branch.
3. Move to option A after a few PRs on option B, with the owner's agreement to replace `CODING_STANDARDS.md:79`.

Why not Strong: the copy cost is real (about 18,600 superseded lines, 5- and 7-line changes shipped as 287- and 299-line files), but it costs review time, not correctness. The history shows no lost change. The cited clash is a timestamp clash that this does not fix. The engine is pre-1.0 and its tree format has already changed once. Why not Speculative: the tooling exists in the pinned CLI, the repo already runs pg-delta, and option B is low risk. No ticket is needed before the trial.

## 5. Trial

Date: 2026-10-20. Ticket #416.

I ran the trial on throwaway branches. None of them is merged, and none has a PR.

- `trial/pg-delta-declarative`: the tree generated from `main` at `e0d2b42`, with the three `_custom` files that `sync` needs.
- `trial/pg-delta-replay-408`: the tree before #408, then #408 replayed as an edit to the tree.
- `trial/pg-delta-replay-409`: the tree before #409, then #409 replayed the same way.

The trial used Supabase CLI 2.120.0. It pins `@supabase/pg-delta` 1.0.0-alpha.57 (`apps/cli/package.json` at tag `v2.120.0`). The local database is PostgreSQL 17.11.

### Generate, then sync

After `db reset`, `supabase db schema declarative generate --local` wrote `supabase/schemas`: 363 SQL files with 13,927 lines, and `.pgdelta-export.json`. There is one file per object: 275 functions, 48 tables, 25 types, 3 views, 4 extensions, the schemas, and the default privileges.

The first `supabase db schema declarative sync --no-apply` did not report "No schema changes found". It failed before planning, because the shadow database could not load the tree. Two causes:

1. The tree has no roles. The export runs in the `database` scope, and that scope leaves out every cluster role, including `catalog_importer` and `deck_evaluator`, which the migrations create. There is no `_cluster/roles.sql`. So 70 files failed with `role "catalog_importer" does not exist` or `schema "catalog_import" does not exist`. A `create role` in a `_custom/` file is refused: "scope database does not manage cluster-global roles". The CLI has no flag for the cluster scope.
2. 13 public functions are owned by `catalog_importer` or `deck_evaluator`. The tree sets the owner with `ALTER FUNCTION ... OWNER TO`, which needs `create` on schema `public`. The migrations grant it for a moment and revoke it again (`20261009070000`, line 780 to 792). The tree has no such step, and `public/schema.sql` revokes all from both roles.

The trial got past both with three hand-written files in `_custom/`, which the export never writes or prunes:

- `roles.sql`: a `do` block that creates the two roles if they do not exist. The `do` block hides the `create role` from the cluster check.
- `grant_create.sql`: `grant create on schema public` to both roles.
- `revoke_create.sql`: the matching revoke.

They only work in the right places in `loadOrder` of `.pgdelta-export.json`: `roles.sql` first, `grant_create.sql` right after `public/schema.sql`, and `revoke_create.sql` last. Each `generate` rewrites `loadOrder` and drops the three entries, so `sync` fails again until someone adds them back.

With the three files in place, `sync --no-apply` reported "No schema changes found" on `main`, before #408, and before #409.

`generate` is stable. A second `generate` into another folder gave the same files. The tree generated from the hand-written #408 is identical to the tree after the replayed #408.

### #408 and #409 replayed

For each one, I checked out the commit before it, ran `db reset`, generated the tree, and replaced the body of `private/functions/run_search.sql` with the body from the hand-written migration. Then I ran `sync --no-apply`.

| | #408 | #409 |
|---|---|---|
| Diff of `run_search.sql` in the tree | 5 lines added | 3 lines added, 4 removed |
| Hand-written migration | 299 lines: 10 lines of data change and the function | 287 lines: the function |
| Generated migration | 292 lines: the function | 291 lines: the function |
| Function body, generated against hand-written | identical | identical |
| Grants in the generated migration | none, `CREATE OR REPLACE` keeps them | none |

A generated migration is the whole function as `CREATE OR REPLACE`, after `SET local check_function_bodies = off;`. The header is in pg-delta's format, for example `SET search_path TO ''` and no `volatile`. It is a few lines longer than the hand-written one. So the review gain is in the tree diff, not in the migration.

The #408 data change, the `update public.copies` with `record_who_changed` turned off, stays hand-written. I put it in its own migration after the generated one.

On each result, I ran `db reset`, then `sync` ("No schema changes found"), the generated types check (they match), and the full database suite with `bun test` in `supabase`. #408: 1,759 tests in 68 files pass. #409: 1,759 tests in 68 files pass. The PL/pgSQL lint passes on #409.

### How the checklist items come out in the tree

I checked each item in the tree. Then I removed it from the tree and ran `sync` to see whether `sync` notices.

| Item | In the tree | `sync` after removing it |
|---|---|---|
| Default privilege from `c5afcb5` | `_cluster/default_privileges.sql`: `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON FUNCTIONS FROM PUBLIC;` | `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT EXECUTE ON FUNCTIONS TO PUBLIC;` |
| Revoke then grant on functions | In the function's file, after the body. The order becomes grant, then revoke, for example `GRANT EXECUTE ... TO "authenticated";` and then `REVOKE ALL ... FROM PUBLIC, "anon", "service_role";`. 252 of 275 function files also have a `REVOKE ALL ... FROM "postgres"` and `GRANT EXECUTE ... TO "postgres"` pair, which no migration wrote. | Removing the `REVOKE ALL ... FROM PUBLIC, "anon", "service_role"` line from `add_deck_card` makes `sync` write `GRANT EXECUTE ... TO PUBLIC`. |
| `security definer` and `set search_path = ''` | `SECURITY DEFINER` (62 functions) and `SET search_path TO ''` (all 275) in the function header | `CREATE OR REPLACE` without them |
| RLS policies | All 57: 56 in the table files of `public`, and 1 in `storage/tables/objects.sql` | Removing a policy writes `DROP POLICY`. Changing the `storage.objects` policy writes `DROP POLICY` and `CREATE POLICY`. |
| Trigger on `auth.users` | `auth/tables/users.sql`: only the `CREATE TRIGGER create_profile_after_sign_up` | `DROP TRIGGER "create_profile_after_sign_up" ON "auth"."users";` |

So `sync` keeps all five. Two findings on grants:

- The grant and revoke lines in the tree are what keep a function closed. Removing a revoke line opens the function. This repo must not follow the docs' advice that such lines are safe to remove.
- A new function file with no grant lines comes out like a new function in a hand-written migration. In `private`, `sync` writes `REVOKE ALL ... FROM PUBLIC`. In `public`, `sync` writes `GRANT EXECUTE` to `anon`, `authenticated`, and `service_role`, from the Supabase default privileges. The revoke-then-grant rule in `CODING_STANDARDS.md` still applies.

### What stays hand-written

The tree has none of these, so they stay in hand-written migrations:

- Data changes, such as the #408 update of `public.copies` and the who-changed backfills.
- The `storage.buckets` rows (`20261021090000`, `20261219090000`) and the `private.storage_limit` row (`20261220090000`). The tables are in the tree. Their rows are not.
- `alter role service_role set statement_timeout = '2min'` (`20261009070000`).
- The ADR 0006 deck evaluation recompute, `select public.recompute_deck_evaluations();` (`20261114160000`, line 181), after each change to the judge.
- The roles `catalog_importer` and `deck_evaluator`, and the temporary `create` on `public` that a change of owner needs. Sections 1 to 3 did not list these.

`sync` names its file with the current UTC time, for example `20261020123253_return_when_each_copy_was_created.sql`. This repo's migrations have timestamps later than today (the newest on `main` is `20261229090000`), so a generated migration sorts before all of them. The author renames it to a timestamp later than every migration on `main`, as today. A hand-written migration that depends on it, such as a recompute after a judge change, takes a later timestamp still, for example 100 seconds later. In the #408 replay, the generated migration is `20261222090000` and the data change is `20261222090100`.

### Time

I measured these on this Mac, an Apple M3 with 8 cores and OrbStack, while other worktrees' stacks were running.

| Step | Time |
|---|---|
| `db reset`, for scale | 102 s |
| `generate --local` | 5.8 s the first time, about 3 s after |
| Option B check: `generate --local --output-dir <tmp>` and `diff -r` against the committed tree | 2.9 s |
| `sync --no-apply`, warm shadow cache | 6.7 to 7.1 s |
| `sync --no-apply --no-cache`, cold like a fresh CI runner | 17.0 s |

The very first `sync` on this Mac took 23 minutes and then failed with the role error. Later runs that failed the same way took 7.8 s, and a cold run took 17 s. I could not find or reproduce the cause.

I did not measure the `database` job in CI. This is an estimate. The CI runner has fewer cores than this Mac, and `sync` has no shadow cache there. The option B check would add about 5 to 15 s. A cold `sync` would add about 30 to 60 s.

### Format

The generated SQL uses upper-case keywords, an indent of 2, a width of 180, trailing commas, and aligned columns. DDL and grants quote every name, for example `"public"."copies"`. Function bodies are verbatim. Headers are rewritten.

`[experimental.pgdelta] format_options = "{\"keywordCase\":\"lower\"}"` in `supabase/config.toml` gives lower case: `create or replace function`, `create table`, `grant execute on function`, `create policy`. Some upper case stays: `AS $function$`, `AND` inside policy expressions from `pg_get_expr`, and `FUNCTIONS` in default privileges. `format_options = "null"` gives unformatted SQL. I did not try it.

### Corrections to sections 1 to 3

- There are 116 migrations on `main` now, not 110.
- Section 2 says the export writes the roles to `_cluster/roles.sql`. It does not. Only the cluster scope does, and the CLI does not use it.
- Option A's adoption check, "the first `sync` says No schema changes found", needs the `_custom` files above.

### Decision

**Go for option B.** `generate` alone is enough for it. It needs no `sync`, no `_custom` files, and no change to how migrations are written. It is stable, it matches the hand-written history, and the check costs seconds. The tree diffs for #408 and #409 are the 5 and 7 lines a reviewer needs to see.

- The check is a `schema:check` script in `supabase/package.json` that runs `supabase db schema declarative generate --local --output-dir <tmp>` and `diff -r` against `supabase/schemas`, and a `schema` script that writes the tree. In the `database` job of `.github/workflows/checks.yml`, a step "Schema snapshot matches the migrations" right after "Generated types match the migrations". `docs/agents/local-development.md` (Migrations) and `README.md` then say to run `bun run schema` after a migration change and after a rebase.
- Land it when no spec integration branch is open. Today spec 460's integration branch (`spec/460-pe-core-s16`, #473) is open. Land it after #473 merges and before the next spec run opens its integration branch.
- That PR must show that the tree generated on the CI runner matches the one from a Mac. Both use the same Postgres image, so I expect it to.

**No-go for option A for now.** `sync` needs three hand-written `_custom` files and a hand edit of `loadOrder` that each `generate` undoes. Each generated migration must be renamed to sort last. The roles and the owner change are missing from the tree. Look at option A again when the CLI can export roles in a declarative tree, or when the database stops relying on the two roles for ownership.
