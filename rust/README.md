# Rust

Cargo workspace for Ente's Rust code.

## Development

```sh
cargo fmt        # Format
cargo clippy     # Lint
cargo build      # Build
cargo test       # Test

cargo run --bin ente-rs -- --help   # Run the Ente Rust CLI
```

CI runs with `RUSTFLAGS="-D warnings"` so warnings will cause checks to fail.

Other useful commands:

```sh
cargo codegen native  # Regenerate bindings used by native apps
cargo codegen frb     # Regenerate bindings used by Flutter apps
cargo codegen napi    # Regenerate bindings used by Desktop (Electron) apps
```

## Integration tests

Integration tests use [ente-test-support](crates/test-support) to start a local
Museum backed by temporary Postgres and object storage. They require `go` on
`PATH` to build and run Museum. The Postgres binary
([postgresql_embedded](https://crates.io/crates/postgresql_embedded)) is downloaded
and cached on first use.

These tests are gated behind the `museum` feature, so a plain `cargo test` skips
them. To run them:

```sh
cargo test --features museum,ente-ml/ml-assets
```
