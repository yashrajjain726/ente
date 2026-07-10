use ente_core::{auth::AuthError, crypto, http};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ContactsError {
    #[error(transparent)]
    Http(#[from] http::Error),

    #[error(transparent)]
    Crypto(#[from] crypto::Error),

    #[error(transparent)]
    Auth(#[from] AuthError),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("missing encrypted data for live contact")]
    MissingEncryptedData,

    #[error("missing encrypted key for live contact")]
    MissingEncryptedKey,

    #[error("profile picture not found")]
    ProfilePictureNotFound,

    #[error("a recovery is already in progress")]
    ActiveRecoverySession,
}

pub type Result<T> = std::result::Result<T, ContactsError>;
