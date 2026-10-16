# How OpenTofu and Workers Builds share the Cloudflare site

Research for #313, part of #310. Accessed 2026-10-16. Sources are the Cloudflare docs, the source of the Cloudflare provider at v5.28.0, Wrangler at 4.151.1, OpenTofu at v1.13.1, and the provider's issue tracker. Nothing here was checked against the live account, because Wrangler is logged out. The inventory ticket (#314) owns what exists today.

## Answer

- Pin the Cloudflare provider to an exact version, today `5.28.0`. Cloudflare ships breaking changes in v5 minor releases.
- OpenTofu should use only `cloudflare_worker` and `cloudflare_workers_custom_domain` for this site, plus `cloudflare_dns_record` for any extra records under `mtgscan.reilley.dev`. It should not use `cloudflare_worker_version`, `cloudflare_workers_deployment`, or `cloudflare_workers_script`, because they upload or deploy code. Cloudflare's IaC page says you can manage only `cloudflare_worker` and leave versions and deployments to Wrangler.
- Every Workers Builds deploy runs `wrangler deploy`. It sends the Worker's observability, logpush, tail consumers, tags, and `workers.dev` setting. When `wrangler.jsonc` lacks a value, Wrangler sends its own default or leaves the field out. Apart from `previews_base_config`, these are all the settings `cloudflare_worker` has. So OpenTofu and Wrangler both write the same Worker settings unless one of them stops.
- With today's `wrangler.jsonc`, each deploy turns `workers.dev` on and turns observability off. A plain `cloudflare_worker` block defaults `workers.dev` to off. That diff would never settle.
- Two setups avoid the overlap. (A) OpenTofu imports the Worker with `lifecycle { ignore_changes = all }` and `prevent_destroy`, so it only guards the Worker's existence, and `wrangler.jsonc` owns its settings. (B) OpenTofu leaves the Worker out, and the custom domain names the Worker. In both, the plan never updates the Worker, which also avoids provider issue #7382. Copying the same values into both files also works, but then two files own one setting. The decision belongs to #319.
- `wrangler.jsonc` must keep no `route` or `routes` key. With routes, `wrangler deploy` replaces all routes and custom domains on the Worker, which would undo OpenTofu's custom domain.
- The custom domain creates its own DNS record and an edge certificate. Do not declare a `cloudflare_dns_record` for `mtgscan.reilley.dev` itself. Only extra records under that name, if any exist, belong in OpenTofu.
- The provider has no Workers Builds resource. The Builds REST API can set the Git connection, the build and deploy commands, branch filters, and build variables such as `BUN_VERSION`. It accepts only user tokens, not account tokens.
- An account API token works for the Worker, the custom domain, DNS, and R2. A token can be limited to the `reilley.dev` zone but not to single records in it. Cloudflare documents no OIDC exchange for GitHub Actions, so CI needs a stored token.
- R2 works as an `s3` backend with `use_lockfile = true`. R2 evaluates `If-None-Match: *` on `PutObject` atomically, which is what the lock file needs. R2 has no bucket versioning, so a bad state write has no built-in undo.
- An R2 token with "Object Read & Write" can be scoped to the one state bucket. Create the bucket by hand or with `wrangler r2 bucket create` before the first `tofu init`.
- Import with `import` blocks and `tofu plan -generate-config-out`. `cf-terraforming` exports every record in the zone, including other projects' records, and its tables do not list `cloudflare_worker`.

## Findings

### 1. Provider version and release policy

