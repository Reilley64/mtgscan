# Refuse MCP tokens by their client_id claim

The MCP connection uses Supabase Auth's OAuth 2.1 server. An access token issued to an AI client is an ordinary Supabase JWT with the `authenticated` role. So the Data API accepts it, and a client that holds one could skip the MCP server and call the app's write functions directly. The AI must never change a deck, a copy, or a user tag, so those functions have to refuse these tokens.

The brief planned one marker for both checks: a custom access token hook that adds the MCP server URL to `aud`. That works only if the Data API accepts an array `aud`, and nobody has tested it. Supabase does document a `client_id` claim on every token that its OAuth server issues. Sessions that the app makes with native Google or Apple sign-in never have one.

So mtgscan uses two markers (owner decision, spec 8):

- **Postgres refuses by `client_id`.** Every app write function calls one private helper right after the caller check. The helper refuses any token that has a `client_id` claim. The AI write functions do the reverse and accept only tokens that have one. ADR 0008 says which writes those are.
- **The MCP server checks the audience.** The hook sets `aud` to `authenticated` plus the MCP server URL for OAuth tokens. The MCP server refuses a token without that audience, as the MCP authorization spec asks.

## Consequences

- The release gate, an app write function called with an MCP token, depends only on a claim that Supabase documents. It does not depend on the hook.
- If the launch pre-flight shows that the Data API refuses an array `aud`, the hook is dropped. The MCP server then refuses tokens without a `client_id` claim instead, as the #12 spike did.
- Every new app write function must call the helper. A database test calls each one with fake MCP claims and expects a refusal.
- Read functions do not call the helper. An MCP token can read the same data through the Data API that the read tools return, which is the data the MCP connection already exposes.

## Considered options

- **The hook's audience for both checks.** Rejected. The release gate would rest on the untested array `aud`.
- **`client_id` only, with no hook.** Rejected. It works, but the MCP server would not check that the token was issued for it, which the MCP spec asks for.
