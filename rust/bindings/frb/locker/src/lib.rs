pub mod api;

#[cfg(feature = "flutter")]
#[expect(
    clippy::allow_attributes,
    clippy::allow_attributes_without_reason,
    reason = "Flutter Rust Bridge generates allow attributes without reasons"
)]
#[rustfmt::skip]
mod frb_generated;
