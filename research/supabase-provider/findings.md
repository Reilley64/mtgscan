# What the Supabase provider can manage on the hosted project

Research for [#312](https://github.com/Reilley64/mtgscan/issues/312), part of the map [#310](https://github.com/Reilley64/mtgscan/issues/310). Checked on 2026-10-16 against provider v1.11.0, Supabase CLI 2.120.0, and OpenTofu 1.13.1.

## Answer

- The official provider is `supabase/supabase` v1.11.0, released on 2026-09-02. It is on the OpenTofu registry. It has 7 resources and 4 data sources.
- `supabase_project` and `supabase_settings` cover what #310 gives OpenTofu: the project, auth, the Data API, and network restrictions.
- Every auth setting on the list has a Management API field, and the provider sends all of them: the site URL, redirect URLs, Apple and Google, the sign-up hook, the OAuth server, JWT expiry, and rate limits.
- `auth` is one JSON string. The provider writes only the keys you declare and tracks only those keys. A dashboard change to an undeclared key never shows in a plan.
- Secrets are the weak point. The provider has no write-only attributes. `auth` is not marked sensitive, so a secret in it is stored in plain text in state. If the secret comes from a sensitive variable, OpenTofu hides the whole `auth` diff in the plan. A secret changed by hand in the dashboard never shows as drift.
- Importing works, but the first plan always shows `supabase_settings` as "update in-place". The apply then sends a PATCH with the values that are already there. A reviewer can check that nothing changes, but only when the `auth` diff is visible, so the secrets must sit in a second `supabase_settings` resource or stay out of OpenTofu.
- `supabase_project` needs `database_password`, and the API cannot read it back. Import it with `ignore_changes = [database_password]`. Otherwise the first apply resets the database password. Add `prevent_destroy`, because destroying the resource deletes the project.
- Supabase publishes no guidance on using the provider and `config.toml` together. Its own config-as-code path is `config.toml` with `[remotes.<name>]` blocks plus `supabase config push`. OpenTofu cannot read TOML. Keeping one source of truth needs either a check that compares the two files, or a choice to keep hosted auth in `config.toml`. That is #317.
- The provider needs a personal access token. Scoped tokens limited to one project now exist. Updating auth needs Auth Config read-write and Project Settings read-write. Project Settings read-write also allows pausing, restarting, and deleting the project. There is no OIDC sign-in for the Management API, so the token is a GitHub Actions secret.

## Findings

### Provider version, resources, and open issues

- v1.11.0 is the latest release, from 2026-09-02. Its changes since v1.10.1 are a stricter `SUPABASE_API_ENDPOINT` check and a fix that forwards every Postgres parameter. [Release v1.11.0](https://github.com/supabase/terraform-provider-supabase/releases/tag/v1.11.0)
- `tofu init` with OpenTofu 1.13.1 pulled `registry.opentofu.org/supabase/supabase` 1.11.0. `tofu providers schema -json` lists these resources: `supabase_apikey`, `supabase_branch`, `supabase_edge_function`, `supabase_edge_function_secrets`, `supabase_project`, `supabase_settings`, `supabase_third_party_auth`. These are the data sources: `supabase_apikeys`, `supabase_branch`, `supabase_network_bans`, `supabase_pooler`. The provider has no functions and no ephemeral resources. [docs/resources](https://github.com/supabase/terraform-provider-supabase/tree/v1.11.0/docs/resources)
- `supabase_settings` has these attributes: `api`, `auth`, `database`, `network`, `pooler`, `storage`, and `ssl_enforcement`. Each one except `ssl_enforcement` is a JSON string. Deleting the resource does nothing, because the API cannot reset settings. [settings.md](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/docs/resources/settings.md), [settings_resource.go](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/internal/provider/settings_resource.go)
- `pooler` is in the schema, but Create, Read, and Update never use it. Setting it has no effect. [settings_resource.go](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/internal/provider/settings_resource.go)
- There are 5 open issues. Two of them matter here. [#353](https://github.com/supabase/terraform-provider-supabase/issues/353) asks for a write-only `database_password_wo`, because the superuser password is plain text in state. [#360](https://github.com/supabase/terraform-provider-supabase/issues/360) asks for a Vault resource. The other three cover nano instance creation, duplicate edge function secret names, and new publishable keys.
- Drift and diff issues that are now fixed:
  - [#310](https://github.com/supabase/terraform-provider-supabase/issues/310) and [#202](https://github.com/supabase/terraform-provider-supabase/issues/202): masked secrets caused "inconsistent values for sensitive attribute" on every apply. Fixed by copying secret fields from the plan or state.
  - [#336](https://github.com/supabase/terraform-provider-supabase/issues/336), fixed by [PR #341](https://github.com/supabase/terraform-provider-supabase/pull/341) in v1.10.0: `external_apple_additional_client_ids` failed after apply, because the API folds the extra IDs into `external_apple_client_id`. The fix keeps the user's split fields in state. As a result, a change to those IDs made in the dashboard is never seen.
  - [#229](https://github.com/supabase/terraform-provider-supabase/issues/229): an update changed `auth` when only `network` changed. Fixed: Update now sends only the categories that differ from state. The issue also shows that the API refuses `rate_limit_email_sent` without custom SMTP: "Custom SMTP required to configure SMTP_SENDER_NAME or RATE_LIMIT_EMAIL_SENT".
  - [#293](https://github.com/supabase/terraform-provider-supabase/issues/293): importing failed on a decimal `sessions_inactivity_timeout`. Fixed.
- [#211](https://github.com/supabase/terraform-provider-supabase/issues/211) is closed, but it describes behavior that stays. Secret fields are write-only in the API, so the plan compares against the value in state, and a change made outside OpenTofu is not seen. The provider docs now list these fields.

### What the provider sends for auth

- `updateAuthConfig` parses the `auth` JSON into `api.UpdateAuthConfigBody` and PATCHes `/v1/projects/{ref}/config/auth`. `readAuthConfig` refreshes only the keys that are already in state. Secret fields are copied from state, not from the API. [settings_resource.go](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/internal/provider/settings_resource.go)
- `api.UpdateAuthConfigBody` comes from `github.com/supabase/cli/pkg` v1.2.3, tagged on 2026-04-16. Go drops JSON keys that the struct does not know. An auth key that the API added after April 2026 would be dropped from the PATCH without an error. The provider had this bug for database settings and fixed it in v1.11.0. Auth still decodes through the struct. Every key in the table below is in v1.2.3. [go.mod](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/go.mod), [types.gen.go](https://github.com/supabase/cli/blob/pkg/v1.2.3/pkg/api/types.gen.go), [fix #356](https://github.com/supabase/terraform-provider-supabase/pull/356)

### Mapping of today's hand-set auth settings

The Management API fields are from `UpdateAuthConfigBody` in the [OpenAPI spec](https://api.supabase.com/api/v1-json) and the CLI types. The `config.toml` column uses the CLI's own mapping in [auth.go](https://github.com/supabase/cli/blob/v2.120.0/apps/cli-go/pkg/config/auth.go).

| Setting | `config.toml` | Management API field |
| --- | --- | --- |
| Site URL | `auth.site_url` | `site_url` |
| Redirect URLs | `auth.additional_redirect_urls` | `uri_allow_list`, one comma-joined string |
| Apple on | `auth.external.apple.enabled` | `external_apple_enabled` |
| Apple client IDs, Services ID first | `auth.external.apple.client_id` | `external_apple_client_id`, or that plus `external_apple_additional_client_ids` |
| Apple web client secret | `auth.external.apple.secret` | `external_apple_secret` |
| Apple email optional | `auth.external.apple.email_optional` | `external_apple_email_optional` |
| Google on | `auth.external.google.enabled` | `external_google_enabled` |
| Google client IDs, web ID first | `auth.external.google.client_id` | `external_google_client_id`, or that plus `external_google_additional_client_ids` |
| Google secret | `auth.external.google.secret` | `external_google_secret` |
| Google skip nonce check | `auth.external.google.skip_nonce_check` | `external_google_skip_nonce_check` |
| `limit_email_sign_ups` hook | `auth.hook.before_user_created.enabled`, `.uri` | `hook_before_user_created_enabled`, `hook_before_user_created_uri` |
| OAuth 2.1 server | `auth.oauth_server.enabled` | `oauth_server_enabled` |
| Dynamic client registration | `auth.oauth_server.allow_dynamic_registration` | `oauth_server_allow_dynamic_registration` |
| Consent page path | `auth.oauth_server.authorization_url_path` | `oauth_server_authorization_path` |
| JWT expiry | `auth.jwt_expiry` | `jwt_exp` |
| Emails sent per hour | `auth.rate_limit.email_sent` | `rate_limit_email_sent`, needs custom SMTP |
| SMS sent per hour | `auth.rate_limit.sms_sent` | `rate_limit_sms_sent` |
| Anonymous sign-ins | `auth.rate_limit.anonymous_users` | `rate_limit_anonymous_users` |
| Token refreshes | `auth.rate_limit.token_refresh` | `rate_limit_token_refresh` |
| Sign-ups and sign-ins | `auth.rate_limit.sign_in_sign_ups` | `rate_limit_otp` |
| Token verifications | `auth.rate_limit.token_verifications` | `rate_limit_verify` |
| Web3 sign-ins | `auth.rate_limit.web3` | `rate_limit_web3` |

- The consent page URL is the site URL plus the authorization path. With the consent page at `https://mtgscan.reilley.dev/oauth/consent`, the hosted site URL must be `https://mtgscan.reilley.dev` and the path `/oauth/consent`. [OAuth 2.1 server, getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- Client ID order. The API returns the Apple IDs merged into `external_apple_client_id`. The provider's own test uses that response shape. Writing `external_apple_client_id = "dev.reilley.mtgscan.web,dev.reilley.mtgscan"` as one string matches what the API returns, so a reorder made in the dashboard shows in the plan. With the split fields, the provider keeps the config values in state, so a reorder is never seen. [PR #341 test](https://github.com/supabase/terraform-provider-supabase/pull/341/files)
- For Google, the CLI joins `external_google_additional_client_ids` back onto the client ID when it reads, the same way it does for Apple. The provider has no such handling for Google. Whether the hosted API splits the Google IDs is unknown. The import plan will show the actual shape. Copy that shape exactly. [auth.go](https://github.com/supabase/cli/blob/v2.120.0/apps/cli-go/pkg/config/auth.go)
- The hook secret field `hook_before_user_created_secrets` is not in the provider's list of secret fields. The `pg-functions://` hook has no secret, so this does not matter for mtgscan.

### Secrets in state, plan output, and write-only attributes

- No attribute in the provider is write-only. `auth` is optional and not sensitive. Only `access_token`, `database_password`, API key values, branch database credentials, and edge function secret values are sensitive. Checked in `tofu providers schema -json` and in the source. [settings_resource.go](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/internal/provider/settings_resource.go), [project_resource.go](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/internal/provider/project_resource.go)
- OpenTofu 1.11 and later support write-only attributes, but a provider has to declare them. The provider is on terraform-plugin-framework v1.19.0, which supports them, but it declares none. [Write-only attributes](https://opentofu.org/docs/language/ephemerality/write-only-attributes/), [#353](https://github.com/supabase/terraform-provider-supabase/issues/353)
- An expression that uses a sensitive variable is itself sensitive. So `jsonencode({ ..., external_apple_secret = var.apple_secret })` hides the whole `auth` diff as "(sensitive value)". OpenTofu still writes sensitive values to state in plain text. [Input variables, suppressing values](https://opentofu.org/docs/language/values/variables/), [Sensitive data in state](https://opentofu.org/docs/language/state/sensitive-data/)
- The mock run below confirmed both points. The state file held the secret in plain text, and `sensitive_attributes` marked `auth`.
- The API returns secrets as digests. The provider keeps the planned secret in state. A secret pasted into the dashboard leaves the plan unchanged. When the secret variable changes, the plan shows `~ auth = (sensitive value)` and the apply sends the new secret. [settings.md](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/docs/resources/settings.md), [#211](https://github.com/supabase/terraform-provider-supabase/issues/211)
- The CLI hashes a secret with HMAC-SHA256, keyed by the project ID, and compares the result with the digest that the API returns. This suggests a script could prove that the secret in GitHub matches the hosted one without printing either. This is inferred from CLI source and not tested against the API. [secret.go](https://github.com/supabase/cli/blob/v2.120.0/apps/cli-go/pkg/config/secret.go), [config.go](https://github.com/supabase/cli/blob/v2.120.0/apps/cli-go/pkg/config/config.go)
- Two `supabase_settings` resources can point at the same project. One holds the non-secret auth keys. The other holds only `external_apple_secret` and `external_google_secret`. Each refreshes only its own keys, so the first resource keeps a readable diff. This worked against the mock. It is not a documented pattern, and a PATCH with only secrets has not been tried on the real API.

### What the provider cannot manage, and the CLI command for each

| Not in the provider | CLI or other path |
| --- | --- |
| Migrations, including the `gallery` bucket | `supabase db push`, today's workflow |
| Edge Function code, if any is added later | `supabase functions deploy`. The provider has `supabase_edge_function`, but #310 keeps functions on the CLI |
| Edge Function secrets | `supabase secrets set`. The provider has `supabase_edge_function_secrets` |
| Pooler settings | The `pooler` attribute does nothing. `config push` calls `db.pooler.*` "no Management API field". Dashboard |
| Realtime settings | No provider support and no `config push` support. Dashboard or `PATCH /v1/projects/{ref}/config/realtime` |
| Auth signing keys, which the OAuth server needs for ID tokens | No provider resource. `config push` does not call `UpdateSigningKeys`. Dashboard or the `/config/auth/signing-keys` endpoints |
| SSO providers | `supabase sso` |
| Custom domain and vanity subdomain | `supabase domains`, `supabase vanity-subdomains` |
| Network bans | `supabase network-bans`. The provider can only read them |
| Database password | Dashboard. `supabase_project` requires the value but cannot read it |
| Backups and Postgres upgrades | `supabase backups`, dashboard |
| Vault secrets | SQL in migrations. Provider request [#360](https://github.com/supabase/terraform-provider-supabase/issues/360) |
| OAuth clients registered through dynamic registration | Runtime data, not config. The Management API has no endpoint for them |

Sources: [docs/resources](https://github.com/supabase/terraform-provider-supabase/tree/v1.11.0/docs/resources), [config push side effects](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/commands/config/push/SIDE_EFFECTS.md), [OpenAPI spec](https://api.supabase.com/api/v1-json), `bunx supabase@2.120.0 --help`.

### `supabase config push`, `[remotes]`, and one source of truth

- `supabase config push` reads the hosted config once and writes only the properties that `config.toml` declares and that differ. For each OAuth provider and each hook, it sends the whole group. A member that the file leaves out is sent with its current hosted value. [SIDE_EFFECTS.md](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/commands/config/push/SIDE_EFFECTS.md)
- A `[remotes.<name>]` block with `project_id = "<ref>"` overrides the base config when the target ref matches. Supabase documents it for branches and persistent environments. [Branching configuration](https://supabase.com/docs/guides/deployment/branching/configuration)
- CLI 2.120.0 also has `supabase config diff` and `supabase config pull`. `config diff` is read-only and exits with code 2 on drift when given `--exit-code`. `config pull --remote-label <name>` writes the hosted values into a `[remotes.<name>]` block and leaves the local settings alone. [diff.md](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/docs/supabase/config/diff.md), [pull.md](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/docs/supabase/config/pull.md)
- Supabase's Terraform docs, the provider tutorial, and the [supabase-action-example](https://github.com/supabase/supabase-action-example) repo never mention `config.toml` together with the provider. The tutorial says "Resolve the drift by manually editing your `*.tf` files". I found no Supabase guidance on keeping one source of truth. [Terraform provider docs](https://supabase.com/docs/guides/deployment/terraform), [tutorial](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/docs/tutorial.md)
- OpenTofu has no `tomldecode`. The request [opentofu#2912](https://github.com/opentofu/opentofu/issues/2912) is open and pending a decision. OpenTofu cannot read `config.toml` directly.
- These options follow from the facts above. They are not Supabase guidance.
  1. OpenTofu owns the hosted values, and `config.toml` keeps the local ones. A test checks that the values both need agree, such as the client ID order, the hook URI, and the OAuth server flags. The repo already has such a test for `supabase-project.ts` and `apps/site/_headers`. Nobody runs `config push` against the hosted project.
  2. Hosted auth lives in `[remotes.production]` in `config.toml`, and CI runs `supabase config push`. This is Supabase's own path, but it goes against #310, which gives auth to OpenTofu.
  3. Same as option 1, but a scheduled `supabase config diff --exit-code` against the hosted project reports differences. The local site URL and redirect URLs always differ, so the job needs a list of expected differences.

### Importing so that the first apply changes nothing

A throwaway check ran OpenTofu 1.13.1 and the provider against a local mock of the Management API. The provider reads `SUPABASE_API_ENDPOINT`, and the mock returned a made-up auth config. The scripts are in `mock-import/`. Results:

- `supabase_project` imported with no change when the config had `ignore_changes = [database_password]`. Without that line, `Update` compares the config password with the null in state and calls `V1UpdateDatabasePassword`. [project_resource.go](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/internal/provider/project_resource.go)
- Import fills `supabase_settings` with every category it can read. The plan then shows "will be updated in-place". Undeclared keys show as `-` lines, and `api` shows `-> null` when the config does not declare it. Declared keys with the hosted value show unchanged. A declared key with a different value shows as `~`.
- The apply sent one PATCH to `/config/auth` with only the declared keys, all of them at their hosted values. It sent no request for `api`. The next plan showed "No changes".
- With the secrets inside the same `auth` JSON, the first plan showed only `~ auth = (sensitive value)`, so nobody could check it. With the secrets in a second resource, the main diff stayed readable.
- After a hand edit of `uri_allow_list` in the mock, the plan showed `~ uri_allow_list = "<hand value>" -> "<config value>"`. After a hand edit of the Apple secret, the plan showed nothing.
- So the proof of "changes nothing" is a check of the first plan: `supabase_project` is import only, and the non-secret `auth` diff has no `~` or `+` lines. The secret PATCH cannot be checked this way. Comparing digests might work, as noted above.
- `organization_id` must be the organization slug. The provider reads it from the API's deprecated `organization_id` field. [Project docs](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/docs/resources/project.md), [#218](https://github.com/supabase/terraform-provider-supabase/issues/218)
- Import also reads the database, storage, and SSL settings. Each read that fails stops the import, so the import token needs read access to those categories too. [settings_resource.go](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/internal/provider/settings_resource.go)

### Token

- The provider reads `SUPABASE_ACCESS_TOKEN` or `access_token`. Its endpoint defaults to `https://api.supabase.com`. [Provider docs](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/docs/index.md)
- Personal access tokens come as classic tokens with full account access, or as scoped tokens limited to chosen organizations, projects, and permissions. Scoped tokens start with `sbp_fc`. Supabase recommends scoped tokens for CI. [Personal access tokens](https://supabase.com/docs/guides/platform/personal-access-tokens)
- These are the calls the provider makes for the resources in #310, with the scoped permission for each. Source: [project_resource.go](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/internal/provider/project_resource.go), [settings_resource.go](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/internal/provider/settings_resource.go), [utils.go](https://github.com/supabase/terraform-provider-supabase/blob/v1.11.0/internal/provider/utils.go), [permission table](https://supabase.com/docs/guides/platform/personal-access-tokens).

| Call | Permission |
| --- | --- |
| Get project, get services health | Project Settings: Read |
| Get legacy API keys, for `supabase_project` | API Keys: Read |
| List add-ons, for `supabase_project` | Add-ons: Read |
| Get PostgREST config, before every update | Data API Config: Read. Footnote 7 may also require Data API JWT Secret: Read |
| Get and update auth config | Auth Config: Read and Read-write. The update also needs Project Settings: Read-write |
| Get and update PostgREST config | Data API Config: Read and Read-write |
| Get and apply network restrictions | Network Restrictions: Read and Read-write |
| On import only: Postgres config, storage config, SSL enforcement | Database Config: Read, Storage Config: Read, SSL Enforcement: Read |

- A plan needs only the Read permissions. An apply needs the Read-write ones. Project Settings: Read-write also allows delete, pause, restart, and restore. That breadth cannot be avoided for auth updates. [Personal access tokens, footnote 3](https://supabase.com/docs/guides/platform/personal-access-tokens)
- The Management API accepts personal access tokens and OAuth2 app tokens. I found no GitHub OIDC exchange. CI stores the token as an Actions secret. [Management API introduction](https://supabase.com/docs/reference/api/introduction)
- A plan job that can read state can also read every secret in state, whatever token it uses. This is the point of [#353](https://github.com/supabase/terraform-provider-supabase/issues/353).
- The current `database-migrations.yml` uses its own `SUPABASE_ACCESS_TOKEN`. With a scoped token, `supabase link` needs Project Settings, API Keys, and API Key Secrets, all Read. [Personal access tokens](https://supabase.com/docs/guides/platform/personal-access-tokens)

## Open questions for the owner

- Do the Apple and Google secrets go into OpenTofu at all? If they do, they sit in state in plain text, and one resource's diff is hidden. If they do not, the 6-month Apple renewal stays a dashboard paste. Decide in #318.
- If the secrets go into OpenTofu, is a second `supabase_settings` resource for the secrets acceptable? It keeps the main auth diff readable, but it is not a documented pattern.
- Which option keeps one source of truth for auth values shared with the local stack? Decide in #317.
- Should OpenTofu also manage `ssl_enforcement`, `storage`, or `database`? #310 names only auth, the API, and the network. Each extra category widens the token.
- The hosted values are not known yet, including whether Google client IDs come back as one string or split. `supabase config pull --remote-label production` into a scratch copy, or the import plan itself, can record them for #314.
- Is one apply token with Project Settings: Read-write acceptable, plus a read-only token for PR plans? Decide in #320.
