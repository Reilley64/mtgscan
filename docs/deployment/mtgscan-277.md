# Backend deployment candidate

MTGSCAN-277 prepares configuration and requires provider-backed validation plus a sanitized summary of the actual provider plans. It does not activate the backend.
MTGSCAN-278 requires explicit owner approval before activation. Replan and review again if source, state or external image digests have changed.
No provider plan, image build, apply, Vault write, job submission or production query was performed for this candidate.

## Repository ownership

`Dockerfile`, `.dockerignore` and Rust sources belong to mtgscan.
[mtgscan-277-homelab.patch](mtgscan-277-homelab.patch) is an exact candidate patch for the homelab repository.
It has not been applied there.
The parent must arrange a prepared homelab checkout before source changes.
Do not edit the active owner checkout.

The patch was prepared against homelab commit `f2413e0dc9760e29ea728338e0d32b120436a3c0` and its inspected nonsecret conventions.
The active checkout had owner changes, including `terraform/services/grafana.tf`.
The patch does not touch that file or any Ansible file.
Recheck all local changes before applying the candidate to a prepared checkout.

## Candidate configuration

- Add `mtgscan` to the platform root's existing namespace map.
- Add one `module "mtgscan"` using `../modules/service` in the services root.
- Build `mtgscan:<source hash prefix>` on the existing host Docker daemon.
- Run one stateless backend process in the `mtgscan` namespace.
- Use the existing module's Consul discovery, local DNS, public Cloudflare CNAME and Traefik HTTPS tags at `https://mtgscan.reilley.dev`.
- Use the existing templated Vault workload-identity policy. No new Vault policy or host volume is needed.
- Discover `alloy-otlp` through Consul and send OTLP gRPC metrics, logs and traces to its dynamic address.
- Add `https://mtgscan.reilley.dev/health` to `local.public_services`.
  This updates the existing Prometheus probe configuration and the existing Grafana availability and TLS rule groups.
  The public-services dashboard already queries all service labels.

The origin belongs to both API and MCP adapters in the same process.
This ticket does not implement MCP or claim its streaming path works.
Do not create another job or origin for it.

Set the required nonsecret `mtgscan_repository` Terraform variable to the absolute path of the reviewed mtgscan source checkout.
Do not use an unreviewed active checkout just because its path is convenient.
The image tag hashes sorted relative paths and file content digests for:

- `Cargo.toml`, `Cargo.lock`, `mise.toml`, `Dockerfile` and `.dockerignore`;
- every workspace crate manifest;
- every crate's `src` files, including SQL included by the persistence adapter.

The Docker context allowlist matches those source inputs.
Environment files, git metadata, native apps, build output and owner data do not enter the image.
Mise reads the Rust version from root `mise.toml` inside the build stage.
There is no second Rust pin, registry publication or Compose deployment.
The image version label is content-derived. There is no changing commit label that rebuilds an otherwise unchanged image.
Changes to external base images and downloaded dependencies are not attested by a source hash. The lockfile fixes Rust dependencies; this candidate has not built or attested the container.

## Secret contract

The job renders only these Vault fields from `kv/data/mtgscan/mtgscan` into the task environment:

| Vault field | Task variable | Requirement |
| --- | --- | --- |
| `supabase_url` | `SUPABASE_URL` | Approved managed project URL |
| `supabase_publishable_key` | `SUPABASE_PUBLISHABLE_KEY` | Publishable key, never a service-role key |
| `collection_database_url` | `COLLECTION_DATABASE_URL` | Dedicated `mtgscan_collection_reader` role, TLS, approved endpoint |

The template quotes values as JSON for the environment parser and fails on missing keys.
No values are Terraform inputs, Docker arguments, labels or job variables.
The existing Nomad workload identity supplies Vault access through `vault {}`.
No Vault values were read or written for this work.

Before activation, verify IPv6 from the actual allocation before choosing an IPv6-only direct database endpoint.
The configured Nomad bridge is IPv4.
Otherwise use an approved IPv4-compatible Supabase session-pooler endpoint with TLS certificate verification.
Do not use blanket database-owner access or transaction pooling as a shortcut.
The existing pool is bounded to five connections per process, including readiness probes.
Allow for ten connections while old and canary allocations coexist.

## Health and shutdown

`GET /health/live` reports process liveness without touching Supabase.
`GET /health` reports cached dependency readiness.
Both return a minimal body and `Cache-Control: no-store`.
Readiness starts at 503.
A background probe checks Auth's health endpoint and verifies the dedicated Postgres role without querying collection data.
Each probe is bounded to one second. It runs again after a five-second wait.
An outage makes readiness 503. Recovery restores 200.
The HTTP listener and liveness stay available during an outage, including at startup.
Read operations still verify the dedicated role before accessing copies.

