#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Sqlite(#[from] crate::db::Error),
    #[error("currentVersion({current}) cannot be greater than toVersion({target})")]
    Downgrade { current: i64, target: i64 },
    #[error("{0}")]
    Codec(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    InvalidArgument(String),
}

pub type Result<T> = std::result::Result<T, Error>;
