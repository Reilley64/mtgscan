# Current-account API v1

Part of [MTGSCAN-275](https://app.plane.so/reilley/browse/MTGSCAN-275/).
This route enters the native account shell. It is not an MCP or general collection-read endpoint.

`GET /api/v1/account` accepts one `Authorization: Bearer <Supabase access token>`.
It has no request body or owner field. Query fields cannot choose an account.

| Status | JSON |
| --- | --- |
| 200 | `{"account_id":"<verified-user-uuid>"}` |
| 401 | `{"error":{"code":"unauthenticated"}}` |
| 403 | `{"error":{"code":"mcp_token_forbidden"}}` |
| 503 | `{"error":{"code":"identity_unavailable"}}` |

Responses use JSON and `Cache-Control: no-store`. A 401 includes `WWW-Authenticate: Bearer`.
A trusted Auth rejection is 401, including AI tokens rejected by newer Auth versions before claim mapping.
A verified token carrying any top-level `client_id` field is refused with 403.
This does not supersede ADR 0007's existing collection-read permission.

## Trust boundary

The identity adapter first sends the exact credential to the configured HTTPS Supabase Auth `/auth/v1/user` endpoint.
Auth verifies its signature, expiration, audience, user and session. It supports the project's existing symmetric and asymmetric signing keys.
Only after that successful trusted verification does the adapter inspect the same token's claims.
It checks the configured issuer, authenticated audience, expiration against the server clock, authenticated role, non-anonymous status, non-nil user/session UUIDs and subject equality with the trusted Auth user.
Request fields and `user_metadata` are ignored for authority.
Redirects are disabled and network failures return 503. No server signing secret or service key is needed.

## Run locally

From the repo root, set `SUPABASE_URL` to the approved HTTPS project origin and `SUPABASE_PUBLISHABLE_KEY` to its public `sb_publishable_` key.
Then run `mise exec -- cargo run --locked -p mtgscan-server`.
It binds `127.0.0.1:8080` unless `LISTEN_ADDRESS` is set.
This is not a deployment command. Do not expose it to the public internet without the separate reviewed infrastructure plan and approval.
No hosted Auth request is required for unit checks.

The new automated suite is unit-only. It cannot prove hosted Auth behavior, TLS, a native bridge, actual keychain persistence or live proxy routing.
