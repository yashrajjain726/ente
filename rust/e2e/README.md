# Rust E2E

Rust tests should live in the crate whose behavior they cover, whether they
are unit, integration, or end-to-end tests. This crate houses existing
cross-crate tests while they are moved to their owning crates incrementally.

[ente-test-support](../crates/test-support) provides the shared Museum,
Postgres, and object-storage harness; individual crates do not need to
duplicate that infrastructure. Tests using the harness are gated behind the
`museum` Cargo feature:

```sh
cargo test -p ente-e2e --features museum
```

To skip or select stages:

```sh
ENTE_E2E_SKIP=legacy_kit_recovery_e2e cargo test -p ente-e2e --features museum
ENTE_E2E_ONLY=legacy_contact_recovery_e2e cargo test -p ente-e2e --features museum
```
