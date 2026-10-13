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
- When a check needs a signed-in account, use the test sign-in against local Supabase. See Test sign-in. Ask the owner to sign in only for a check against hosted Supabase or of Apple or Google sign-in itself. Never type the owner's credentials.

## Test sign-in

A development build against local Supabase can sign in a local test user with one tap, with no Apple or Google account. Use it for Simulator checks with agent-device. Do not add a temporary password sign-in.

- The test user is `test-user@mtgscan.test`. Its password is a local default in `supabase/test-user/account.ts`.
- The command and the app work only with the local stack at `http://127.0.0.1:54321` or `http://localhost:54321`. Both refuse every other Supabase URL, so the test user never exists on hosted Supabase.
- Production builds leave the test sign-in out. `bun run test:production-bundle` in `apps/mobile` builds a production bundle with the test sign-in on and fails if the bundle holds the test sign-in. CI runs it.

1. Start local Supabase as in Local Supabase.
2. Seed or reset the test user from `supabase`. The command deletes the test user and its collection, and creates it again. `--sample-collection` also adds 30 sample collection entries through `add_scan_batch`, with 1 to 4 copies each. Some are foil, one is etched, and some are LP or MP. The sample needs the card catalog, so import the catalog fixture first:

   ```bash
   cd supabase
   export SUPABASE_URL=http://127.0.0.1:54321
   export SUPABASE_SECRET_KEY=$(bunx supabase@2.120.0 status -o json | jq -r .SECRET_KEY)
   bun run import catalog --manifest tests/fixtures/scryfall/bulk-data.json --sets tests/fixtures/scryfall/sets.json
   bun run test-user --sample-collection
   ```

3. Put the local stack and the test sign-in in `apps/mobile/.env.local`. Take the publishable key from `bunx supabase@2.120.0 status`:

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
   EXPO_PUBLIC_TEST_SIGN_IN=true
   ```

4. Start Metro with `bunx expo start --dev-client` in `apps/mobile`, in the background, as the Xcode and the Simulator section says. Restart Metro after each change to `.env.local`. Open the development build that is installed on the Simulator. The test sign-in needs no native build.
5. Tap **Sign in as the test user** on the sign-in screen. The app opens on Recent.

Delete `apps/mobile/.env.local` when you are done, so that the next Metro run uses hosted Supabase. Never set `EXPO_PUBLIC_TEST_SIGN_IN` for an EAS build.

## Scanner evidence replay

- Set `DEVELOPER_DIR` as for the Simulator before `bun run recognizer:test`. The Swift tests need Xcode.
- The recorded gallery of the scanner evidence pack is gallery version `20261012-cf1753`. Install it once with `bun --env-file=.env.hosted gallery/main.ts install 20261012-cf1753` in `supabase`. Set `RECOGNIZER_GALLERY_DIR` to `~/Library/Caches/mtgscan/gallery/installed/20261012-cf1753`.
- The 3,000 Scryfall `large` images for the simulated scans are in the ignored data of another worktree: `/Users/reilley/.herdr/worktrees/mtgscan/worktree-brave-harbor-93a0/prototypes/catalog-recognizer/.data/large`. Read them only. Set `RECOGNIZER_LARGE_IMAGES_DIR` to that folder. Copy it somewhere else before that worktree is removed.

## Gallery on a development build

- `README.md` (Gallery download) says how a development build installs a gallery version that is not published. Put `EXPO_PUBLIC_DEVELOPMENT_GALLERY` only in `apps/mobile/.env.development.local`. Its signed URLs open that gallery version to anyone who has them until they expire. Only development builds read it, but every `EXPO_PUBLIC_` value goes into the bundle, so never set it for an EAS build.
- On the Simulator, serve the parts from the Mac instead of hosted Storage, so that a test download spends no hosted egress. `bun gallery/main.ts install` keeps the parts of a gallery version in `~/Library/Caches/mtgscan/gallery/versions/<version>`.

## Recognizer replay

CI does not replay the scanner evidence pack. Before merging a change to the recognizer, the evidence pack, or the gallery, run `bun run recognizer:replay` on the owner's Mac with the recorded gallery, on the branch and on `main`, and record the result in the PR. `apps/mobile/test/scanner-evidence/README.md` (Local replay before merge) has the steps.

## Gallery build

- The gallery build runs only on the owner's Mac, with the owner present. `README.md` (Gallery build and publish) describes the commands.
- The hosted credentials for owner commands live only in `supabase/.env.hosted`: `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Git ignores the file, and Bun does not load it by itself. Load it for one command with `bun --env-file=.env.hosted`. Never put the hosted credentials in an `.env` file that Bun loads by itself, such as `supabase/.env` or `.env.local`. Never read or print the file:

  ```bash
  cd supabase
  bun --env-file=.env.hosted gallery/main.ts build
  ```

- The image cache is `~/Library/Caches/mtgscan/scryfall-images`, outside every worktree. The work folder with the feature prints and the built gallery versions is `~/Library/Caches/mtgscan/gallery`. macOS can clear `~/Library/Caches` when the disk is full. The build then downloads the missing images and parts again and computes the feature prints again.
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
