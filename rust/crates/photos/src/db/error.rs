#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Sqlite(#[from] super::SqliteError),
    #[error("currentVersion({current}) cannot be greater than toVersion({target})")]
    Downgrade { current: i64, target: i64 },
}

pub type Result<T> = std::result::Result<T, Error>;
