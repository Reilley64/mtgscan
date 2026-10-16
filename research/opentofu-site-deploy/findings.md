# Deploying the site with OpenTofu instead of Wrangler and Workers Builds

Research for #332, part of #310. Accessed 2026-10-16. Sources are the Cloudflare docs and API reference, the Cloudflare provider source at v5.28.0, Wrangler at 4.151.1, OpenTofu at v1.13.1, and the provider's issue tracker. It builds on the #313 notes in `research/cloudflare-site/findings.md` and does not repeat them.

Tests used OpenTofu v1.13.1 and provider 5.28.0 in a temp dir, with a copy of `apps/site` and a stand-in `consent.js`. The provider's `base_url` pointed at a small local mock of the Cloudflare API that logged every request. No real account or token was used. The mock only shows what the provider sends and plans. It cannot show what the real API accepts.

## Answer

- Yes, the provider can deploy the site, but the switch has costs. The build needs a clean output folder, and the `_headers` file moves into the config. The first apply deploys a new version. Plans show only a hash for an asset change.
- Cloudflare recommends `cloudflare_worker`, `cloudflare_worker_version`, and `cloudflare_workers_deployment` over `cloudflare_workers_script`. For this site, import `cloudflare_worker` and add a `cloudflare_worker_version` with `assets.directory` and no code module. A `cloudflare_workers_deployment` sends traffic to it, or `deploy = true` on the version does the same.
- `cloudflare_workers_script` also accepts an assets-only Worker. But it writes Worker settings that overlap `cloudflare_worker`, and destroying it deletes the Worker.
- The provider never reads `_headers` from the folder. With `cloudflare_worker_version`, the API docs say to send it as a module named `_headers` with type `text/plain`. With `cloudflare_workers_script`, it goes in `assets.config.headers`. `html_handling` is `assets.config.html_handling` in both.
- The provider uploads every file under `assets.directory`. It has no `.assetsignore` support and does not skip `_headers`. The mock test uploaded `.assetsignore`, `_headers`, `package.json`, `tsconfig.json`, `bunfig.toml`, the tests, and the `.ts` sources as public assets. So the build must write a separate output folder that holds only the site.
- The plan sees an asset change. Any changed file changes `asset_manifest_sha256`, which forces a new version and a new deployment. The plan does not say which file changed. A `terraform_data` resource with a map of file hashes can name it.
- Import cannot avoid a new version. After import, state has no `assets.directory` or hash, so the plan replaces the version and the deployment. The first apply uploads and deploys a new version with the same files. This breaks the map's rule that the first apply changes nothing, for the site only. Importing the version and deployment gains nothing, so import only `cloudflare_worker`.
- Once Wrangler no longer deploys, the #313 conflict goes away. `cloudflare_worker` can state today's live values, `workers.dev` and preview URLs on and observability off, and nothing else rewrites them.
- The site loses the Workers Builds deploy on push, Builds preview builds, Worker Previews from `wrangler preview`, and Wrangler's list of changed assets. It keeps Version URLs, dashboard and `wrangler rollback`, and `wrangler dev`, if `wrangler.jsonc` stays for local serving. Then `html_handling` and `compatibility_date` live in two files.
- CI must install Bun and build the site before every plan and apply, from the same commit. At apply, the provider uploads what is on disk and never checks it against the planned hash. The workflow must also run on `apps/site/**` changes. The apply token needs `Workers Scripts Write`, which the Worker settings already need.
- No open provider issue covers asset upload at 5.28.0. Issues to watch are #7099 (`cloudflare_worker` drift on custom domain `references`), #6793 and #7326 (`cloudflare_workers_script` drift), and #7382, which now only matters if someone rolls back between a plan and its apply.

## Findings

### 1. Which resources deploy an assets-only Worker

