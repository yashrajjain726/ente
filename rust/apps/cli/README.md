WIP Ente Rust CLI.

## Development

```sh
cargo run --bin ente-rs -- --help
```

## Integration tests

The integration tests run against a live Museum spun up by
[ente-test-support](../../crates/test-support) (see the
[setup instructions](../../README.md#integration-tests)). They
are gated behind the `museum` Cargo feature, so a plain `cargo test -p ente-rs`
skips them. To run them:

```sh
cargo test -p ente-rs --features museum
```
