# OpenTofu practices for state, secrets, CI, and imports

Research for [#311](https://github.com/Reilley64/mtgscan/issues/311), part of the map [#310](https://github.com/Reilley64/mtgscan/issues/310). Checked on 2026-10-16 against OpenTofu v1.13.1 (the version on the owner's Mac), its docs at tag `v1.13.1`, and the current Supabase, Cloudflare, and GitHub docs.

Tickets [#312](https://github.com/Reilley64/mtgscan/issues/312) and [#313](https://github.com/Reilley64/mtgscan/issues/313) own the provider details and the R2 bucket token. This file covers OpenTofu itself and how a small project runs it.

## Answer

- Pin OpenTofu to an exact version in CI with `opentofu/setup-opentofu` and a `.opentofu-version` file. In the config, use `required_version = "~> 1.13.0"` or the newer `language` block. Use `~>` for each provider.
- Commit `.terraform.lock.hcl`. Since v1.12 a plain `tofu init` on the Mac records checksums for every platform, so CI on Linux needs no `tofu providers lock` step. CI runs `tofu init -lockfile=readonly`.
- Dependabot has an `opentofu` ecosystem that updates providers and the lock file. Renovate also works, but it tracks `required_version` against Terraform releases unless a rule changes that. Neither bot updates the OpenTofu version in `.opentofu-version`.
- Put the config in its own folder at the repo root, outside `supabase/` and outside the Bun workspaces. One root module with both providers is enough at this size. Split the state only if the owner wants separate credentials per provider.
- R2 through the `s3` backend with `use_lockfile = true` works, and R2 supports the conditional write that the lock needs. R2 has no object versioning, so there is no state history. A lost network reply can also leave a stale lock that needs `tofu force-unlock`, and OpenTofu declined to fix that case.
- The `pg` backend in the Supabase database works only through a direct connection or the session pooler, because it uses session advisory locks. It also stores the state inside the system it manages. The `http` backend needs a server you write and run.
- Turn on state and plan encryption with `enforced = true`. Without a cloud KMS, the practical key provider is PBKDF2 with a long passphrase kept as a GitHub secret and in the owner's password manager. Rotate with a `fallback` block.
- Mark secret inputs `sensitive`, or `ephemeral` where they only feed a provider block or a write-only attribute. A secret sent to a normal resource attribute still lands in state. A code search found no write-only attributes in the Supabase provider v1.11.0, so the Apple and Google secrets would sit in state if OpenTofu sets them. Encryption is what protects them.
- CI plans on each PR. On merge, one job runs a fresh plan and applies it. That job uses a `production` environment limited to `main`. Do not apply the PR's saved plan. Put all state jobs in one concurrency group and never cancel an apply. Neither Supabase nor Cloudflare documents a GitHub OIDC exchange, so CI uses long-lived tokens in environment secrets.
- The repo is public. Any signed-in GitHub user can read PR plan comments, run logs, and artifacts. Fork PRs get no secrets. Sensitive values print as `(sensitive value)`, but other settings print in full.
- For drift, a scheduled `tofu plan -detailed-exitcode` returns 2 when something changed. GitHub turns off scheduled workflows in a public repo after 60 days without activity.
- Import with `import` blocks and `tofu plan -generate-config-out`. Generated config sets sensitive and write-only attributes to `null`, so supply those values before the apply, or the plan will try to change them. Prove the result with a second plan that reports no changes (`-detailed-exitcode` returns 0).
- Protect the Supabase project with `lifecycle { destroy = false }` (v1.12). It is stored in state and still holds if someone deletes the resource block. `prevent_destroy` does not.
- Checks worth running: `tofu fmt -check -recursive`, `tofu validate` after `tofu init -backend=false`, and `tofu test` with mock providers for a few rules. TFLint skips `.tofu` files and will not add OpenTofu support. Trivy has no checks for Cloudflare or Supabase resources, so it adds little here.

## Findings

### OpenTofu versions

- OpenTofu v1.13.0 shipped on 2026-09-30 and v1.13.1 on 2026-10-01 ([releases](https://github.com/opentofu/opentofu/releases)). The v1.13 series is supported until 1 August 2027 ([v1.13 changelog](https://github.com/opentofu/opentofu/blob/v1.13/CHANGELOG.md)).
- An unreleased v1.13.2 carries a security fix for excessive CPU use when `tofu init` talks to a hostile HTTP/2 server. v1.12.8 already shipped the same fix on 2026-10-14 ([v1.13 changelog](https://github.com/opentofu/opentofu/blob/v1.13/CHANGELOG.md), [v1.12.8](https://github.com/opentofu/opentofu/releases/tag/v1.12.8)).
- The features below arrived after the fork. Versions come from the release notes ([v1.7.0](https://github.com/opentofu/opentofu/releases/tag/v1.7.0), [v1.8.0](https://github.com/opentofu/opentofu/releases/tag/v1.8.0), [v1.9.0](https://github.com/opentofu/opentofu/releases/tag/v1.9.0), [v1.10.0](https://github.com/opentofu/opentofu/releases/tag/v1.10.0), [v1.11.0](https://github.com/opentofu/opentofu/releases/tag/v1.11.0), [v1.12.0](https://github.com/opentofu/opentofu/releases/tag/v1.12.0), [v1.13.0](https://github.com/opentofu/opentofu/releases/tag/v1.13.0)).
  - 1.7: state and plan encryption, declarative `removed` blocks, `for_each` on `import` blocks.
  - 1.8: variables and locals in backend blocks, provider mocking in `tofu test`.
  - 1.9: `for_each` on provider blocks, the `-exclude` plan option.
  - 1.10: native S3 locking with `use_lockfile`, OCI registries.
  - 1.11: ephemeral resources, ephemeral variables and outputs, write-only attributes, the `enabled` meta-argument. `-var` is allowed with `tofu apply <planfile>` so ephemeral variables can be passed again.
  - 1.12: dynamic `prevent_destroy`, the `destroy = false` lifecycle argument, full registry checksums written by `tofu init`, `-json-into`, the `language` block.
  - 1.13: an experimental `-lint` flag and new functions that reduce unknown values during planning.

### Pinning versions

- `required_version` still works in a `terraform` block. OpenTofu v1.12 added a `language { compatible_with { opentofu = "..." } }` block. Terraform does not read it, and OpenTofu v1.11 and older reject it ([settings](https://opentofu.org/docs/language/settings/)).
- For root modules, the docs recommend a `~>` constraint on each provider, which sets a lower and an upper bound ([version constraints](https://opentofu.org/docs/language/expressions/version-constraints/#best-practices)). `~> 1.13.0` allows 1.13.x but not 1.14.0.
- OpenTofu creates `.terraform.lock.hcl` on `tofu init`, and the docs say to commit it. With a lock entry present, `init` reinstalls that exact version until someone runs `tofu init -upgrade` ([dependency lock file](https://opentofu.org/docs/language/files/dependency-lock/)).
- Since v1.12 the OpenTofu Registry returns `zh:` and `h1:` hashes for all platforms, and a first `tofu init` records all of them. `tofu providers lock -platform=...` is now needed only for mirrors ([dependency lock file](https://opentofu.org/docs/language/files/dependency-lock/), [providers lock](https://opentofu.org/docs/cli/commands/providers/lock/), [v1.12.0 notes](https://github.com/opentofu/opentofu/releases/tag/v1.12.0)).
- `tofu init -lockfile=readonly` verifies checksums and refuses to change the lock file ([init](https://opentofu.org/docs/cli/commands/init/)). That suits CI.
- Both providers are on the OpenTofu Registry. The latest versions are `supabase/supabase` 1.11.0 and `cloudflare/cloudflare` 5.28.0 ([registry API, Supabase](https://registry.opentofu.org/v1/providers/supabase/supabase/versions), [registry API, Cloudflare](https://registry.opentofu.org/v1/providers/cloudflare/cloudflare/versions)).
- `opentofu/setup-opentofu` accepts `tofu_version` or `tofu_version_file`. The file can be a one-line `.opentofu-version` or an asdf `.tool-versions` line. It checks the binary against the release's SHA256SUMS by default. The latest release is v2.0.2 ([action.yml](https://github.com/opentofu/setup-opentofu/blob/main/action.yml), [README](https://github.com/opentofu/setup-opentofu#readme), [releases](https://github.com/opentofu/setup-opentofu/releases)). The repo pins every action to a commit SHA with a version comment, so this action would follow the same rule.

### Update bots

- The repo has no Dependabot or Renovate config today. `.github` holds only `workflows`.
- Dependabot added an `opentofu` package ecosystem on 2025-12-16. It updates modules and providers in `.tf` and `.tofu` files, and it updates `.terraform.lock.hcl` when present. The OpenTofu community maintains it ([GitHub changelog](https://github.blog/changelog/2025-12-16-dependabot-version-updates-now-support-opentofu/), [supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories#opentofu)). The docs mention modules and providers only, not the OpenTofu version.
- Renovate's `terraform` manager reads `**/*.tf` and `**/*.tofu` and maintains `.terraform.lock.hcl`. It computes hashes from the OpenTofu Registry ([index.ts](https://github.com/renovatebot/renovate/blob/main/lib/modules/manager/terraform/index.ts), [hash.ts](https://github.com/renovatebot/renovate/blob/main/lib/modules/manager/terraform/lockfile/hash.ts)).
- Renovate maps `required_version` to `hashicorp/terraform` GitHub releases ([terraform-version.ts](https://github.com/renovatebot/renovate/blob/main/lib/modules/manager/terraform/extractors/terraform-block/terraform-version.ts)). For OpenTofu it would propose Terraform version numbers unless a package rule disables that dependency type. Its docs say it defaults to the Terraform registry for providers with no host, and they show a rule that points it at `registry.opentofu.org` ([Renovate terraform manager](https://docs.renovatebot.com/modules/manager/terraform/)).
- Neither bot reads `.opentofu-version`. The OpenTofu version needs a manual bump or a custom Renovate regex manager. This is an inference from the files each bot reads.

### Repository layout and state splitting

- OpenTofu reads every `.tf` and `.tofu` file in one directory as one module. When `foo.tf` and `foo.tofu` both exist, it reads only `foo.tofu` ([files](https://opentofu.org/docs/language/files/)).
- The workspace docs say to split configurations along system boundaries. They say CLI workspaces are not the way to separate deployments that need different credentials, because workspaces share one backend. For several deployments, the docs suggest a reusable module plus one small root module per deployment, each with its own backend ([workspaces](https://opentofu.org/docs/cli/workspaces/#when-not-to-use-multiple-workspaces)).
- In this repo, `supabase/` is a Bun workspace package and the Supabase CLI's folder (`package.json` `workspaces`). A folder at the root that is not a package, such as `infra/`, stays outside the Bun workspaces. `checks.yml` decides which jobs run with `dorny/paths-filter`, so a new folder needs its own filter.
- Nothing in today's setup needs a value from the other provider. The Supabase redirect URLs name `mtgscan.reilley.dev` as a fixed string, and the site's CSP names the Supabase URL in `apps/site/_headers`, a file Workers Builds deploys. This is my reading of the README and the repo files, not a provider fact.
- Trade-off for one state against two:
  - One root module means one init, one lock, and one plan per PR. Every plan job needs both providers' tokens.
  - One state per provider means a Cloudflare-only change needs no Supabase token, and an outage at one provider blocks only its half. It doubles the backend keys, the locks, and the CI jobs.
- `moved` blocks rename resources or move them into a module without destroying them ([refactoring](https://opentofu.org/docs/language/modules/develop/refactoring/)). So a single root module can later become a module plus one root per environment without recreating anything.

### State backends

#### R2 through the `s3` backend

- The `s3` backend's preferred lock is a conditional write with `If-None-Match`, turned on by `use_lockfile = true`. The lock is an extra object in the same bucket, next to the state ([s3 backend](https://opentofu.org/docs/language/settings/backends/s3/)).
- R2's `PutObject` supports `If-None-Match`. R2 checks it atomically, so when several clients write a missing key, at most one succeeds and the rest get `412 PreconditionFailed` ([R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/)).
- R2 does not support `PutBucketVersioning`. Its `PutObject` rejects the `x-amz-tagging` and `x-amz-server-side-encryption` headers ([R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/)). The OpenTofu docs recommend bucket versioning to recover state after mistakes ([s3 backend](https://opentofu.org/docs/language/settings/backends/s3/)), and on R2 there is no state history. Leave the backend's `encrypt`, `kms_key_id`, `state_tags`, and `lock_tags` options unset, because they depend on those headers. That last point is my inference from the option descriptions.
- Cloudflare's own example sets `region = "auto"`, `endpoints = { s3 = "https://<account id>.r2.cloudflarestorage.com" }`, `use_path_style = true`, and `skip_credentials_validation`, `skip_metadata_api_check`, `skip_region_validation`, `skip_requesting_account_id`, and `skip_s3_checksum`. It uses an R2 token with Object Read and Write scoped to one bucket ([Cloudflare remote R2 backend](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/)). The example puts the keys in the backend block. The OpenTofu backend docs say to pass credentials through the environment instead, because `-backend-config` values and hardcoded values end up in `.terraform` and in plan files ([backend configuration](https://opentofu.org/docs/language/settings/backends/configuration/)).
- In [opentofu#4405](https://github.com/opentofu/opentofu/issues/4405), an R2 user with `use_lockfile` hit one run in 34 where the lock PUT succeeded but the reply was lost. The SDK retried, got 412 against its own lock, and OpenTofu exited without removing the lock object. Every later run failed until someone deleted the lock. Maintainers closed it as not an OpenTofu bug on 2026-09-09 and closed the fix PRs. The way out is `tofu force-unlock <lock id>`, which takes the ID that the error prints ([locking](https://opentofu.org/docs/language/state/locking/)).
- OpenTofu will not add an R2-specific backend. Maintainers plan to move backends into plugins, and R2 support may come later through the Cloudflare provider ([opentofu#3075](https://github.com/opentofu/opentofu/issues/3075)).

#### The `pg` backend

- It needs Postgres 10 or newer and an existing database. It creates a `terraform_remote_state` schema and keeps a sequence in `public`. It locks with Postgres advisory locks, which release by themselves when the session ends, so `force-unlock` is not supported ([pg backend](https://opentofu.org/docs/language/settings/backends/pg/)).
- On Supabase, transaction mode on the shared pooler (port 6543) loses session-level advisory locks between transactions. Direct connections and the session pooler support them ([Supabase connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)).
- Direct connections are IPv6 unless the project buys the IPv4 add-on. The shared pooler, in both session and transaction mode, is IPv4 on every plan ([Supabase connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)). From an IPv4-only runner, that leaves the session pooler.
- My inferences, not tested:
  - The state of the Supabase project would live inside that project. A restore or a pause would affect the state too.
  - The backend needs a Postgres login. The existing `SUPABASE_DB_PASSWORD` secret belongs to the `postgres` role, which has wide rights. A narrower role would need a migration, which ties OpenTofu's storage to app migrations.
  - `supabase db diff` and `db pull` might see the new schema. I did not check this.

#### The `http` backend

- It stores state with GET, POST, and DELETE on a REST endpoint. It can lock through LOCK and UNLOCK requests. Locking is off unless `lock_address` is set ([http backend](https://opentofu.org/docs/language/settings/backends/http/)). Using it here means writing and running that service, for example a Worker.

### State and plan encryption

- OpenTofu encrypts state and plan files on the client before any backend sees them. Configure it in a `terraform { encryption { ... } }` block or in the `TF_ENCRYPTION` environment variable. When both exist, OpenTofu merges them and the environment wins ([encryption](https://opentofu.org/docs/language/state/encryption/)).
- It protects data at rest. It does not stop data loss, it does not stop someone replaying an old state or plan, and it does not hide values from whoever runs `tofu` ([encryption](https://opentofu.org/docs/language/state/encryption/)).
- Key providers:
  - `pbkdf2` derives a key from a passphrase of at least 16 characters.
  - `aws_kms`, `gcp_kms`, `azure_vault`, and `openbao` need those services.
  - `external` runs a program that returns the key. A PBKDF2 provider can take its passphrase from another provider with `chain`.
  - AES-GCM is the only built-in method.
  ([encryption](https://opentofu.org/docs/language/state/encryption/))
- The project has no cloud KMS, so the realistic choice is PBKDF2 with a long random passphrase. That is my inference.
- AES-GCM can reach key saturation. The docs say to use PBKDF2 with a long passphrase or a KMS that rotates keys ([encryption](https://opentofu.org/docs/language/state/encryption/#aes-gcm)).
- `enforced = true` in `state {}` and `plan {}` refuses to write unencrypted data. That matters when the key comes only from the environment ([encryption](https://opentofu.org/docs/language/state/encryption/#configuration), [enforce example](https://github.com/opentofu/opentofu/blob/v1.13.1/website/docs/language/state/examples/encryption/enforce.tf)).
- To rotate the key, add the new key provider and method, point `state.method` at it, and move the old method into a `fallback` block. OpenTofu reads with the fallback and always writes with the new method. Remove the fallback after the state has been written once. Do not rename a key provider in place, because the encrypted file stores metadata under its name. `encrypted_metadata_alias` allows renames ([encryption](https://opentofu.org/docs/language/state/encryption/#key-and-method-rollover)).
- Variables and locals can feed the encryption config, but they must resolve during `tofu init`, without state or provider functions ([encryption](https://opentofu.org/docs/language/state/encryption/#pre-existing-project)).
- A new project with no state can turn encryption on from the start. An existing unencrypted state needs a `method "unencrypted"` fallback for one apply ([encryption](https://opentofu.org/docs/language/state/encryption/#initial-setup)). Turning encryption on before the first import avoids that step.
- If the passphrase is lost, the state cannot be read ([encryption](https://opentofu.org/docs/language/state/encryption/#general-guidance-and-pitfalls-please-read)). Everything here can be imported again, so a lost state costs a re-import, not an outage. That is my inference.

### Secrets

- `sensitive` hides a value in the CLI output. The value is still stored in plain text in state and in the plan ([ephemerality](https://opentofu.org/docs/language/ephemerality/)).
- `ephemeral = true` on a variable keeps its value out of state. The plan stores only its name ([variables](https://opentofu.org/docs/language/values/variables/#ephemerality)). Ephemeral values can go only into providers, ephemeral resources, other ephemeral values, locals, provisioners, `connection` blocks, and write-only attributes ([ephemerality](https://opentofu.org/docs/language/ephemerality/)). A provider token is a good fit.
- An ephemeral variable used for a saved plan must be passed again to `tofu apply <planfile>` ([apply](https://opentofu.org/docs/cli/commands/apply/#ephemeral-variables)). Since v1.11, the apply errors if a non-ephemeral `-var` value differs from the plan ([v1.11.0 notes](https://github.com/opentofu/opentofu/releases/tag/v1.11.0)).
- Write-only attributes (v1.11) go to the provider but are stored as null in state and plan. OpenTofu cannot see a change in them, so providers pair each one with a normal "version" attribute that you bump to resend the value ([write-only attributes](https://opentofu.org/docs/language/ephemerality/write-only-attributes/)). They exist only where the provider defines them.
- A GitHub code search found no `WriteOnly` in `supabase/terraform-provider-supabase`. The latest release is v1.11.0 from 2026-09-02 ([releases](https://github.com/supabase/terraform-provider-supabase/releases)). In the Cloudflare provider, the only hits were Hyperdrive and a Zero Trust CASB integration ([example](https://github.com/cloudflare/terraform-provider-cloudflare/blob/main/internal/services/hyperdrive_config/resource.go)), none of the Worker or DNS resources. Code search can lag, and #312 should confirm this for Supabase.
- A saved plan file holds the full config, the planned values, and the input variables. Sensitive values may be in it as plain text unless plan encryption is on ([plan](https://opentofu.org/docs/cli/commands/plan/)).
- Backend credentials belong in environment variables, not in the backend block or `-backend-config` ([backend configuration](https://opentofu.org/docs/language/settings/backends/configuration/), [pg backend](https://opentofu.org/docs/language/settings/backends/pg/)).

### CI on GitHub Actions

- `tofu plan -out=FILE` saves a plan for `tofu apply FILE`, which applies it without a prompt ([plan](https://opentofu.org/docs/cli/commands/plan/), [apply](https://opentofu.org/docs/cli/commands/apply/)). Applying a saved plan fails with "Saved plan is stale" if the state's serial changed after the plan ([source](https://github.com/opentofu/opentofu/blob/v1.13.1/internal/backend/local/backend_local.go#L393)). A plan made on a PR branch also reflects the branch, not the merged result. So the merge job should plan again and apply that plan. That is my inference from the stale check.
- `-detailed-exitcode` returns 0 for no changes, 1 for an error, and 2 for changes ([plan](https://opentofu.org/docs/cli/commands/plan/)). The same flag works for the import check and for drift.
- OpenTofu locks state for every operation that could write state. `-lock=false` turns that off, and the docs call it dangerous when others may run at the same time ([locking](https://opentofu.org/docs/language/state/locking/), [plan](https://opentofu.org/docs/cli/commands/plan/)). With `use_lockfile`, a lock is an object written to the bucket. So a PR plan with a read-only R2 token works only with `-lock=false`. That is my inference from how the lock works.
- `TF_INPUT=0` makes commands behave as if `-input=false` was passed ([environment variables](https://opentofu.org/docs/cli/config/environment-variables/)). `TF_VAR_name` sets variables from the environment.
- GitHub environments:
  - Environment secrets reach only jobs that name the environment. With required reviewers, a job sees them only after approval.
  - Deployment branch rules can limit an environment to `main`.
  - On GitHub Free, required reviewers, wait timers, and environment secrets work only in public repos. This repo is public, so all of them are available.
  ([deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments))
- Concurrency:
  - A concurrency group allows one running job and, by default, one pending job. A newer pending job replaces an older one.
  - `cancel-in-progress: true` also cancels the running job.
  - `queue: max` keeps up to 100 pending runs in order. It cannot be combined with `cancel-in-progress: true`.
  ([concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency))
  The migrations workflow already uses one group with `cancel-in-progress: false`. A canceled apply leaves the lock and a half-applied change, so an apply should never be canceled. That is my inference.
- Fork PRs get no secrets except `GITHUB_TOKEN` ([events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflows-in-forked-repositories)). A plan on a fork PR cannot reach the backend. This is fine with one owner, and it is a reason not to use `pull_request_target`.
- Viewing run logs and downloading artifacts needs read access and a signed-in GitHub account, including in public repos ([run logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs), [download artifacts](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)). In a public repo any signed-in user has read access, so plan output in logs is public, and so is an uploaded plan file unless plan encryption is on.
- OIDC:
  - Supabase's Management API takes a personal access token or OAuth2 tokens for third-party integrations. Scoped PATs can be limited to chosen organizations, projects, and permissions ([Management API](https://supabase.com/docs/reference/api/introduction)).
  - Cloudflare's GitHub Actions guide uses an account API token stored as a secret ([Workers GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)).
  - I found no Supabase or Cloudflare document about exchanging a GitHub OIDC token, and R2's S3 API uses an access key pair. So CI uses long-lived tokens. #312 and #313 own the narrowest token for each.
- Scheduled workflows, such as a drift check, run only on the default branch. In a public repo GitHub disables them after 60 days with no repository activity ([events, schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)). `apple-web-secret-reminder.yml` already opens an issue on a schedule, and a drift job could follow the same pattern.
- `-refresh-only` plans only update state to match remote objects. They suit accepting a deliberate dashboard change ([plan](https://opentofu.org/docs/cli/commands/plan/)).

### Importing existing resources

- `import` blocks name a remote object (`id`, or `identity` where the resource has an identity schema) and a `to` address. `tofu plan` shows the import, and `apply` writes it to state. After that the block does nothing and can be deleted or kept as a record ([import](https://opentofu.org/docs/language/import/)).
- `tofu plan -generate-config-out=FILE` writes `resource` blocks for imports that have none. The file must not exist yet. The feature is still marked experimental ([generating configuration](https://opentofu.org/docs/language/import/generating-configuration/), [plan](https://opentofu.org/docs/cli/commands/plan/)).
- Generated config writes sensitive and write-only attributes as `null` with a comment such as `# sensitive` ([generating configuration](https://opentofu.org/docs/language/import/generating-configuration/#generated-hints)). If a provider treats `null` as "clear this value", the next plan will try to change it. So give each one a real value from a variable first. That is my inference. #312 should check what `null` means in the Supabase provider.
- Generated config can contain arguments that conflict, and the plan then errors until they are removed ([generating configuration](https://opentofu.org/docs/language/import/generating-configuration/#limitations)).
- A first apply that changes nothing looks like this:
  1. The import plan shows "N to import, 0 to add, 0 to change, 0 to destroy".
  2. Apply it.
  3. Run `tofu plan -detailed-exitcode` again and expect exit 0.
  ([import](https://opentofu.org/docs/language/import/), [plan](https://opentofu.org/docs/cli/commands/plan/))
- `moved` blocks rename or move tracked objects without a destroy, and they can be chained ([refactoring](https://opentofu.org/docs/language/modules/develop/refactoring/)).
- A `removed` block with `lifecycle { destroy = false }` drops an object from state and leaves it running. OpenTofu warns when a `removed` block has no `lifecycle` ([resource syntax](https://opentofu.org/docs/language/resources/syntax/#removing-resources)).
- `prevent_destroy = true` rejects any plan that destroys the object, including a replacement. It stops working once the resource block is deleted ([resource behavior](https://opentofu.org/docs/language/resources/behavior/#lifecycle-customizations)).
- `destroy = false` (v1.12) turns a destroy into "forget". It is stored in state, so OpenTofu keeps the object even after the block is deleted, until the setting is changed back. It takes only a literal `true` or `false`, and with it set, `prevent_destroy` has no effect ([resource behavior](https://opentofu.org/docs/language/resources/behavior/#lifecycle-customizations)). v1.12.8 and the unreleased v1.13.2 fix a crash when `destroy` is given an expression with references ([v1.13 changelog](https://github.com/opentofu/opentofu/blob/v1.13/CHANGELOG.md)).

### Checks at this size

- `tofu fmt -check` exits non-zero when files need formatting. `-recursive` walks subfolders ([fmt](https://opentofu.org/docs/cli/commands/fmt/)).
- `tofu validate` needs an initialized folder. `tofu init -backend=false` gives one without touching the backend ([validate](https://opentofu.org/docs/cli/commands/validate/)). I did not check whether `validate` needs the encryption passphrase.
- `tofu test` reads `*.tftest.hcl` and `*.tofutest.hcl` files. It supports `mock_provider`, `override_resource`, and `run` blocks with `command = plan` ([test](https://opentofu.org/docs/cli/commands/test/)). It can check rules such as "the redirect URLs include the consent page" with no credentials.
- OpenTofu v1.13 has an experimental `-lint` flag on `validate`, `plan`, `apply`, and `refresh`. Its findings are warnings, and the rules may change in minor releases ([linting](https://opentofu.org/docs/language/linting/)).
- TFLint loads only `.tf` and `.tf.json`, so it skips `.tofu` files without a warning. The request to support `.tofu` was closed on 2026-07-23 with a link to the BUSL licence discussion ([tflint#2609](https://github.com/terraform-linters/tflint/issues/2609), [tflint discussion #1826](https://github.com/terraform-linters/tflint/discussions/1826)). The same issue says OpenTofu-only blocks such as `encryption` will not parse against TFLint's Terraform-based schema.
- Trivy parses `.tf` and `.tofu` ([parser.go](https://github.com/aquasecurity/trivy/blob/main/pkg/iac/scanners/terraform/parser/parser.go)). Its misconfiguration checks cover AWS, Azure, CloudStack, DigitalOcean, GitHub, Google, Kubernetes, Nifcloud, OpenStack, and Oracle, not Cloudflare or Supabase ([providers folder](https://github.com/aquasecurity/trivy/tree/main/pkg/iac/providers), [Terraform coverage](https://github.com/aquasecurity/trivy/blob/main/docs/guide/coverage/iac/terraform.md)). Only its secret scan would apply here.

### OpenTofu features that matter here

- State and plan encryption, for the secrets that providers keep in state.
- `destroy = false` on the Supabase project and other resources that must never be deleted.
- `.tofu` files and the `language` block, if the config is meant for OpenTofu only. Tools that read only `.tf` will then skip it (TFLint).
- Variables in backend blocks, so a later second environment can set the state key from a variable ([backend configuration](https://opentofu.org/docs/language/settings/backends/configuration/#variables-and-locals)).
- `for_each` on provider blocks and `-exclude`, which matter less at this size ([provider configuration](https://opentofu.org/docs/language/providers/configuration/), [plan](https://opentofu.org/docs/cli/commands/plan/)).
- I did not check each one against current Terraform. The OpenTofu docs say outright only that Terraform does not read `.tofu` files or the `language` block ([settings](https://opentofu.org/docs/language/settings/)).

## Open questions for the owner

1. Is R2 without versioning acceptable for the state? The options are to accept re-import as the recovery plan, to copy the state somewhere on each apply, or to pick another backend.
2. Is the rare stale R2 lock acceptable? Recovery is a `tofu force-unlock` by hand, using the lock ID from the error.
3. Should PR plans take the lock, which needs an R2 token with write access, or run with `-lock=false` and a read-only token?
4. Should the `production` environment require the owner's approval before apply, or apply on merge with no prompt, the way migrations deploy today?
5. Should the config use `.tofu` files and the `language` block, which ties it to OpenTofu and rules out TFLint, or stay with `.tf`?
6. Dependabot or Renovate for providers? Who bumps `.opentofu-version`?
7. One state for both providers, or one per provider so each CI job holds only one provider's token?
8. Where does the encryption passphrase live besides the GitHub secret, so the owner can still read the state if the secret is lost?
9. Should OpenTofu wait for v1.13.2 before the first apply, given the `tofu init` security fix?
