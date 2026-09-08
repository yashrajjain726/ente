pub mod api;

#[cfg(feature = "flutter")]
#[expect(
    unsafe_code,
    clippy::allow_attributes,
    clippy::allow_attributes_without_reason,
    reason = "Flutter Rust Bridge generates unsafe bindings and allow attributes without reasons"
)]
#[rustfmt::skip]
mod frb_generated;
