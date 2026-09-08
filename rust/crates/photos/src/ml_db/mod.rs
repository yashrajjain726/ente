mod caches;
mod clip;
mod codec;
mod constants;
mod filedata;
mod schema;
mod types;

use std::path::Path;

use crate::db::Database;

pub use clip::{
    CLIP_EMBEDDING_BYTES_LENGTH, CLIP_EMBEDDING_DIMENSIONS, CLIP_ML_VERSION, ClipEmbedding,
    ClipRow, EmbeddingVector,
};
pub use codec::{decode_evector, decode_f32, encode_evector, encode_f32};
pub use constants::{
    FACE_ML_VERSION, LAPLACIAN_HARD_THRESHOLD, LAPLACIAN_SOFT_THRESHOLD,
    LAPLACIAN_VERY_SOFT_THRESHOLD, MEDIUM_QUALITY_FACE_SCORE, MINIMUM_QUALITY_FACE_SCORE,
    PET_ML_VERSION, is_bad_face_for_clustering,
};
pub use filedata::{FdStatus, PreviewInfo};
pub use types::{
    ClusterCentroidRow, ClusterSummary, FaceDbInfoForClustering, FaceRow, FaceWithoutEmbedding,
    PetBodyRow, PetBodyVectorRow, PetFaceRow, PetFaceVectorRow, PetRowsForFiles,
};

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
            db: Database::open(path, &schema::MIGRATION_SCRIPTS)?,
        })
    }

    pub fn clear_non_pet_tables(&self) -> Result<()> {
        self.db
            .execute_statements([
                schema::DELETE_FACES,
                schema::DELETE_FACE_CLUSTERS,
                schema::DELETE_CLUSTER_PERSON,
                schema::DELETE_CLUSTER_SUMMARY,
                schema::DELETE_CLUSTER_CENTROID_VECTOR_ID_MAPPING,
                schema::DELETE_NOT_PERSON_FEEDBACK,
                schema::DELETE_CLIP_EMBEDDINGS,
                schema::DELETE_FILE_DATA,
            ])
            .map_err(Into::into)
    }

    pub fn clear_pet_tables(&self) -> Result<()> {
        self.db
            .execute_statements([
                schema::DELETE_PET_FACES,
                schema::DELETE_PET_BODIES,
                schema::DELETE_PET_FACE_VECTOR_ID_MAPPING,
                schema::DELETE_PET_BODY_VECTOR_ID_MAPPING,
            ])
            .map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::fmt::Debug;
    use std::path::Path;

    use super::clip::tests::full_clip;
    use super::{Error, MlDb, TARGET_VERSION, caches, clip, filedata};
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

    fn index_count(path: &Path) -> i64 {
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

    fn seeded() -> (TempDir, MlDb) {
        let (directory, db) = open();
        clip::tests::seed(&db);
        filedata::tests::seed(&db);
        caches::tests::seed(&db);
        (directory, db)
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

    #[test]
    fn clear_non_pet_tables_leaves_pets_and_caches() {
        let (_directory, db) = seeded();
        db.clear_non_pet_tables().unwrap();
        assert_eq!(db.count_clip_rows().unwrap(), 0);
        assert!(db.get_file_ids_with_fd_data(None).unwrap().is_empty());
        assert_eq!(
            db.get_face_id_used_for_person_or_cluster("p1").unwrap(),
            Some("1_0".to_string())
        );
        assert_eq!(
            db.get_repeated_text_embedding_cache("dog").unwrap(),
            Some(vec![0.5f32, -1.0])
        );
    }

    #[test]
    fn clear_pet_tables_leaves_non_pet_tables() {
        let (directory, db) = seeded();
        let connection = Connection::open(directory.path().join("ente.ml.db")).unwrap();
        connection
            .execute_batch(
                "INSERT INTO pet_face_vector_id_map (pet_face_id) VALUES ('1_pet_0');
                 INSERT INTO pet_body_vector_id_map (pet_body_id) VALUES ('1_body_0');",
            )
            .unwrap();
        db.clear_pet_tables().unwrap();
        let row_count = |table: &str| -> i64 {
            connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), (), |row| {
                    row.get(0)
                })
                .unwrap()
        };
        assert_eq!(row_count("pet_face_vector_id_map"), 0);
        assert_eq!(row_count("pet_body_vector_id_map"), 0);
        assert_eq!(db.count_clip_rows().unwrap(), 4);
        assert_eq!(
            db.get_file_ids_with_fd_data(None).unwrap(),
            HashSet::from([1, 2, 3])
        );
        assert_eq!(
            db.get_face_id_used_for_person_or_cluster("p1").unwrap(),
            Some("1_0".to_string())
        );
    }
}