- The latest release is v5.28.0, published 2026-10-13. The OpenTofu registry also serves 5.28.0. Sources: [releases](https://github.com/cloudflare/terraform-provider-cloudflare/releases/tag/v5.28.0), [OpenTofu registry versions](https://registry.opentofu.org/v1/providers/cloudflare/cloudflare/versions).
- The README says the provider "generally follows SemVer conventions, though certain backwards-incompatible changes may be released as minor versions". Source: [README, Semantic versioning](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/README.md#semantic-versioning).
- Minor releases 5.22.0, 5.24.0, 5.27.0, and 5.28.0 each have a "BREAKING CHANGES" section. 5.27.0 removed `observability.redact_query_string` from `cloudflare_worker`. Source: [CHANGELOG](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/CHANGELOG.md).
- So a constraint like `~> 5.28` can pull in breaking changes. An exact pin plus the lock file avoids that.

### 2. Which Worker resources to use

- Cloudflare's IaC page shows `cloudflare_worker`, `cloudflare_worker_version`, and `cloudflare_workers_deployment`, then says "you do not have to manage all of these resources in Terraform. For example, you could use just the `cloudflare_worker` resource and seamlessly use Wrangler or your own deployment tools for Versions or Deployments." Source: [Infrastructure as Code](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/).
- `cloudflare_worker_version` creates a new version on each change and never deletes old ones. `cloudflare_workers_deployment` points traffic at versions. `cloudflare_workers_script` uploads the code and settings in one resource. Each would replace or redeploy the code that Workers Builds deployed. Sources: [IaC, Considerations with Worker Versions](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/#considerations-with-worker-versions), [workers_deployment docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_deployment.md), [workers_script docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_script.md).
- `cloudflare_worker` has these settings: `logpush`, `observability`, `previews_base_config`, `subdomain` (`workers.dev` and preview URLs), `tags`, and `tail_consumers`. Source: [worker docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/worker.md).
- In the schema, omitted settings get static defaults. `subdomain` defaults to `enabled = false`, `previews_enabled = false`. `observability.enabled` and `logpush` default to `false`. `tags` defaults to an empty set. Source: [worker schema.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker/schema.go).
- Updates send the whole Worker object with `PUT` through the beta Workers API. Source: [worker resource.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker/resource.go).
- `cloudflare_workers_custom_domain` takes the Worker by name (`service`), so it does not need a `cloudflare_worker` resource. Changing `hostname` or `service` forces replacement. Sources: [workers_custom_domain docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_custom_domain.md), [workers_custom_domain schema.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/workers_custom_domain/schema.go).
- `cloudflare_workers_route` is for route patterns such as `example.com/*`. The site only needs it if the inventory finds a route. Source: [workers_route docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_route.md).

### 3. What every Workers Builds deploy writes

Workers Builds runs the deploy command, by default `npx wrangler deploy`, on each push to the production branch. Source: [Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

The site is assets only, so Wrangler uses a generated no-op module and takes the versions and deployments path for an existing Worker. Sources: [resolve-entry.ts](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/wrangler/src/deployment-bundle/resolve-entry.ts), [deploy.ts](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/deploy-helpers/src/deploy/deploy.ts).

On that path, each deploy does the following. Source: [deploy.ts](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/deploy-helpers/src/deploy/deploy.ts).

1. It uploads a new version and deploys it to 100%.
2. It patches the Worker's settings with `tail_consumers`, `logpush`, `tags`, and `observability`. When `wrangler.jsonc` has no `observability`, Wrangler sends `{ enabled: false }`. The code comment says this "will remove observability if it has been removed from their Wrangler configuration file". It keeps existing tags except service and environment tags.
3. It posts the `workers.dev` setting. With no `workers_dev` key, the value is `true` when the config has no routes. With no `preview_urls` key, Wrangler leaves the default to the API. Source: [triggers/deploy.ts, `getSubdomainValues`](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/deploy-helpers/src/triggers/deploy.ts).
4. It publishes routes and custom domains only when the config lists them. Routes go through a `PUT` that "will delete previous routes on this script". Custom domains go through a changeset with `replace_state=true`. Source: [publish-routes.ts](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/deploy-helpers/src/triggers/publish-routes.ts).

The Wrangler docs say the same about routes: "To manage routes via the Cloudflare dashboard only, remove any route and routes keys from your Wrangler configuration file. Then add `workers_dev = false`." They also recommend treating the Wrangler file as the source of truth for Worker configuration. Source: [Wrangler configuration, Source of truth](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth).

Today's `wrangler.jsonc` sets only `name`, `compatibility_date`, `build`, and `assets`. So each deploy sets `workers.dev` on and observability off, and leaves custom domains alone.

What this means for `cloudflare_worker`:

- Without `ignore_changes`, OpenTofu's defaults (`workers.dev` off) and Wrangler's defaults (`workers.dev` on) disagree. Each apply and each deploy would undo the other.
- Matching values in both files works only while two files agree on the same setting.
- `lifecycle { ignore_changes = all }` lets OpenTofu create and destroy the object but never propose updates. Source: [OpenTofu resource behavior, ignore_changes](https://github.com/opentofu/opentofu/blob/v1.13.1/website/docs/language/resources/behavior.mdx).
- If the Worker is left out of OpenTofu, Workers Builds creates it on a first deploy, as it does today.

### 4. Custom domain and routes

- A custom domain points every path of a hostname at the Worker. "Cloudflare will create DNS records and issue necessary certificates on your behalf." Source: [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
- Creating one also creates an Advanced Certificate. Deleting the custom domain does not delete that certificate. Source: same page, Certificates.
- You cannot create a custom domain on a hostname that already has a CNAME record. Source: same page.
- The attach API (`PUT /accounts/{account_id}/workers/domains`) lists only `Workers Scripts Write` as its permission. It also has `enabled` and `previews_enabled` fields that the provider schema at 5.28.0 does not expose. Sources: [Attach Worker Domain](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/), [workers_custom_domain schema.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/workers_custom_domain/schema.go).
- Because a replacement deletes and re-creates the domain, a `prevent_destroy` lifecycle on the custom domain guards against an outage from a typo in `hostname` or `service`.

### 5. DNS records in the shared zone

- `cloudflare_dns_record` manages one record each, by ID. OpenTofu only touches records it has in state, so other projects' records in `reilley.dev` stay outside. Source: [dns_record docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/dns_record.md).
- The record that the custom domain creates belongs to the custom domain. The docs do not say how the DNS records API shows that record. Cloudflare community threads describe these as read-only records in the dashboard that block edits. That is not a primary source. Source: [community thread](https://community.cloudflare.com/t/read-only-dns-records-remain-after-failed-cloudflare-worker-route-domain-setup/940217).
- So OpenTofu should not declare a record for `mtgscan.reilley.dev` itself. The inventory should list every record named `mtgscan.reilley.dev` or below it, to find any extra ones such as TXT or CAA records.
- A token can be limited to the `reilley.dev` zone. The docs describe account and zone resources only, so `DNS Edit` cannot be narrowed to one record. "Granting `Zone DNS Read` access to a zone `example.com` will allow the token to read DNS records only for that specific zone." Source: [Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).

### 6. Workers Builds settings

- The provider at 5.28.0 has no resource for Workers Builds. No file in `docs/resources` or `internal/services` names builds or triggers. Source: [docs/resources at v5.28.0](https://github.com/cloudflare/terraform-provider-cloudflare/tree/v5.28.0/docs/resources).
- The Builds REST API manages it. A trigger holds `build_command`, `deploy_command`, `root_directory`, branch and path filters, `build_caching_enabled`, and `environment_variables`. `PUT /builds/repos/connections` creates the repo connection, once the owner has installed the Cloudflare GitHub App in the dashboard. `PATCH /builds/triggers/{uuid}/environment_variables` sets build variables, one trigger at a time. Source: [Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/).
- "The Builds API requires a user-scoped API token. Account-scoped tokens are not supported and will return 'Invalid token' errors." The permission is `Workers Builds Configuration` Edit. Source: same page.
- The build token that Workers Builds uses to deploy is also a user token today: "Currently, only user tokens are supported, with account-owned token support coming soon." Its default permissions include Workers Scripts Edit and Workers Routes Edit for all zones. Source: [Builds configuration, API token](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token).
- The build image defaults Bun to 1.2.15 and reads `BUN_VERSION`. Unlike Node.js, Bun has no version file option. Source: [Build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

### 7. API tokens and GitHub Actions

- Account API tokens act as a service principal and keep working after the creator leaves. Cloudflare suggests them for CI/CD. The compatibility table marks DNS, R2, SSL/TLS, Workers, and Zone/Domain Management as supported. Workers Builds is not in the table. Source: [Account API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/).
- Permissions per resource, from the provider docs:
  - `cloudflare_worker`: Workers Scripts Read or Write, Workers Tail Read ([docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/worker.md)).
  - `cloudflare_workers_custom_domain`: Workers Scripts Read or Write ([docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_custom_domain.md)).
  - `cloudflare_workers_route`: Workers Routes Read or Write ([docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_route.md)).
  - `cloudflare_dns_record`: DNS Read or Write ([docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/dns_record.md)).
- The provider reads the token from `CLOUDFLARE_API_TOKEN`. Source: [provider docs index](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/index.md).
- Cloudflare's GitHub Actions guide stores `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets. It does not mention OIDC, and no Cloudflare doc found describes exchanging a GitHub OIDC token for a Cloudflare token. Source: [GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
- Creating Cloudflare tokens with OpenTofu puts the token in state. `cloudflare_account_token` has a sensitive `value` attribute and no write-only form. Source: [account_token docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/account_token.md).

### 8. R2 as the state backend

- R2's S3 region is `auto`. "An empty value and `us-east-1` will alias to the `auto` region." The endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Sources: [S3 API compatibility, Bucket region](https://developers.cloudflare.com/r2/api/s3/api/#bucket-region), [R2 Authentication](https://developers.cloudflare.com/r2/api/tokens/).
- OpenTofu's lock file is a `PutObject` of `<key>.tflock` with `IfNoneMatch: "*"`. Source: [s3 client.go](https://github.com/opentofu/opentofu/blob/v1.13.1/internal/backend/remote-state/s3/client.go).
- R2 evaluates `If-Match` and `If-None-Match` on `PutObject` atomically. With concurrent `If-None-Match: *` writes to a missing key, "at most one request succeeds and every other request fails with a 412 PreconditionFailed error". Source: [R2 consistency, Conditional writes](https://developers.cloudflare.com/r2/reference/consistency/#conditional-writes).
- The OpenTofu `s3` backend options for a non-AWS endpoint are `endpoints.s3`, `use_path_style`, `skip_credentials_validation`, `skip_region_validation`, `skip_requesting_account_id`, `skip_metadata_api_check`, and `skip_s3_checksum`. The docs say `skip_s3_checksum` is "useful for non AWS S3 APIs which do not support checksum validation". R2's docs do not say whether R2 needs it. Source: [OpenTofu s3 backend](https://github.com/opentofu/opentofu/blob/v1.13.1/website/docs/language/settings/backends/s3.mdx).
- A working R2 config in an OpenTofu bug report sets all of the above with `region = "auto"` and `use_lockfile = true`. Source: [opentofu#4405](https://github.com/opentofu/opentofu/issues/4405).
- That report also shows a failure mode. A lock `PUT` whose response was lost got retried, hit its own lock with 412, and left an orphaned `.tflock` that blocked later runs until someone deleted it. The maintainers closed it as not an OpenTofu bug. It happened once in 34 scheduled runs. Source: same issue.
- R2 does not implement `GetBucketVersioning` or `PutBucketVersioning`. OpenTofu "highly recommends" bucket versioning for recovery. So R2 gives no rollback of a bad state write. Sources: [S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [OpenTofu s3 backend](https://github.com/opentofu/opentofu/blob/v1.13.1/website/docs/language/settings/backends/s3.mdx).
- R2 tokens come as account or user tokens. "Object Read & Write" and "Object Read only" can be scoped to a set of buckets, and they work only with the S3 API. The token gives an Access Key ID and Secret Access Key. Source: [R2 Authentication](https://developers.cloudflare.com/r2/api/tokens/).
- Create the bucket in the dashboard or with `wrangler r2 bucket create <name>`. Only the Admin permissions can create buckets, so a bucket-scoped object token needs the bucket to exist first. Sources: [Create new buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/), [R2 Authentication, Permissions](https://developers.cloudflare.com/r2/api/tokens/#permissions).

### 9. Importing today's resources

- OpenTofu 1.13 supports `import` blocks and `tofu plan -generate-config-out=<new file>`. The docs mark config generation as experimental. Sources: [Import](https://github.com/opentofu/opentofu/blob/v1.13.1/website/docs/language/import/index.mdx), [Generating configuration](https://github.com/opentofu/opentofu/blob/v1.13.1/website/docs/language/import/generating-configuration.mdx).
- Import IDs:
  - `cloudflare_worker`: `<account_id>/<worker_id>` ([docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/worker.md)).
  - `cloudflare_workers_custom_domain`: `<account_id>/<domain_id>` ([docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_custom_domain.md)).
  - `cloudflare_workers_route`: `<zone_id>/<route_id>` ([docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_route.md)).
  - `cloudflare_dns_record`: `<zone_id>/<dns_record_id>` ([docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/dns_record.md)).
- `cf-terraforming` v0.29.0 generates v5 config and accepts `--terraform-binary-path` for `tofu`. Its generate table lists `cloudflare_dns_record` and `cloudflare_workers_custom_domain`, but not `cloudflare_worker` or `cloudflare_workers_route`. "Any resources not listed may have known issues." It generates DNS records per zone, so it would export other projects' records too. Source: [cf-terraforming README](https://github.com/cloudflare/cf-terraforming/blob/master/README.md).
- Because of the schema defaults in section 2, a `cloudflare_worker` import plans no change only if the config matches every live setting, or uses `ignore_changes = all`.

### 10. Known v5 issues for these resources

Open:

- [#7382](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7382): applying a saved plan that updates `cloudflare_worker` fails with "inconsistent result after apply" on `deployed_on` if Wrangler deployed in between. The reporter hit it in CI, where one job manages infrastructure and another deploys the Worker code. Here, Workers Builds and the apply both run on merge to `main`.
- [#7155](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7155): non-default `observability` values on `cloudflare_worker` never persist, so the plan never settles. Reported on 5.19.1.
- [#7211](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7211): apply fails with error 100342 about `propagation_policy`. One comment reproduces it on a fresh import with 5.21.1. Not checked on 5.28.0.
- [#7286](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7286): a CNAME `content` with a trailing dot never settles. Confirmed on 5.27.x.
- [#7396](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7396): records managed by Email Routing fail to update after 5.26.0. Only matters if a managed record is an Email Routing record.

Fixed:

- [#6907](https://github.com/cloudflare/terraform-provider-cloudflare/issues/6907): `cloudflare_workers_custom_domain` replaced itself on every plan over the deprecated `environment` field. Fixed in 5.23.0.
- [#7387](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7387): `cloudflare_dns_record` failed on `modified_on` after 5.26.0 added `include_shadow_metadata`. The 5.28.0 changelog lists the fix, and a commenter confirms it.
- [#6490](https://github.com/cloudflare/terraform-provider-cloudflare/issues/6490): `cloudflare_workers_custom_domain` returned 500 on create. Fixed in 5.17.

## Open questions for the owner

- Should OpenTofu hold the Worker with `ignore_changes = all` (option A), or leave it out and only reference it by name (option B)? Either way, `wrangler.jsonc` owns the Worker's settings. This is #319.
- Should `wrangler.jsonc` state `workers_dev`, `preview_urls`, and `observability` explicitly? Today the values come from Wrangler defaults, and Wrangler prints a warning when a deploy changes them. Setting them to today's live values changes nothing.
- Should the Workers Builds settings (Git connection, commands, `BUN_VERSION`) stay as documented dashboard settings, or be checked by a script against the Builds API? That needs a user token, which the CI token cannot be.
- Is the lack of R2 bucket versioning acceptable for state? If not, the state ticket (#315) needs a backup step or a different backend.
- Should PR plans take the state lock? With a lock, the PR job needs write access to the state bucket. With `-lock=false`, it can use a read-only R2 token.
- How should the custom domain's certificate be handled if the domain is ever replaced? Cloudflare does not delete it.
