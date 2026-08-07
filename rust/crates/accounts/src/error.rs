use ente_core::{b64, crypto, http};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
    #[error(transparent)]
    Http(#[from] http::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error(transparent)]
    Crypto(#[from] crypto::Error),

    #[error("Decode error: {0}")]
    Decode(String),

    #[error("Incorrect password")]
    IncorrectPassword,

    #[error("Incorrect recovery key")]
    IncorrectRecoveryKey,

    #[error("Invalid key attributes")]
    InvalidKeyAttributes,

    #[error("Failed to derive key (insufficient memory)")]
    InsufficientMemory,

    #[error("Missing required field: {0}")]
    MissingField(&'static str),

    #[error("Invalid key: {0}")]
    InvalidKey(String),

    #[error("SRP error: {0}")]
    Srp(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Too many incorrect email verification attempts. Please wait and request a new code.")]
    EmailVerificationRateLimited,

    #[error("Too many incorrect TOTP attempts. Please restart login.")]
    TotpRateLimited,

    #[error("Second factor session expired. Please restart login.")]
    SecondFactorSessionExpired,

    #[error("Account key attributes are not available")]
    MissingKeyAttributes,

    #[error(
        "Email already has server-side key state; use the existing account or recover the incomplete signup instead of creating a new account."
    )]
    AccountAlreadyExists,

    #[error("{0}")]
    Protocol(String),

    #[error(transparent)]
    Ui(Box<dyn std::error::Error + Send + Sync>),
}

impl Error {
    pub fn status_code(&self) -> Option<u16> {
        match self {
            Error::Http(error) => error.status_code(),
            _ => None,
        }
    }

    pub fn is_http_status(&self, statuses: &[u16]) -> bool {
        self.status_code()
            .is_some_and(|status| statuses.contains(&status))
    }
}

impl From<b64::DecodeError> for Error {
    fn from(err: b64::DecodeError) -> Self {
        Error::Decode(err.to_string())
    }
}
