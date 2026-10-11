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

## Recognizer replay

CI does not replay the scanner evidence pack. Before merging a change to the recognizer, the evidence pack, or the gallery, run `bun run recognizer:replay` on the owner's Mac with the recorded gallery, on the branch and on `main`, and record the result in the PR. `apps/mobile/test/scanner-evidence/README.md` (Local replay before merge) has the steps.

## Gallery build

- The gallery build runs only on the owner's Mac, with the owner present. `README.md` (Gallery build and publish) describes the commands.
- The Supabase secret key is a GitHub Actions secret. The owner copies it from the Supabase dashboard and enters it at a hidden prompt for one run. Never store it in a file, and never print it:

  ```bash
  cd supabase
  export SUPABASE_URL="https://$(gh variable get SUPABASE_PROJECT_REF).supabase.co"
  read -rs SUPABASE_SECRET_KEY; export SUPABASE_SECRET_KEY
  bun run gallery build
  unset SUPABASE_SECRET_KEY
  ```

- The image cache is `~/Library/Caches/mtgscan/scryfall-images`, outside every worktree. The work folder with the feature prints and the built gallery versions is `~/Library/Caches/mtgscan/gallery`.
- The first build reuses the images of the prototype. Copy them once. `cp -c` clones the files on APFS, so the copy is fast and uses no more disk space:

  ```bash
  mkdir -p ~/Library/Caches/mtgscan/scryfall-images
  cp -Rc /Users/reilley/.herdr/worktrees/mtgscan/worktree-brave-harbor-93a0/prototypes/catalog-recognizer/.data/images/. ~/Library/Caches/mtgscan/scryfall-images/
  ```

  On that first build, pass `--cached-images-bulk-file` with the Scryfall file the images came from, `prototypes/catalog-recognizer/.data/default-cards.jsonl.gz` in the same worktree. The build then downloads again every image that Scryfall changed since then. Leave the prototype data in place.

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
