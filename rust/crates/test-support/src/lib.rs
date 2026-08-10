mod museum;
mod net;
mod object_store;
mod postgres;
mod process;
mod server;

pub use museum::Museum;

pub type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

pub const HARDCODED_OTT: &str = "123456";

pub const HARDCODED_OTT_EMAIL_SUFFIX: &str = "@example.org";

pub mod account_fixture {
    pub const PASSWORD: &str = "museum-account-fixture-password";
    // Argon2id(PASSWORD, 16 × 0x4d, 256 MiB, 16 ops).
    pub const KEK: &str = "EwUWye3Qiu3bep2oujaO8oJvUgIdn0DSOk2g0oZ+AWs=";
    pub const KEK_SALT: &str = "TU1NTU1NTU1NTU1NTU1NTQ==";
    pub const MEM_LIMIT: u32 = 268_435_456;
    pub const OPS_LIMIT: u32 = 16;
}
