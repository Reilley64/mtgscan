# Coding standards

The review agent checks each diff against these rules. CI already runs the type check, lint, tests, the generated types check, and the PR title check, so this file holds only judgement calls. Each rule points to where its detail lives.

## Domain language

- Use `GLOSSARY.md` terms exactly in code names, SQL names, UI copy, docs, test names, and PR text. A synonym from a term's _Avoid_ list is a finding.
- A domain concept that is not in the glossary is a finding. See `docs/agents/domain.md`.

## Copy and docs

- Write UI copy, docs, and PR text in plain short sentences, with one fact or action per sentence.
- Use sentence case in headings, buttons, and labels.
- Use no em dashes in prose. Card data from Scryfall keeps its own.
- UI copy matches the spec and `DESIGN.md` word for word.
- A PR that changes behavior updates `README.md`, `DESIGN.md`, or `GLOSSARY.md` where they describe it.
- PR issue links follow `docs/agents/issue-tracker.md` (Link a pull request to an issue).

## Code

- Add no code comments. Names, types, and small functions carry the meaning.
- Prefer small modules with one job. Put shared UI in `apps/mobile/src/components` and sign-in and session logic in `apps/mobile/src/auth`.
- Keep one source of truth for each rule or list, such as one validator, one command map, or one staging table list. A second copy is a finding.
- Remove what nothing uses: exports, helpers, indexes, and dependencies.

## App UI

- Take colors, type, spacing, corners, and sizes from `apps/mobile/src/theme.ts`, which mirrors the `DESIGN.md` tokens. A new token goes into both files in the same PR.
- A value outside the tokens needs a reason in `DESIGN.md`, like the Apple and Google button colors.
- Follow the `DESIGN.md` Do's and Don'ts, such as native tabs, page sheets, and no on-screen back buttons.
- Give every control an accessibility role and a label that matches its visible text.

## Data and Supabase

- Use full Supabase with no ORM. The app, the tests, and the import jobs use `supabase-js`. They read through the Data API and write by calling database functions. See #29.
- Every table with a user's data follows the per-user data pattern in `README.md`. Its read policy returns only the owner's rows. Direct writes are revoked for `anon` and `authenticated`. Changes go only through database functions that check the caller's identity, one transaction each.
- A table that departs from the pattern says why in `README.md`, as `search_telemetry` does.
- Database functions set `search_path = ''` and use schema-qualified names.
- Functions in `public` revoke `execute` from `public` and from every role that does not call them, then grant it to their callers.
- Put helper functions in the `private` schema, which the Data API does not expose.
- Import functions run as `catalog_importer`, write only card catalog, staging, and run tables, and only `service_role` can call them. See #43.
- The card catalog never deletes a card or a card printing. It marks them absent.
- A migration that replaces a function starts from the latest version on `main`, so that parallel changes survive.
- `supabase/database.types.ts` comes only from `bun run types:database`.
- Errors from database functions carry a code, a message, and the field at fault as a JSON path, such as `oracle_ids[1]`. Use `private.raise_search_error` and the `private.checked_*` helpers. See `README.md` (Catalog search).

## Security

- No service role key, secret key, or other service credential goes in the app, in `apps/mobile/.env*`, or in any `EXPO_PUBLIC_` name. Every `EXPO_PUBLIC_` value ships in the app.
- The Supabase secret key lives only in GitHub Actions secrets and local env files.
- The user can edit `user_metadata`. Use it only for display, never for authorization or data access. See PR #54.

## Tests

- Test at the agreed seams from #29 and #43:
  - Database tests in `supabase/tests` call `supabase-js` against local Supabase, as the app does. Only test setup uses the secret key or a direct database owner connection. Per-user data tests use two signed-up users and also check an anonymous caller and refused direct writes.
  - Import tests run the import command with fixture files and never download.
  - App component tests in `apps/mobile/test` render the real Expo Router navigation with `renderApp`. They fake only the Supabase client and the native sign-in modules, in `test/fake-*.ts`. Only `test/native-ui.ts` reads native views.
  - The owner checks on the device what Jest cannot reach, such as real Apple and Google sign-in.
- Test external behavior, such as screen text, roles, returned rows, error codes, and error fields. Leave out internal state, component structure, SQL text, and query plans.
- Name each test as a sentence about the behavior, in glossary terms.
- Each test fails when its behavior breaks. For key rules, the PR evidence shows a mutation check, where the author breaks the code on purpose and the test goes red.
- Every acceptance criterion in the ticket has a test or an owner check.
