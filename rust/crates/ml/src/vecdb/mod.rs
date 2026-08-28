use std::path::PathBuf;

use thiserror::Error;

mod arena;
mod graph;
mod kernel;
mod lock;
mod log;
mod snapshot;
mod store;

pub use store::{Stats, VecDb};

#[derive(Debug, Clone, Default)]
pub struct SearchParams {
    pub limit: Option<usize>,
    pub max_distance: Option<f32>,
    pub exact: bool,
    pub allowed_keys: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Match {
    pub key: String,
    pub distance: f32,
}

#[derive(Debug, Error)]
pub enum VecDbError {
    #[error("{}: {source}", path.display())]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("corrupt vector db: {0}")]
    Corrupt(String),
    #[error("{}: locked by another writer", .0.display())]
    Locked(PathBuf),
    #[error("vector db was opened read-only")]
    ReadOnly,
    #[error("invalid key: {0}")]
    InvalidKey(String),
    #[error("invalid vector: {0}")]
    InvalidVector(String),
    #[error("dimension mismatch: expected {expected}, got {actual}")]
    DimensionMismatch { expected: usize, actual: usize },
    #[error("invalid dimensions {0}: must be a nonzero multiple of 8")]
    InvalidDimensions(usize),
    #[error("search requires a limit or a max distance")]
    UnboundedSearch,
}
