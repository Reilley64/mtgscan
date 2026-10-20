# Local development

`README.md` has the full setup. This file holds the rules that agents tripped on.

## Env files

- The source of truth is outside the repo, in `~/.config/mtgscan/mobile.env` and `~/.config/mtgscan/supabase.env`.
- In each new worktree, copy them to `apps/mobile/.env` and `supabase/.env`. Every worktree has its own `.env` files, and Git ignores them.
- Keep their values out of output, logs, commits, and PRs. To check that a name is set, test it without printing it, for example `grep -q '^EXPO_PUBLIC_SUPABASE_URL=.' apps/mobile/.env`.

## Xcode and the Simulator

- `xcode-select` may point to the Command Line Tools. Set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for `xcrun simctl` and for builds.
- Use the one shared iPhone 16e Simulator. It matches the owner's phone. Do not create, boot, or erase another Simulator.
- Only one agent at a time uses the Simulator, Metro, an Xcode or Expo native build, or the owner's iPhone. Take the device lock first with `mkdir /tmp/mtgscan-device.lock`, and write your name into `/tmp/mtgscan-device.lock/owner`. If `mkdir` fails, another agent has the device. Keep working on code and tests, and try again later.
- When the device work is done, stop Metro, close the Simulator with `device_close` and `shutdown: true`, delete the generated `ios/` and build folders, and remove `/tmp/mtgscan-device.lock`.
- `expo run:ios` and `expo start` keep Metro running and never exit. Start them in the background with output to a log file, poll the log, and stop Metro when you are done.
- Verify each UI change on the Simulator with T3 Code's built-in device tools on the `t3-code` MCP server. Open the iPhone 16e with `device_open`. It shows the Simulator in the owner's Device panel and returns an agent-device command pinned to that Simulator. Use that command for taps, typing, and scrolling. Take screenshots with `device_screenshot`, and save them for the PR evidence.
- The agent-device command is a script that runs the T3 Code app as Node. It needs `ELECTRON_RUN_AS_NODE=1`. Without it, the command starts a second copy of the T3 Code app and hangs with no output. Before the first agent-device call, set the variable in your agent session, for example with `os.environ["ELECTRON_RUN_AS_NODE"] = "1"` in a Python REPL. Do not set it in a shell profile, because it changes how every Electron app starts.
- Check web pages, such as an HTML prototype, in T3 Code's built-in browser with the `preview_` tools on the same server. Start with `preview_status`, then `preview_open`.
- When a check needs a signed-in account, use the test sign-in against local Supabase. See Test sign-in. Ask the owner to sign in only for a check against hosted Supabase or of Apple or Google sign-in itself. Never type the owner's credentials.

## Test sign-in

A development build against local Supabase can sign in a local test user with one tap, with no Apple or Google account. Use it for Simulator checks with T3 Code's device tools. Do not add a temporary password sign-in.

- The test user is `test-user@mtgscan.test`. On local Supabase, its password is a local default in `supabase/test-user/account.ts`.
- The local command and the development build test sign-in work only with a local stack at `http://127.0.0.1` or `http://localhost`, on any port. Both refuse every other Supabase URL.
- Hosted Supabase has its own test user with a random password, for the test app. See Test app on the iPhone.
- The sign-up hook refuses every email sign-up except the test email. Apple and Google sign-up stay open.
- Production builds leave the test sign-in out. `bun run test:production-bundle` in `apps/mobile` builds a production bundle with the test sign-in on, the local stack, and a sentinel test user password. It fails if the bundle holds the test email, the local password, the sentinel, or the test sign-in button. It then builds the test app bundle and fails if that bundle has no test sign-in button. CI runs it.

