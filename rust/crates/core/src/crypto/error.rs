use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Invalid key length: expected {expected}, got {actual}")]
    InvalidKeyLength { expected: usize, actual: usize },

    #[error("Invalid nonce length: expected {expected}, got {actual}")]
    InvalidNonceLength { expected: usize, actual: usize },

    #[error("Invalid salt length: expected {expected}, got {actual}")]
    InvalidSaltLength { expected: usize, actual: usize },

    #[error("Invalid header length: expected {expected}, got {actual}")]
    InvalidHeaderLength { expected: usize, actual: usize },

    #[error("Ciphertext too short: minimum {minimum}, got {actual}")]
    CiphertextTooShort { minimum: usize, actual: usize },

    #[error("Invalid key derivation parameters: {0}")]
    InvalidKeyDerivationParams(String),

    #[error("Key derivation failed")]
    KeyDerivationFailed,

    #[error("Encryption failed")]
    EncryptionFailed,

    #[error("Decryption failed")]
    DecryptionFailed,

    #[error("Stream initialization failed")]
    StreamInitFailed,

    #[error("Stream push failed")]
    StreamPushFailed,

    #[error("Stream pull failed")]
    StreamPullFailed,

    #[error("Stream truncated: EOF before final tag")]
    StreamTruncated,

    #[error("Stream has trailing data after final tag")]
    StreamTrailingData,

    #[error("Sealed box open failed")]
    SealedBoxOpenFailed,

    #[error("Invalid public key")]
    InvalidPublicKey,

    #[error("JSON error: {0}")]
    Json(String),

    #[error("Argon2 error: {0:?}")]
    Argon2(argon2::Error),

    #[error("AEAD error")]
    Aead,

    #[error("Array conversion error")]
    ArrayConversion,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl Error {
    // Bindings expose these strings to non-Rust callers.
    pub fn code(&self) -> &'static str {
        match self {
            Error::InvalidKeyLength { .. } => "invalid_key_length",
            Error::InvalidNonceLength { .. } => "invalid_nonce_length",
            Error::InvalidSaltLength { .. } => "invalid_salt_length",
            Error::InvalidHeaderLength { .. } => "invalid_header_length",
            Error::CiphertextTooShort { .. } => "ciphertext_too_short",
            Error::InvalidKeyDerivationParams(_) => "invalid_kdf_params",
            Error::KeyDerivationFailed => "key_derivation_failed",
            Error::EncryptionFailed => "encryption_failed",
            Error::DecryptionFailed => "decryption_failed",
            Error::StreamInitFailed => "stream_init_failed",
            Error::StreamPushFailed => "stream_push_failed",
            Error::StreamPullFailed => "stream_pull_failed",
            Error::StreamTruncated => "stream_truncated",
            Error::StreamTrailingData => "stream_trailing_data",
            Error::SealedBoxOpenFailed => "sealed_box_open_failed",
            Error::InvalidPublicKey => "invalid_public_key",
            Error::Json(_) => "json",
            Error::Argon2(_) => "argon2",
            Error::Aead => "aead",
            Error::ArrayConversion => "array_conversion",
            Error::Io(_) => "io",
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;

impl From<std::array::TryFromSliceError> for Error {
    fn from(_: std::array::TryFromSliceError) -> Self {
        Error::ArrayConversion
    }
}
