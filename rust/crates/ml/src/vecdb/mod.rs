use std::path::{Path, PathBuf};

use thiserror::Error;

mod arena;
mod crc;
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

#[derive(Debug, Clone, PartialEq)]
pub struct KeyMatches {
    pub key: String,
    pub matches: Vec<Match>,
    pub truncated: bool,
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
    #[error("vector db was deleted")]
    Closed,
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
    #[error("length mismatch: {keys} keys, {vectors} vectors")]
    LengthMismatch { keys: usize, vectors: usize },
}

impl VecDbError {
    pub(crate) fn io(path: &Path, source: std::io::Error) -> Self {
        Self::Io {
            path: path.to_path_buf(),
            source,
        }
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::graph::Graph;

    pub(crate) fn assert_identical_graphs(first: &Graph, second: &Graph) {
        assert_eq!(first.entry_point(), second.entry_point());
        assert_eq!(
            first.slots().collect::<Vec<_>>(),
            second.slots().collect::<Vec<_>>()
        );
        for slot in first.slots() {
            assert_eq!(first.level_of(slot), second.level_of(slot));
            let level = first.level_of(slot).unwrap();
            for layer in 0..=level {
                assert_eq!(
                    first.neighbors_of(slot, layer),
                    second.neighbors_of(slot, layer)
                );
            }
        }
    }

    pub(crate) fn stale_downward_edge_exists(graph: &Graph) -> bool {
        graph.slots().any(|slot| {
            let level = graph.level_of(slot).unwrap();
            (0..=level).any(|layer| {
                graph
                    .neighbors_of(slot, layer)
                    .iter()
                    .any(|&neighbor| graph.level_of(neighbor).unwrap() < layer)
            })
        })
    }
}