1. Start local Supabase as in Local Supabase.
2. Seed or reset the test user from `supabase`. The command deletes the test user and its collection, and creates it again. `--sample-collection` also adds 30 sample collection entries through `add_scan_batch`, with 1 to 4 copies each. Some are foil, one is etched, and some are LP or MP. One copy is protected. It also adds two user tags: "Signed" on one copy and "Trade binder" on three copies. It also adds a sample deck named Tymna the Weaver. Its cards come by name, and their copies are part of the 30 sample collection entries. The command fails when the card catalog has no such card. The commanders are Tymna the Weaver and Thrasios, Triton Hero, a pair with Partner. The deck is invalid by every rule except the commander rules. It has 2 Counterspell, which breaks singleton. Lightning Bolt breaks color identity. Black Lotus is banned. Once More with Feeling is not legal. The deck also has every bracket signal: 3 Game Changers, mass land denial, a ruthless two-card combo, and 2 extra-turn cards. Its estimated bracket is 4. The deck has 8 Forest, 6 Island, and 2 Snow-Covered Forest, for each of them that the card catalog has. The last deck change adds a second copy of Lightning Bolt, and a revert undoes it. The Add to deck drawer of that free copy shows "Adds a violation". So does the revert page sheet of the revert. The sample needs the card catalog. The binder tiles show current prices from the price import. The bracket signals need the Oracle tags and Commander Spellbook. So import all four fixtures first:

   ```bash
   cd supabase
   export SUPABASE_URL=http://127.0.0.1:<API port>   # 54321 on the default stack
   export SUPABASE_SECRET_KEY=$(bunx supabase@2.120.0 status -o json | jq -r .SECRET_KEY)
   bun run import catalog --manifest tests/fixtures/scryfall/bulk-data.json --sets tests/fixtures/scryfall/sets.json
   bun run import prices --manifest tests/fixtures/scryfall/bulk-data.json
   bun run import oracle_tags --manifest tests/fixtures/scryfall/bulk-data.json
   bun run import commander_spellbook --variants tests/fixtures/commander-spellbook/variants.json
   bun run test-user --sample-collection
   ```

