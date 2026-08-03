use ente_core::{b64, crypto, http};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error(transparent)]
    Http(#[from] http::Error),

    #[error(transparent)]
    Crypto(#[from] crypto::Error),

    #[error("base64 decode error: {0}")]
    Base64Decode(#[from] b64::DecodeError),

    #[error(transparent)]
    Accounts(#[from] ente_accounts::Error),

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErrorKind {
    Network,
    Http,
    Parse,
    Crypto,
    Auth,
    InvalidInput,
    MissingEncryptedData,
    MissingEncryptedKey,
    ProfilePictureNotFound,
    ActiveRecoverySession,
}

impl Error {
    pub fn kind(&self) -> ErrorKind {
        match self {
            Error::Http(http::Error::Network(_)) => ErrorKind::Network,
            Error::Http(http::Error::Parse(_)) => ErrorKind::Parse,
            Error::Http(_) => ErrorKind::Http,
            Error::Crypto(_) => ErrorKind::Crypto,
            Error::Base64Decode(_) => ErrorKind::Crypto,
            Error::Accounts(_) => ErrorKind::Auth,
            Error::InvalidInput(_) => ErrorKind::InvalidInput,
            Error::MissingEncryptedData => ErrorKind::MissingEncryptedData,
            Error::MissingEncryptedKey => ErrorKind::MissingEncryptedKey,
            Error::ProfilePictureNotFound => ErrorKind::ProfilePictureNotFound,
            Error::ActiveRecoverySession => ErrorKind::ActiveRecoverySession,
        }
    }

    pub fn status(&self) -> Option<u16> {
        match self {
            Error::Http(error) => error.status_code(),
            _ => None,
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;
