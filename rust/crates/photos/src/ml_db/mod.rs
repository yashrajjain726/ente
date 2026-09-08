mod caches;
mod clusters;
mod faces;
mod filedata;
mod persons;
mod pets;
mod queries;
mod schema;
mod vector_encoding;

use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::db::{Database, OpenOptions};

pub use filedata::{FdStatus, PreviewInfo};
pub use persons::PersonToClusterIdToFaceIds;
pub use queries::{
    CLIP_EMBEDDING_BYTES_LENGTH, CLIP_EMBEDDING_DIMENSIONS, CLIP_ML_VERSION, ClipEmbedding,
    ClipRow, ClusterCentroidRow, ClusterSummary, EmbeddingVector, FACE_ML_VERSION,
    FaceDbInfoForClustering, FaceRow, FaceWithoutEmbedding, LAPLACIAN_HARD_THRESHOLD,
    LAPLACIAN_SOFT_THRESHOLD, LAPLACIAN_VERY_SOFT_THRESHOLD, MEDIUM_QUALITY_FACE_SCORE,
    MINIMUM_QUALITY_FACE_SCORE, PET_ML_VERSION, PetBodyRow, PetBodyVectorRow, PetFaceRow,
    PetFaceVectorRow, PetRowsForFiles, is_bad_face_for_clustering,
};
pub use vector_encoding::{decode_evector, decode_f32, encode_evector, encode_f32};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Database(#[from] crate::db::Error),
    #[error("{0}")]
    Codec(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    InvalidArgument(String),
}

pub type Result<T> = std::result::Result<T, Error>;

pub const TARGET_VERSION: i64 = schema::MIGRATION_SCRIPTS.len() as i64;

pub struct MlDb {
    db: Database,
}

impl MlDb {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Ok(Self {
            db: Database::open_with_options(
                path,
                &schema::MIGRATION_SCRIPTS,
                OpenOptions { reader_count: 2 },
            )?,
        })
    }
}

fn file_id_to_cluster_ids(
    cluster_and_face_ids: Vec<(String, String)>,
) -> Result<HashMap<i64, HashSet<String>>> {
    let mut result: HashMap<i64, HashSet<String>> = HashMap::new();
    for (cluster_id, face_id) in cluster_and_face_ids {
        let file_id = file_id_from_face_id(&face_id)?;
        result.entry(file_id).or_default().insert(cluster_id);
    }
    Ok(result)
}

fn file_id_from_face_id(face_id: &str) -> Result<i64> {
    try_file_id_from_face_id(face_id)
        .ok_or_else(|| Error::Codec(format!("Error parsing faceId: {face_id}")))
}

fn try_file_id_from_face_id(face_id: &str) -> Option<i64> {
    face_id
        .split_once('_')
        .and_then(|(file_id, _)| file_id.parse().ok())
}

fn unique_in_order(ids: &[String]) -> Vec<&str> {
    let mut seen = HashSet::new();
    ids.iter()
        .map(String::as_str)
        .filter(|id| seen.insert(*id))
        .collect()
}

fn limit_clause(limit: Option<i64>) -> &'static str {
    if limit.is_some() { " LIMIT ?" } else { "" }
}

