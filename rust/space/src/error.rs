use ente_core::{auth::AuthError, crypto::CryptoError, http::Error as HttpError};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SpaceError {
    #[error(transparent)]
    Http(#[from] HttpError),

    #[error(transparent)]
    Crypto(#[from] CryptoError),

    #[error(transparent)]
    Auth(#[from] AuthError),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("missing secret key material")]
    MissingSecretKey,

    #[error("missing encrypted space key")]
    MissingEncryptedSpaceKey,

    #[error("entity key conflict")]
    EntityKeyConflict,
}

pub type Result<T> = std::result::Result<T, SpaceError>;
