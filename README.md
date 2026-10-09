# mtgscan

A cross-platform phone app for rapidly scanning Magic: The Gathering cards, keeping a collection, and building Commander decks. An authenticated remote MCP service lets compatible AI chats search the card catalog and collection, inspect decks, and make deck suggestions.

Product and architecture decisions are being resolved in the project Wayfinder map.

## Development

The repo is a Bun workspace. The Expo app lives in `apps/mobile`. The public website, with the homepage and privacy policy, is static HTML in `apps/site`.

1. Install dependencies with `bun install`.
2. Build and open the development build in the iOS simulator with `bun run --filter @mtgscan/mobile ios`.

Public build-time settings go in `apps/mobile/.env`. `apps/mobile/.env.example` lists their names. Never put a service role key in the app.

Checks run on every pull request. Run them locally with `bun run typecheck`, `bun run lint`, and `bun run test`.

### Local Supabase

The Supabase project lives in `supabase`: configuration, SQL migrations, generated types, and database tests. The local stack needs Docker and the Supabase CLI 2.120.0.

1. Copy `supabase/.env.example` to `supabase/.env` and fill in the Google client IDs, web ID first, then iOS ID, separated by a comma. Native Google sign-in does not use the secret.
2. Start the stack from the repo root with `supabase start`.
3. Run the database tests with `bun run test:database`.
4. After you change a migration, run `supabase db reset` and then `bun run types:database`. CI fails when `supabase/database.types.ts` does not match the migrations.

To run the app against the local stack, put the local API URL and publishable key from `supabase status` in `apps/mobile/.env.local`. It overrides `apps/mobile/.env`.

### Per-user data

Every table that holds a user's data follows one pattern:

- Row-level security is on, and the read policy returns only the signed-in user's rows.
- Direct inserts, updates, and deletes are revoked for the `anon` and `authenticated` roles.
- Changes go only through database functions, one transaction each, that check the caller's identity.

Signing up creates the user's profile through a trigger on `auth.users`.
