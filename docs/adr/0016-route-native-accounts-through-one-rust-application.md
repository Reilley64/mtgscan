# Route native accounts through one Rust application

The approved MTGSCAN-273 conversion keeps mobile, API and future MCP presentation separate. API and MCP call one backend application layer and a framework-independent domain. Mobile calls the versioned API and cannot link that application implementation.

MTGSCAN-275 starts this path with native Apple and Google ID-token sign-in, Supabase Auth sessions and a current-account request. Identity infrastructure asks Supabase Auth to verify the exact bearer token before inspecting its authenticated claims. This preserves existing symmetric and asymmetric signing keys without distributing a signing secret or trusting decoded credentials alone.

## Consequences

The Rust path supersedes the legacy transport, SQL-only authority and React component test prescriptions only for migrated operations. Existing paths and checks stay in place until their own slices replace them. New automated tests are unit-only at the approved use-case, domain and presentation seams with external capabilities mocked.

The native current-account endpoint is a mobile session entry point. It refuses AI-client tokens rather than becoming an MCP entry point. This does not change the read permissions in ADR 0007. Future API collection reads must retain those permissions. Authority never comes from request owner fields or user metadata.

A fresh build downloads and verifies the pinned GPUI source into a user cache. It compiles a presentation-only static-library example inside that source workspace. This accommodates GPUI's experimental iOS workspace packaging without making the application depend on a previous agent's temporary checkout.
