# Hosted database migrations

PR checks apply migrations to an isolated database. They do not apply them to the hosted database. A merge records reviewed migration files in `main`; it does not authorize or perform a hosted apply. Leave the affected feature off until the hosted apply and its checks pass.

## Before a hosted apply

- Get owner approval for the exact migration bytes, target, operator, recovery procedure, and maintenance window. Reserve an exclusive schema window from the final precheck through the postcheck. Stop while migration jobs are running or queued. Do not dispatch or rerun old hosted apply jobs during the window.
- Merge only the reviewed migration change after required isolated checks pass. Verify the resulting `main` tree and compare it with the approved source. Use a clean private snapshot of that tree, not a workspace with local edits.
- Verify the direct database endpoint, CA and hostname, writable primary, expected login and effective role, migration ledger, and the required object ownership and grants. Use a separately approved read-only catalog and ledger check, not `db push` as a probe. Stop on drift or an unverified recovery path.

## Run and verify

Use the pinned Supabase CLI with an explicit direct connection URI set to `sslmode=verify-full` and the approved CA file, and a password supplied separately through the operator's secure input. Keep secrets out of the command line, output and repository. Do not use `supabase link`, a pooler fallback, an automatic confirmation, or the flags that include extra migrations, roles or seed data. Use `--skip-vault`. Confirm only the exact approved list shown by the CLI, at the agreed execution and lock limits.

After one apply, verify the ledger and the affected definitions and permissions. Verify the existing app and MCP connection as approved before turning on the replacement routes. If the apply fails or its state is uncertain, stop. Keep the affected feature off, record what actually applied, and review a correction. Do not blindly rerun, repair the ledger, or restore over a live database.
