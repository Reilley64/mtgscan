# MCP spike

**Throwaway Wayfinder prototype for ticket 12.** This workspace tests whether ChatGPT on a Pro account can connect to an authenticated remote MCP server, read collection data, and apply one confirmed atomic deck change. It uses Supabase Auth as the OAuth 2.1 authorization server and a Supabase Edge Function as the MCP server. It is not application architecture. Delete it, the Supabase project, and every OAuth client after the test.

The research and the test plan are in issue 12 (`gh issue view 12 --comments`).

## What is here

- `supabase/migrations/20261008000000_mcp_spike.sql` creates `collection_cards`, `decks`, `deck_cards`, and `deck_change_log`. Row level security is on for every table, and every policy is scoped to `auth.uid()`.
  - `preview_deck_change(p_deck_id, p_changes)` is a read-only function. It returns the diff, Commander rule errors, warnings, and the current deck revision.
  - `apply_deck_change(p_deck_id, p_expected_revision, p_changes, p_idempotency_key, p_summary)` is a `security invoker` function. It locks the deck, replays a known `idempotency_key`, rejects a stale revision, applies every line in one transaction, adds 1 to the revision, and writes one `deck_change_log` row with the before and after counts.
  - Any other change to `deck_cards`, for example an edit in the table editor, also adds 1 to the deck revision.
  - `seed_spike_data()` creates one Commander deck and 20 collection rows for the signed-in user. It does nothing if the user already has a deck.
- `supabase/functions/mcp/index.ts` is the MCP server. It uses `@modelcontextprotocol/server` 2.3.1 with `createMcpHandler`, and `withOAuthProtectedResource` and `withSupabase` from `@supabase/server` 1.9.1.
  - With no token it returns 401 with `WWW-Authenticate: Bearer resource_metadata=...`.
  - It serves RFC 9728 metadata at `/functions/v1/mcp/oauth-protected-resource`, which points at the Supabase Auth issuer.
  - It verifies the Supabase JWT against the project JWKS, pins `iss` and `aud`, and rejects a token without a `client_id` claim.
  - Tools call PostgREST with the user's token, so row level security applies.
  - Tools: `search_collection`, `get_deck`, `preview_deck_change` (all read-only) and `apply_deck_change` (`readOnlyHint` false, `destructiveHint` true, `idempotentHint` true, `openWorldHint` false).
  - Each request and tool call writes one JSON log line without tokens: protocol version header, user agent, JSON-RPC method, tool, `client_id`, `aud`, `iss`, `sub`, and result.
- `consent/` is the local consent page at http://localhost:3000/oauth/consent. The owner signs in with email and password, then approves or denies the client.
- `scripts/setup.mjs` configures Supabase Auth, applies the migration, writes local keys, creates the owner user, and seeds data.
- `scripts/preflight.mjs` runs the checks from the research plan against the live project.
- `scripts/logs.mjs` prints the MCP log lines from the last N minutes.
- `scripts/reset-data.mjs` deletes the owner's spike rows and seeds them again.

## Project

- Supabase project ref: `nowhpujqaptioyarqtbp` (Free plan, throwaway)
- MCP server URL: https://nowhpujqaptioyarqtbp.supabase.co/functions/v1/mcp
- Authorization server issuer: https://nowhpujqaptioyarqtbp.supabase.co/auth/v1
- Consent page: http://localhost:3000/oauth/consent

## Commands

Run every command from this directory. The scripts read the Supabase personal access token from `~/.config/mtgscan/supabase.env` (`SUPABASE_ACCESS_TOKEN=...`) and never print it.

```sh
npm install
npm run setup
npm run consent
npm run preflight
npm run preflight -- --write
npm run logs -- 60
npm run reset-data
```

- `npm run setup` sets these Auth settings with `PATCH /v1/projects/{ref}/config/auth`: OAuth 2.1 server on, dynamic client registration on, authorization path `/oauth/consent`, Site URL `http://localhost:3000`, and email sign-in on. It is safe to run again.
- `npm run setup` writes `.local/config.json`, `.local/secret.json`, and `.local/owner-login.txt`. The `.local/` folder is ignored by Git.
- `npm run preflight -- --write` also applies and then undoes one real deck change. Run `npm run reset-data` after it.
- The Supabase CLI has no `functions logs` command. Use `npm run logs`, or open the dashboard at Edge Functions, `mcp`, Logs.

Deploy the function:

```sh
set -a; . ~/.config/mtgscan/supabase.env; set +a
npx supabase@latest functions deploy mcp --project-ref nowhpujqaptioyarqtbp --use-api --no-verify-jwt
```

`verify_jwt` must stay off. The function checks tokens itself, and the gateway would otherwise block the 401 discovery request.

Optional client allowlist: after ChatGPT registers its client, you can limit the server to that client.

```sh
npx supabase@latest secrets set MCP_ALLOWED_CLIENT_IDS=<client id> --project-ref nowhpujqaptioyarqtbp
```

## Owner steps in ChatGPT

These steps follow part B of the research plan. Google sign-in is replaced by email and password on the local consent page.

1. Run `npm run consent` and keep it running. ChatGPT's sign-in popup opens this page in your browser.
2. Open `.local/owner-login.txt` for the email and password.
3. In ChatGPT settings, confirm Lockdown Mode is off. Screenshot **Settings, Security and login**. If a **Developer mode** toggle exists, turn it on.
4. Open https://chatgpt.com/plugins and select the plus button. Screenshot the menu. Note whether **Add custom MCP server** appears.
5. Name the app `mtgscan spike`. Use the server URL above. Choose **OAuth**. Leave the client ID and secret empty so ChatGPT registers itself. Copy the redirect URI that ChatGPT shows. Accept the risk warning, then select **Create as a plugin**.
6. In the popup, sign in on the consent page with the login file, then select **Approve**. Screenshot the consent page.
7. Open the app details page. Screenshot the tool list. Note whether `apply_deck_change` is listed, enabled, or greyed out.
8. Start a new ordinary chat. Do not use deep research or agent mode.
9. Read test: "@mtgscan spike Which of my cards have 'Sol' in the name? Then show my deck." Expect `search_collection` and `get_deck` with no prompt. Expect Sol Ring, Sol Talisman, and Solemn Simulacrum.
10. Write test: "@mtgscan spike Preview removing 1 Sol Ring and adding 1 Arcane Signet in my deck, then apply it." Screenshot the confirmation card and its buttons. Choose **Allow once**.
11. Deny test: ask for a different swap, for example remove 1 Mind Stone and add 1 Fellwar Stone, and choose **Deny**. The deck must not change.
12. Stale revision test: ask ChatGPT to preview a change. Then, in the Supabase table editor, change any `deck_cards` row for the deck. This adds 1 to the revision. Ask ChatGPT to apply the old preview. Expect a `stale_revision` tool error and no change.
13. New conversation test: run one more write in a new chat. Note whether the prompt appears again.
14. Refresh test: wait more than one hour. In the same chat, ask for the deck again. Pass if it works without a new sign-in.

## Evidence

- Server logs: `npm run logs -- 120`. Each line shows the protocol version header, user agent, tool, `client_id`, `aud`, and result.
- The DCR client record: Supabase dashboard, Authentication, OAuth Apps.
- Deck state before and after each write: tables `decks`, `deck_cards`, and `deck_change_log`.

## Cleanup

After the test, delete the ChatGPT app, then delete the Supabase project `mtgscan-mcp-spike`. That removes the user, the data, the OAuth clients, and the function.