3. Put the local stack and the test sign-in in `apps/mobile/.env.local`. Take the publishable key from `bunx supabase@2.120.0 status`:

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:<API port>
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
   EXPO_PUBLIC_TEST_SIGN_IN=true
   ```

4. Start Metro with `bunx expo start --dev-client` in `apps/mobile`, in the background, as the Xcode and the Simulator section says. Restart Metro after each change to `.env.local`. Open the development build that is installed on the Simulator. The test sign-in needs no native build.
5. Tap **Sign in as the test user** on the sign-in screen. The app opens on Recent.

Delete `apps/mobile/.env.local` when you are done, so that the next Metro run uses hosted Supabase. Never set `EXPO_PUBLIC_TEST_SIGN_IN` for an EAS build.

## Test app on the iPhone

Agent builds on the owner's iPhone are a separate app, **mtgscan Test**. It installs next to the owner's mtgscan app, with its own keychain and data. It uses hosted Supabase and signs in the hosted test user with one tap. It has no Apple or Google button. Row-level security keeps the test user's data apart from the owner's collection.

- `EXPO_PUBLIC_APP_VARIANT=test` makes the test app. `app.config.ts` then sets the name `mtgscan Test`, the bundle ID `dev.reilley.mtgscan.test`, and the URL scheme `mtgscan-test`. It refuses the test app in an EAS build.
- The hosted test user's password lives only in `~/.config/mtgscan/test-app.env`, as `EXPO_PUBLIC_TEST_USER_PASSWORD`. Never copy it into a worktree `.env` file. Never print it. Check that it is set with `grep -q '^EXPO_PUBLIC_TEST_USER_PASSWORD=.' ~/.config/mtgscan/test-app.env`.
- Build and install only the test app on the iPhone. Never build or install `dev.reilley.mtgscan` on the iPhone unless the owner asks. Never sign in to the owner's mtgscan app.
- Hold the device lock for the whole build and install.

The owner seeds or resets the hosted test user. The command needs the hosted secret key, so only the owner runs it, from the main checkout. It deletes the hosted test user and its collection, creates it again with the password from `test-app.env`, and adds the sample collection and the sample deck. It builds the hosted URL from `SUPABASE_PROJECT_REF` in `.env.hosted`. It refuses a missing URL, the local stack, a missing password, and the local default password:

```bash
cd supabase
bun --env-file=.env.hosted --env-file=$HOME/.config/mtgscan/test-app.env test-user/main.ts --hosted --sample-collection
```

To build and install the test app:

1. Take the device lock.
2. Move `apps/mobile/.env.local` and `apps/mobile/.env.production.local` out of `apps/mobile`. The script refuses to build with them, because the test app uses the hosted Supabase URL from `apps/mobile/.env`.
3. Find the iPhone's identifier with `xcrun devicectl list devices`.
4. Run `bun run ios:test-device --device <identifier>` in `apps/mobile`. The script:
   1. reads the password from `test-app.env`, and refuses a missing password or the local default password;
   2. runs `bunx expo prebuild --clean --platform ios` with the test app variant;
   3. builds the Release configuration with `xcodebuild -allowProvisioningUpdates` and the team `YDZJL5K3RQ`, into `apps/mobile/ios/build`;
   4. installs the app with `xcrun devicectl device install app`.

   It shows `<test user password>` in place of the password in the build output.
5. Delete `apps/mobile/ios`, and release the device lock.

If Xcode cannot turn on Sign in with Apple for the new App ID, the owner turns it on in the Apple Developer portal.

## Scanner evidence replay

- Set `DEVELOPER_DIR` as for the Simulator before `bun run recognizer:test`. The Swift tests need Xcode.
- The recorded gallery of the scanner evidence pack is gallery version `20261012-cf1753`. Install it once with `bun --env-file=.env.hosted gallery/main.ts install 20261012-cf1753 --hosted` in `supabase`. Set `RECOGNIZER_GALLERY_DIR` to `~/Library/Caches/mtgscan/gallery/installed/20261012-cf1753`.
- To build a gallery for the replay from the current Scryfall data, run the commands in `apps/mobile/test/scanner-evidence/README.md` (Gallery, Build a gallery) against the worktree's local stack.
- The 3,000 Scryfall `large` images for the simulated scans are in the ignored data of another worktree: `/Users/reilley/.herdr/worktrees/mtgscan/worktree-brave-harbor-93a0/prototypes/catalog-recognizer/.data/large`. Read them only. Set `RECOGNIZER_LARGE_IMAGES_DIR` to that folder. Copy it somewhere else before that worktree is removed.

## Gallery on a development build

- `README.md` (Gallery download) says how a development build installs a gallery version that is not published. Put `EXPO_PUBLIC_DEVELOPMENT_GALLERY` only in `apps/mobile/.env.development.local`. Its signed URLs open that gallery version to anyone who has them until they expire. Only development builds read it, but every `EXPO_PUBLIC_` value goes into the bundle, so never set it for an EAS build.
- On the Simulator, serve the parts from the Mac instead of hosted Storage, so that a test download spends no hosted egress. `bun --env-file=.env.hosted gallery/main.ts install <version> --hosted` keeps the parts of a gallery version in `~/Library/Caches/mtgscan/gallery/versions/<version>`.

## Recognizer replay

CI does not replay the scanner evidence pack. Before merging a change to the recognizer, the evidence pack, or the gallery, run `bun run recognizer:replay` on the owner's Mac with the recorded gallery, on the branch and on `main`, and record the result in the PR. `apps/mobile/test/scanner-evidence/README.md` (Local replay before merge) has the steps.

## Gallery build

- The hosted gallery build runs only on the owner's Mac, with the owner present. `README.md` (Gallery build and publish) describes the commands.
- The hosted credentials for owner commands live only in `supabase/.env.hosted`: `SUPABASE_PROJECT_REF` and `SUPABASE_SECRET_KEY`. The commands build the hosted URL, `https://<ref>.supabase.co`, from the project ref. Git ignores the file, and Bun does not load it by itself. Load it for one command with `bun --env-file=.env.hosted`, and pass `--hosted`. Without `--hosted`, the gallery commands refuse every URL except the local stack. Never put the hosted credentials in an `.env` file that Bun loads by itself, such as `supabase/.env` or `.env.local`. Never read or print the file:

  ```bash
  cd supabase
  bun --env-file=.env.hosted gallery/main.ts build --hosted
  ```