fn non_empty<T>(rows: Vec<T>) -> Option<Vec<T>> {
    (!rows.is_empty()).then_some(rows)
}

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, HashSet};
    use std::fmt::Debug;
    use std::path::Path;

    use super::queries::tests::full_clip;
    use super::{Error, MlDb, TARGET_VERSION};
    use crate::db::Connection;
    use tempfile::TempDir;

    type Query<T> = fn(&MlDb) -> Result<T, Error>;

    macro_rules! cases {
        ($($name:literal: $expected:expr => |$db:ident| $query:expr),* $(,)?) => {
            [$(($name, $expected, |$db| $query)),*]
        };
    }

    pub(super) use cases;

    pub(super) fn open() -> (TempDir, MlDb) {
        let directory = tempfile::tempdir().unwrap();
        let db = MlDb::open(directory.path().join("ente.ml.db")).unwrap();
        (directory, db)
    }

    fn user_version(path: &Path) -> i64 {
        Connection::open(path)
            .unwrap()
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap()
    }

    pub(super) fn index_count(path: &Path) -> i64 {
        Connection::open(path)
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_fcClusterID'",
                (),
                |row| row.get(0),
            )
            .unwrap()
    }

    pub(super) fn check<T: PartialEq + Debug>(db: &MlDb, cases: &[(&str, T, Query<T>)]) {
        for (name, expected, query) in cases {
            assert_eq!(&query(db).unwrap(), expected, "{name}");
        }
    }

    fn strings_of<C: FromIterator<String>>(values: &[&str]) -> C {
        values.iter().map(|value| value.to_string()).collect()
    }

    pub(super) fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
        strings_of(&values)
    }

    pub(super) fn set<const N: usize>(values: [&str; N]) -> HashSet<String> {
        strings_of(&values)
    }

    pub(super) fn ids<const N: usize>(values: [i64; N]) -> HashSet<i64> {
        HashSet::from(values)
    }

    pub(super) fn pairs<V, const N: usize>(entries: [(&str, V); N]) -> HashMap<String, V> {
        entries
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect()
    }

    pub(super) fn map<const N: usize>(entries: [(&str, &str); N]) -> HashMap<String, String> {
        pairs(entries.map(|(key, value)| (key, value.to_string())))
    }

    pub(super) fn grouped<C: FromIterator<String>, const N: usize>(
        entries: [(&str, &[&str]); N],
    ) -> HashMap<String, C> {
        pairs(entries.map(|(key, values)| (key, strings_of(values))))
    }

    pub(super) fn grouped_by_file<const N: usize>(
        entries: [(i64, &[&str]); N],
    ) -> HashMap<i64, HashSet<String>> {
        entries
            .into_iter()
            .map(|(file_id, values)| (file_id, strings_of(values)))
            .collect()
    }

    pub(super) fn sorted<T: Ord>(mut values: Vec<T>) -> Vec<T> {
        values.sort();
        values
    }

    #[test]
    fn ml_db_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<MlDb>();
    }

    #[test]
    fn open_migrates_to_target_version_and_creates_all_tables() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("ente.ml.db");
        let _db = MlDb::open(&path).unwrap();
        assert_eq!(TARGET_VERSION, 15);
        assert_eq!(user_version(&path), 15);
        let connection = Connection::open(&path).unwrap();
        for table in [
            "faces",
            "face_clusters",
            "cluster_person",
            "cluster_summary",
            "not_person_feedback",
            "clip",
            "filedata",
            "face_cache",
            "text_embeddings_cache",
            "cluster_centroid_vector_id_map",
            "pet_faces",
            "pet_bodies",
            "pet_face_vector_id_map",
            "pet_body_vector_id_map",
        ] {
            let count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table {table}");
        }
        assert_eq!(index_count(&path), 1);
    }

    #[test]
    fn reopen_is_idempotent_and_keeps_data() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("ente.ml.db");
        {
            let db = MlDb::open(&path).unwrap();
            db.insert_clip_rows(&[full_clip(1)]).unwrap();
        }
        let db = MlDb::open(&path).unwrap();
        assert_eq!(user_version(&path), 15);
        assert_eq!(db.count_clip_rows().unwrap(), 1);
    }

    #[test]
    fn open_refuses_downgrade() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("ente.ml.db");
        drop(MlDb::open(&path).unwrap());
        Connection::open(&path)
            .unwrap()
            .pragma_update(None, "user_version", 16)
            .unwrap();
        match MlDb::open(&path) {
            Err(Error::Database(crate::db::Error::Downgrade { current, target })) => {
                assert_eq!(current, 16);
                assert_eq!(target, 15);
            }
            other => panic!("expected downgrade error, got {:?}", other.err()),
        }
    }

    #[test]
    fn partial_migration_runs_remaining_scripts() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("ente.ml.db");
        {
            let connection = Connection::open(&path).unwrap();
            connection
                .execute_batch(crate::ml_db::schema::CREATE_FACES_TABLE)
                .unwrap();
            connection.pragma_update(None, "user_version", 1).unwrap();
        }
        let db = MlDb::open(&path).unwrap();
        assert_eq!(user_version(&path), 15);
        assert_eq!(db.count_clip_rows().unwrap(), 0);
    }
}