The Nomad readiness check controls discovery and deployment health, but has no `check_restart`.
Only the liveness check has a restart threshold of three failures after a 30-second grace period.
The job uses one canary, automatic promotion, automatic rollback, a ten-second healthy period, a two-minute healthy deadline and a three-minute progress deadline.
A first failed deployment with no previous version cannot roll back to a nonexistent allocation.

Nomad deregisters the old allocation and waits five seconds before termination.
The process handles both SIGTERM and Ctrl-C.
It marks readiness unavailable permanently before asking Axum to stop accepting requests.
In-flight requests may drain for twenty seconds, including future MCP streams.
A later successful probe cannot undo draining.
Telemetry shutdown follows draining on a blocking worker.
Trace and log shutdown each request a one-second budget.
The SDK metric reader uses its own five-second shutdown wait.
Nomad's thirty-second kill timeout is the final process bound.
Process signals, connection draining through Traefik and stream interruption still require manual verification after deployment approval.

## Telemetry boundary

Rust creates all three OTLP exporters and SDK providers explicitly.
HTTP requests emit a request counter, a response-header latency histogram, a server span and a trace-correlated log record.
Labels contain only the known HTTP method, matched route template and response status.
Unknown methods become `OTHER`. Unmatched paths become `unmatched`.
No request headers, raw paths, query strings, bodies, account IDs, copy IDs, tokens or errors from external systems are recorded.
Server failures mark the span as an error with a fixed description.
The histogram measures time to response headers, not the lifetime of a future streaming response.
The existing Alloy receiver already forwards all three signals to Prometheus, Loki and Tempo. It needs no new receiver or host mount.
Unit tests replace exporters with in-memory SDK exporters. They do not prove delivery to Alloy.

## Offline evidence and limits

The implementation evidence lives under `/tmp/mtgscan-273-implementation/277-*` for the parent handoff.

- Rust unit tests run through the real health router and telemetry middleware with mocked Supabase probes and in-memory exporters.
- Mutations demonstrate failures for readiness after shutdown, a broken request count and a leaked unmatched path.
- Terraform formatting passes for the candidate service definition.
- Provider-free Terraform validation covers only the hash locals, not provider schemas or the service module.
- Terraform evaluates the actual template with synthetic module inputs. Nomad normalizes and parses that rendered job with `job run -output`. This flag does not submit a job.
- Bounded manual expression mutations cover eight source input changes, a renamed SQL source and four ignored paths.
- `git apply --check` confirms the candidate patch applies without writing to homelab.

No actual provider plan, server-side Nomad validation, allocation-network check, Docker build or live telemetry probe has been run.
Do not equate template parsing or mocked tests with those checks.
Native builds and device work were not needed and were not run.

## Safe plan handoff

1. Arrange a prepared homelab checkout and preserve all owner work.
2. Recheck the patch against current module, Vault, Alloy and monitoring conventions. Apply it only to that prepared checkout.
3. Select the reviewed mtgscan source checkout with `mtgscan_repository`. Record its commit and content-derived tag privately with the plan evidence.
4. Run formatting and provider-backed validation in the prepared environment without copying credentials, state or saved plans into either repository.
5. Have the authorized operator produce and inspect the actual platform and services plans. Keep the raw output and any saved plan private. Report only resource addresses, action categories, counts and sanitized reasons. Do not send raw plan JSON, values or credentials to an agent log.
6. Separate intended changes from owner work, replacements and unrelated image-digest changes. Stop on any unexplained resource change.
7. Ask for explicit approval of that actual plan before any apply, Vault write, job mutation or host change. This candidate is not approval.

Expected scope from configuration only, not observed plan actions:

| Root | Candidate effect |
| --- | --- |
| Platform | Add `nomad_namespace.this["mtgscan"]` |
| Services | Add `module.mtgscan.docker_image.build[0]`, `module.mtgscan.nomad_job.job`, `module.mtgscan.cloudflare_dns_record.dns[0]`, `module.mtgscan.unifi_dns_record.local[0]` |
| Services | Update the Prometheus job and the public availability and TLS Grafana rule groups |

Expected candidate creates are five resources across both roots.
Expected existing-resource changes are three.
No replacement is intended. Actual creates, changes and replacements are unknown until an authorized provider plan.
Unrelated digest changes are also unknown. The service module resolves other image tags at plan time, so a fresh plan may include them even though this patch does not touch them.
No targeted apply or ignored drift should hide those changes.

MTGSCAN-277 remains partial until provider-backed validation and an observed, sanitized platform/services plan summary are recorded, including replacements and unrelated image-digest changes. The expected counts above do not satisfy that gate.

Activation gates belong to MTGSCAN-278: explicit approval of the reviewed current plan, approved secret provisioning, compatible schema and role verification, allocation-network TLS connectivity, public DNS and certificates, authentication, Alloy delivery, canary rollback, and public incremental MCP streaming when its adapter exists.
Do not mark the endpoint ready from this candidate.
