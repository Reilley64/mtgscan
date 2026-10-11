# Local development

`README.md` has the full setup. This file holds the rules that agents tripped on.

## Env files

- The source of truth is outside the repo, in `~/.config/mtgscan/mobile.env` and `~/.config/mtgscan/supabase.env`.
- In each new worktree, copy them to `apps/mobile/.env` and `supabase/.env`. Every worktree has its own `.env` files, and Git ignores them.
- Keep their values out of output, logs, commits, and PRs. To check that a name is set, test it without printing it, for example `grep -q '^EXPO_PUBLIC_SUPABASE_URL=.' apps/mobile/.env`.

## Xcode and the Simulator

- `xcode-select` may point to the Command Line Tools. Set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for `xcrun simctl` and for builds.
- Use the iPhone 17 Pro Simulator.
- `expo run:ios` and `expo start` keep Metro running and never exit. Start them in the background with output to a log file, poll the log, and stop Metro when you are done.
- Verify each UI change on the Simulator with agent-device. Read the `agent-device` and `ios-simulator` skills first. Save the screenshots for the PR evidence.
- When a check needs a signed-in account, ask the owner to sign in on the Simulator. Never type the owner's credentials.

## Scanner evidence replay

- Set `DEVELOPER_DIR` as for the Simulator before `bun run recognizer:test`. The Swift tests need Xcode.
- The recorded gallery of the scanner evidence pack is on this Mac in the ignored data of another worktree: `/Users/reilley/.herdr/worktrees/mtgscan/worktree-brave-harbor-93a0/prototypes/catalog-recognizer/.data/catalog`. Read it only. Set `RECOGNIZER_GALLERY_DIR` to it.
- The 3,000 Scryfall `large` images for the simulated scans are in `.data/large` next to it. Set `RECOGNIZER_LARGE_IMAGES_DIR` to that folder.
- Copy both folders somewhere else before that worktree is removed. A gallery built again from a newer Scryfall file does not match the expected files.

## Expo SDK

The app stays on Expo SDK 56. `README.md` (Versions) says why and when to upgrade. Keep `node_modules` unpatched.

## Local Supabase

- Run the CLI as `bunx supabase@2.120.0`. CI uses the same version.
- The Docker runtime is OrbStack.
- Only one stack named `mtgscan` can run on this Mac, and all worktrees share it. Before `start` or `stop`, run `docker ps --filter name=supabase_db_mtgscan`.
  - If the stack is running, use it.
  - Stop only a stack that you started. Leave a stack that another worktree started.

## EAS

- Run the EAS CLI as `npx eas-cli@latest`. `apps/mobile/eas.json` needs 24.4.2 or later.
- The first build needs the owner's Apple Developer login. Ask the owner to run it.

## Migrations

- Give each new migration a timestamp that is unique and later than every migration on `main`.
- When PRs with migrations run in parallel, rebase on `main` before you merge, and rename your migration so that it sorts last.
- After a rebase, run `bunx supabase@2.120.0 db reset` and `bun run types:database`, and commit the new `supabase/database.types.ts`.

## Merging a PR

- Never run `gh pr merge --delete-branch` while a local worktree holds the branch. It deletes the worktree and its gitignored `.env` files.
- Remove the worktree first with `git worktree remove`. Then delete the branch.