- The `cloudflare_workers_script` docs open with: "For more direct control over Workers resources, we recommend the beta `cloudflare_worker`, `cloudflare_worker_version`, and `cloudflare_workers_deployment` resources." Source: [workers_script docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_script.md).
- Cloudflare's IaC page shows the same three resources, with a code module. It notes that versions are immutable and append-only, so each change creates a new version and keeps the old one. Source: [Infrastructure as Code](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/).
- `cloudflare_worker_version` works with assets and no code. The provider's acceptance test `TestAccCloudflareWorkerVersion_WithAssets` creates a version with only `assets = { directory = ... }`, and the API marks `main_module` optional. Sources: [worker_version testdata/assets.tf](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/testdata/assets.tf), [resource_test.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/resource_test.go), [Create Worker Version API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/create/).
- Every `cloudflare_worker_version` attribute that matters forces replacement. `assets` has `RequiresReplaceIfConfigured`, and `asset_manifest_sha256` has `RequiresReplace`. `Delete` is empty, so old versions stay. Sources: [worker_version schema.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/schema.go), [worker_version resource.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/resource.go).
- `deploy = true` on the version asks the API to create a deployment at 100% in the same call. Then no `cloudflare_workers_deployment` is needed. Sources: [worker_version docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/worker_version.md), [Create Worker Version API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/create/).
- `cloudflare_workers_deployment` has no update. A new `versions` list forces replacement, and `Delete` is empty. Sources: [workers_deployment schema.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/workers_deployment/schema.go), [workers_deployment resource.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/workers_deployment/resource.go).
- `cloudflare_worker_version` takes `worker_id`, which is "ID or name". So the version can name `mtgscan` without referencing the `cloudflare_worker` resource. Source: [worker_version docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/worker_version.md).
- `cloudflare_workers_script` accepts `assets` with no `content`. Its config validator needs one of `content`, `content_file`, or `assets`. An asset change is an in-place update that `PUT`s the whole script, which creates a version and deployment. Its `Delete` deletes the Worker, and a new `script_name` forces replacement. Sources: [workers_script schema.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/workers_script/schema.go), [workers_script resource.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/workers_script/resource.go), [IaC, multipart upload API](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/#multipartform-data-upload-api).
- `cloudflare_workers_script` also sets `logpush`, `observability`, `tags`, and `tail_consumers`, which `cloudflare_worker` also owns. Source: [workers_script docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_script.md). So using it next to `cloudflare_worker` gives two owners for those settings (inference).

### 2. `assets.config` and `_headers`

- `cloudflare_worker_version` `assets.config` has `base_path`, `html_handling`, `not_found_handling`, and `run_worker_first`. It has no headers field. The schema says: "`_headers` and `_redirects` files should be included as modules named `_headers` and `_redirects` with content type `text/plain`." The API reference says the same. Sources: [worker_version docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/worker_version.md), [Create Worker Version API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/create/).
- `cloudflare_workers_script` `assets.config` has `headers` and `redirects` strings, "the contents of a _headers file". Source: [workers_script docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_script.md).
- Neither resource reads `_headers` from `assets.directory`. A code search of `internal/` and `docs/` at v5.28.0 finds `_headers` only in schema descriptions. No code reads `_headers`, `_redirects`, or `.assetsignore`. Source: [provider tree at v5.28.0](https://github.com/cloudflare/terraform-provider-cloudflare/tree/v5.28.0/internal/services).
- Wrangler reads `_headers` and `_redirects` from the assets folder and sends their text in the assets config. For an assets-only Worker, the upload metadata holds only the asset token, that config, and the compatibility date. Sources: [deploy-helpers assets.ts](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/deploy-helpers/src/deploy/helpers/assets.ts), [create-worker-upload-form.ts](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/deploy-helpers/src/deploy/helpers/create-worker-upload-form.ts).
- Cloudflare's docs say `_headers` "will not itself be served as a static asset". Source: [Headers](https://developers.cloudflare.com/workers/static-assets/headers/). That holds for Wrangler, which excludes it. The provider uploads it as a normal file (section 3), so it would be served at `/_headers` unless the output folder leaves it out (inference).
- A plan with `cloudflare_workers_script` and `headers = file(".../_headers")` prints the whole file as a heredoc, so a CSP change is readable. With a `_headers` module on `cloudflare_worker_version`, the plan shows only its `content_sha256`. Both from a local `tofu plan`.
- Whether the API accepts a version whose only module is `_headers`, with no `main_module`, was not tested. The docs suggest it, but no example shows it.

### 3. How the provider uploads and hashes assets

From [worker_version assets.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/assets.go) (the `workers_script` copy is the same):

- `getAssetManifest` walks every file under `assets.directory` with `filepath.WalkDir`. Each entry is the SHA-256 of the raw file, cut to 32 hex characters, plus its size. Nothing is skipped.
- A plan modifier computes `asset_manifest_sha256`, the SHA-256 of the JSON manifest, at plan time. It reads local files only, so a plan for a new version made no API calls in the test.
- On apply, `handleAssets` builds the manifest again from disk, opens an upload session, and uploads the buckets the API asks for. It does not compare the new manifest with the planned hash.
- The `Content-Type` of each file comes from Go's `mime.TypeByExtension`, which on Unix also reads the system's MIME files. Source: [Go mime package](https://pkg.go.dev/mime#TypeByExtension). In the Mac test, `.html`, `.css`, `.js`, `.svg`, and `.png` got the expected types, and `.ts` got `video/mp2t`.

Wrangler differs. Sources: [workers-shared helpers.ts](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/workers-shared/utils/helpers.ts), [deploy-helpers assets.ts](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/deploy-helpers/src/deploy/helpers/assets.ts), [hash.ts](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/deploy-helpers/src/deploy/helpers/hash.ts).

- It always ignores `/.assetsignore`, `/_headers`, and `/_redirects`, plus the patterns in `.assetsignore`.
- It skips symlinks and directories, and rejects files over the size limit.
- It hashes BLAKE3 of the base64 content plus the extension.

What the mock test showed:

- The upload session listed all 39 files in the copied `apps/site`, including `.assetsignore`, `_headers`, `bunfig.toml`, `package.json`, `tsconfig.json`, `oauth/consent/*.ts`, and `test/*`. The version request held only the token, `compatibility_date`, and an `assets.config` with `base_path` and `html_handling`.
- A symlink as `assets.directory` failed the plan with "Error reading asset files ... is a directory". `WalkDir` does not follow it.

So the build must write a folder that holds only the files to serve, such as `apps/site/dist` (inference). `.assetsignore` then has no job for OpenTofu, but `wrangler dev` could still use it.

The first apply likely uploads every file again, because the provider's hashes differ from Wrangler's. The direct upload docs say unchanged files are skipped only when they "have recently been uploaded". Source: [Direct upload](https://developers.cloudflare.com/workers/static-assets/direct-upload/). This is inference. For a site this size it costs little.

### 4. What a plan shows for an asset change

- After one apply against the mock, a second plan with no change said "No changes".
- After one line changed in `index.html`, the plan replaced both resources. The only asset line was `asset_manifest_sha256 = "8014..." -> "d124..." # forces replacement`, and the deployment's `version_id` became unknown. It named no file. "Plan: 2 to add, 0 to change, 2 to destroy." The two destroys do nothing, because both `Delete` methods are empty.
- A `terraform_data` resource with `input = { for f in fileset(dir, "**") : f => filesha256("${dir}/${f}") }` shows the changed file by name in the same plan. Its `output` also lists every file as removed, which adds noise. Sources: local test, [OpenTofu fileset](https://github.com/opentofu/opentofu/blob/v1.13.1/website/docs/language/functions/fileset.mdx).
- Wrangler prints each changed asset during a deploy, up to a limit. Source: [deploy-helpers assets.ts, `logAssetUpload`](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/deploy-helpers/src/deploy/helpers/assets.ts).
- `annotations` (`workers_message`, `workers_tag`) force replacement when they change. Setting them to the commit SHA would make a new version on every merge, even with no site change (inference). Source: [worker_version schema.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/schema.go).

### 5. Importing today's Worker, version, and deployment

- `cloudflare_worker_version` imports as `<account_id>/<worker_id>/<version_id>`. `ImportState` reads the version from the API and fills modules, but never sets `assets.directory` or `asset_manifest_sha256`. The provider's own import test ignores `assets.directory`, `assets.asset_manifest_sha256`, and `assets.config`, with the comment "FIXME: handle refreshing assets.config". Sources: [worker_version resource.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/resource.go), [resource_test.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/resource_test.go).
- Cloudflare's IaC page describes a clean import only for `content_file` modules whose content matches. It says nothing about assets. Source: [IaC, Import Behavior](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/#import-behavior).
- In the mock test, import blocks for the version and deployment planned "2 to import, 2 to add, 2 to destroy". `assets` showed `+ directory` and `+ asset_manifest_sha256 ... # forces replacement`, with "Warning: this will destroy the imported resource". The mock version had the same `html_handling` and compatibility date as the config.
- `cloudflare_workers_deployment` imports as `<account_id>/<script_name>/<deployment_id>`. It is replaced as soon as the version is. Source: [workers_deployment docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/workers_deployment.md).
- `cloudflare_workers_script` keeps `assets` from state on refresh, and import leaves it empty. So a config with `assets.directory` plans an in-place update that uploads the script again (inference from [workers_script resource.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/workers_script/resource.go)). Issue #6793 also reports import drift for this resource.
- So the first apply must upload and deploy a new version with the same content. Only `cloudflare_worker` and the custom domain can import with no change. The #310 notes ask for a first apply that changes nothing. For the site, that needs an exception from the owner, or a first apply that the owner treats as a normal deploy (inference).

### 6. `cloudflare_worker` once Wrangler stops deploying

- #313 found that each `wrangler deploy` rewrites `workers.dev`, observability, logpush, tags, and tail consumers. That is why it chose `ignore_changes = all` or no `cloudflare_worker`. Without Workers Builds and `wrangler deploy`, nothing else writes these settings (inference).
- The #314 inventory found `workers.dev` on, preview URLs on, and logpush and observability off. `cloudflare_worker` defaults `subdomain` to off, so the config must say `subdomain = { enabled = true, previews_enabled = true }` to match. Source: [worker schema.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker/schema.go).
- At 5.28.0, `cloudflare_worker` has a `ModifyPlan` that compares only the settable `subdomain` and `observability` fields, and `UseStateForUnknown` on the observability `destinations` lists. These target the drift in #7099. Whether #7099 is fixed was not tested. Sources: [worker resource.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker/resource.go), [worker schema.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker/schema.go).

### 7. What the site loses and keeps

Loses:

- Deploy on push. Workers Builds runs the build and `npx wrangler deploy` on each push to the production branch. Disconnecting is a dashboard step: Settings, Builds, Disconnect. Sources: [Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
- Preview builds and Worker Previews. Builds runs `npx wrangler preview` for other branches when preview builds are on. Previews need `wrangler preview` from Wrangler 4.135.0 or later, and they read the `previews` block of the Wrangler config. The provider only has `previews_base_config` on `cloudflare_worker`. Sources: [Build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/), [Previews](https://developers.cloudflare.com/workers/previews/), [worker docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/worker.md). A GitHub Actions job could still run `wrangler preview`, but then Wrangler still deploys something. Source: [Previews examples](https://developers.cloudflare.com/workers/previews/examples/).
- Wrangler's handling of `.assetsignore` and `_headers`, and its list of changed assets (sections 2 to 4).

Keeps:

- Version URLs. The Worker has them because preview URLs are on. `cloudflare_worker_version` has a computed `urls`, "All routable URLs that always point to this version", so API versions seem to get them too. That is inference, because the docs list only Wrangler and dashboard edits as making versions with URLs. Sources: [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/), [worker_version docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/worker_version.md).
- Rollbacks. The dashboard and `wrangler rollback` create a new deployment of an older version, for the 100 most recent versions. Source: [Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/). The deployment resource reads its own deployment by ID, which a rollback does not change. So OpenTofu would not see a rollback, and the next asset change would deploy over it (inference from [workers_deployment resource.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/workers_deployment/resource.go)). To roll back through OpenTofu, revert the commit. That makes a new version, not the old one.
- `wrangler dev`. It needs only `wrangler.jsonc`, not the deploy path. If `wrangler.jsonc` stays for local serving and points at the same output folder, it repeats `html_handling` and `compatibility_date` from the OpenTofu config. `_headers` could stay one file if OpenTofu reads it with `file()` (inference). The README runs `bunx wrangler dev` at the repo root.
- A hand-run `wrangler deploy` would still work and would rewrite Worker settings again, as #313 describes.

### 8. What CI needs

- CI must run a Bun install, `bun run --filter @mtgscan/site build`, and the step that fills the output folder before every plan and every apply. The plan hashes local files, and the apply uploads local files (section 3). Without the build, `consent.js` is missing. The plan would show a replacement, and the apply would deploy a site without the consent script (inference).
- The apply job must build the same commit that the plan used. The provider stores the planned hash in state but uploads whatever is on disk. Any difference shows up only as drift in the next plan (inference from [worker_version resource.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/resource.go) and [assets.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/assets.go)).
- The #316 path filter runs the plan only on `infra/**`. Site changes must also trigger the plan and apply, so the filter needs `apps/site/**` and the workspace files (inference).
- The provider resolves `assets.directory` against its working directory with `filepath.Abs`. With `tofu -chdir=infra`, `"${path.module}/../apps/site/dist"` gives the same relative path on the Mac and in CI. Sources: [assets.go](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/internal/services/worker_version/assets.go), [OpenTofu references, path.module](https://github.com/opentofu/opentofu/blob/v1.13.1/website/docs/language/expressions/references.mdx).
- Token permissions. Create Worker Assets Upload Session accepts only `Workers Scripts Write`. Create Worker Version accepts `Workers Scripts Write` or Workers Admin or Editor roles. The provider docs for the version and deployment list Workers Scripts Read, Workers Scripts Write, and Workers Tail Read. #313 already needs `Workers Scripts Write` for `cloudflare_worker`, so the apply token needs nothing new. A read-only PR plan needs only read access (inference). Sources: [Create Worker Assets Upload Session API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/assets/subresources/upload/methods/create/), [Create Worker Version API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/create/), [worker_version docs](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/docs/resources/worker_version.md).
- The Builds user token and the `BUN_VERSION` build variable go away once Builds is disconnected. CI pins Bun instead.

### 9. Provider issues

I searched open and closed issues for assets, `worker_version`, `workers_deployment`, `workers_script`, and `_headers`.

Open, relevant here:

- [#7099](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7099): `cloudflare_worker` shows drift on every plan on `references.domains[].certificate_id`, observability `destinations`, and `updated_on`. `ignore_changes` cannot hide computed-only attributes. The site has a custom domain, so `references.domains` applies. Reported on 5.19.1. Section 6 notes code at 5.28.0 that targets it.
- [#6793](https://github.com/cloudflare/terraform-provider-cloudflare/issues/6793): `cloudflare_workers_script` cannot import without an in-place update. Only matters if the site uses that resource.
- [#7382](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7382): apply of a saved plan fails on `deployed_on` if a deploy lands between plan and apply. With OpenTofu deploying, only a hand rollback or `wrangler deploy` in that window would cause it (inference).
- [#6924](https://github.com/cloudflare/terraform-provider-cloudflare/issues/6924): no way to connect Workers Builds to Git from the provider. A comment says the Builds API returns 401 for account tokens. Not needed if Builds goes away.

Open, not relevant here:

- [#7416](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7416): `cloudflare_worker_version` refresh fails with a conversion error on `exports` from 5.26.0. The site sets no `exports`.
- [#7206](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7206), [#7273](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7273), [#7380](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7380): placement on `cloudflare_worker_version`. [#7281](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7281), [#7414](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7414), [#7363](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7363), [#7370](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7370): bindings. The site has no placement or bindings.

Closed:

- [#7326](https://github.com/cloudflare/terraform-provider-cloudflare/issues/7326): `cloudflare_workers_script` with `assets` plans an in-place update on every plan on 5.23.0, and an apply failed on `startup_time_ms`. The reporter closed it the same day as not planned, with no fix.
- [#6714](https://github.com/cloudflare/terraform-provider-cloudflare/issues/6714): an `asset_manifest_sha256` error on `cloudflare_worker_version` with `assets.config` and no directory. Fixed in 5.18.0.
- [#6153](https://github.com/cloudflare/terraform-provider-cloudflare/issues/6153): `assets.jwt` was write-only and failed on OpenTofu 1.10. It is no longer write-only.
- [#5616](https://github.com/cloudflare/terraform-provider-cloudflare/issues/5616): `cloudflare_workers_script` could not deploy assets before `assets.directory` existed. The `assets.directory` upload came in [#6160](https://github.com/cloudflare/terraform-provider-cloudflare/pull/6160). Source: [CHANGELOG](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.28.0/CHANGELOG.md).

## Open questions for the owner

- Should OpenTofu deploy the site at all, given the costs above? The other choice is to keep `wrangler deploy`, run from GitHub Actions instead of Workers Builds, next to OpenTofu as #313 planned.
- If OpenTofu deploys, is a first apply that uploads and deploys a new version (same files) an accepted exception to "the first apply changes nothing"?
- `cloudflare_worker_version` with a `_headers` module, or `cloudflare_workers_script` with `assets.config.headers`? The first is Cloudflare's recommendation and keeps `cloudflare_worker` as the only owner of settings. The second shows CSP changes as text in the plan, but overlaps `cloudflare_worker` and has open drift reports.
- Where does the build output go, for example `apps/site/dist`, and which step copies files into it? Does `.assetsignore` go away?
- Does `wrangler.jsonc` stay for `bunx wrangler dev`? If so, `html_handling` and `compatibility_date` live in two files. Should OpenTofu read `_headers` with `file()` so the CSP stays in one place?
- Does the site use Workers Builds preview builds today? If so, is losing them acceptable, or should a separate job run `wrangler preview`?
- Should plans include a `terraform_data` file map so reviewers can see which site files changed?
- Should site deploys wait for the same `production` approval as other applies (#320)? Today a merge deploys the site with no gate.