- The image cache is `~/Library/Caches/mtgscan/scryfall-images`, outside every worktree. The work folder of a hosted build, with the feature prints and the built gallery versions, is `~/Library/Caches/mtgscan/gallery`. A local build uses `~/Library/Caches/mtgscan/local-gallery`. macOS can clear `~/Library/Caches` when the disk is full. The build then downloads the missing images and parts again and computes the feature prints again.
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
- Each worktree runs its own stack, so a reset or a test run in one worktree never touches another. The stack's name and ports come from the worktree's `supabase/.env`. The CLI and Bun both read that file when they run in `supabase`.
- Block 0 is the default stack: project `mtgscan`, API port 54321. A worktree may use it only when `docker ps --filter name=supabase_db_mtgscan$` shows nothing. Its `supabase/.env` then needs only the lines from `supabase/.env.example`.
- Otherwise, add these lines to the worktree's `supabase/.env`, with the worktree's name and a free block N. Block N uses ports 54320 + 1000 × N and up. Take the first N whose API port is free, such as `lsof -i :55321` for N = 1. The example is block 1.

  ```sh
  SUPABASE_PROJECT_ID=mtgscan-<worktree>
  SUPABASE_API_PORT=55321
  SUPABASE_DB_PORT=55322
  SUPABASE_DB_SHADOW_PORT=55320
  SUPABASE_DB_POOLER_PORT=55329
  SUPABASE_STUDIO_PORT=55323
  SUPABASE_LOCAL_SMTP_PORT=55324
  SUPABASE_ANALYTICS_PORT=55327
  SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT=55383
  MCP_SERVER_URL=http://127.0.0.1:55321/functions/v1/mcp
  ```

- With these lines, `bunx supabase@2.120.0 start`, `db reset`, `status`, and the database tests all use the worktree's stack. The tests read the ports, so they need no `SUPABASE_URL` or `SUPABASE_DB_URL`.
- `MCP_SERVER_URL` must name the stack's own API port. Without it, the MCP function has no server URL.
- The edge runtime serves the worktree's `supabase/functions`. It mounts the files that a function imports from outside `supabase/functions`, such as the contracts, only when the stack starts. After you add such an import, stop and start the stack. The edge runtime can also keep serving a function's old code after you change it. Restart it with `docker restart supabase_edge_runtime_<project id>` before you run the MCP tests.
- Point the app at the stack with `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:<API port>` in `apps/mobile/.env.local`.
- Start the services CI starts: `start -x realtime,imgproxy,mailpit,studio,logflare,vector,supavisor`. The database tests need storage for the gallery. A full stack takes about 1.6 GB of memory.
- Stop your stack with `bunx supabase@2.120.0 stop` from `supabase` when you are done. Remove the worktree only after that.

## EAS

- Run the EAS CLI as `npx eas-cli@latest`. `apps/mobile/eas.json` needs 24.4.2 or later.
- The first build needs the owner's Apple Developer login. Ask the owner to run it.

## Migrations

- Give each new migration a timestamp that is unique and later than every migration on `main`.
- When PRs with migrations run in parallel, rebase on `main` before you merge, and rename your migration so that it sorts last.
- After a rebase, run `bunx supabase@2.120.0 db reset` and `bun run types:database`, and commit the new `supabase/database.types.ts`.

## Database lint

The database checks run `supabase db lint` after they start local Supabase. It runs `plpgsql_check_function` from the `plpgsql_check` extension on each PL/pgSQL function in `public`, `private`, and `catalog_import`. It finds a table or column name that does not exist. Postgres reports such a name only when the statement runs.

To run it against your stack, reset the database and run the command from `supabase`. `--local` reads the ports in `supabase/.env`, so it checks the worktree's own stack:

```bash
cd supabase
bunx supabase@2.120.0 db lint --local -s public,private,catalog_import --level error --fail-on error
```

- Fix an error in a new migration. Start the `create or replace` from the latest version of the function.
- Add `--level warning` without `--fail-on` to see the warnings too. CI does not fail on them.
- The lint skips trigger functions.
- The lint cannot check SQL that a function builds as text and runs with `execute`. `private.catalog_filter_conditions` and `private.text_search` build most of the search SQL this way, and `private.run_search` runs it. Only the database tests cover that SQL.

## Merging a PR

- Never run `gh pr merge --delete-branch` while a local worktree holds the branch. It deletes the worktree and its gitignored `.env` files.
- Remove the worktree first with `git worktree remove`. Then delete the branch.
